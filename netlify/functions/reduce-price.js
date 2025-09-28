const { Handler } = require('@netlify/functions')
const { supabase } = require('./utils/supabase')
const EbayService = require('./utils/ebay')

const handler = async (event, context) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
      }
    }
  }

  try {
    // Get user from JWT token
    const authHeader = event.headers.authorization
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Authorization required' })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid token' })
      }
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const pathParts = event.path.split('/')
    const listingId = pathParts[pathParts.length - 2] // Extract listing ID from path

    const { customPrice } = JSON.parse(event.body || '{}')

    // Get listing details
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('user_id', user.id)
      .single()

    if (listingError || !listing) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Listing not found' })
      }
    }

    // Calculate new price
    let newPrice
    if (customPrice) {
      newPrice = Math.max(customPrice, listing.minimum_price)
    } else {
      // Calculate based on strategy
      switch (listing.reduction_strategy) {
        case 'fixed_percentage':
          newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
          break
        case 'market_based':
          // For market-based, we'd need to call eBay API for market data
          // For now, fall back to fixed percentage
          newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
          break
        case 'time_based':
          // More aggressive reduction over time
          const daysListed = Math.ceil((new Date() - new Date(listing.start_time)) / (1000 * 60 * 60 * 24))
          const aggressiveFactor = Math.min(1 + (daysListed / 30) * 0.5, 2)
          newPrice = listing.current_price * (1 - (listing.reduction_percentage / 100) * aggressiveFactor)
          break
        default:
          newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
      }
    }

    newPrice = Math.max(newPrice, listing.minimum_price)
    newPrice = Math.round(newPrice * 100) / 100 // Round to 2 decimal places

    if (newPrice >= listing.current_price) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'New price must be lower than current price' })
      }
    }

    // Get user's eBay token
    const { data: userProfile } = await supabase
      .from('users')
      .select('ebay_user_token')
      .eq('id', user.id)
      .single()

    if (!userProfile?.ebay_user_token) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'eBay credentials not configured' })
      }
    }

    // Update price on eBay
    const ebayService = new EbayService()
    try {
      await ebayService.updateItemPrice(
        listing.ebay_item_id,
        newPrice,
        listing.currency,
        userProfile.ebay_user_token
      )
    } catch (ebayError) {
      // Log the error but continue with database update for demo purposes
      console.error('eBay API error:', ebayError)

      // In production, you might want to fail here
      // For demo, we'll continue and just log the error to console (sync_errors table removed)
      console.error('eBay price update error:', {
        listing_id: listing.id,
        error_message: `Failed to update price on eBay: ${ebayError.message}`,
        timestamp: new Date().toISOString(),
        resolved: false
      })
    }

    // Update listing in database
    const nextReduction = new Date()
    nextReduction.setDate(nextReduction.getDate() + listing.reduction_interval)

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update({
        current_price: newPrice,
        last_price_reduction: new Date().toISOString(),
        next_price_reduction: nextReduction.toISOString()
      })
      .eq('id', listingId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    // Log price change (price_history table removed)
    console.log(`Price change logged for listing ${listingId}: $${listing.current_price} -> $${newPrice} (${customPrice ? 'manual' : `${listing.reduction_strategy}_reduction`})`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        oldPrice: listing.current_price,
        newPrice,
        listing: updatedListing
      })
    }

  } catch (error) {
    console.error('Reduce price error:', error)

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    }
  }
}

module.exports = { handler }