/**
 * Add Tracking to AfterShip
 * Creates a new tracking in AfterShip and updates the product
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AFTERSHIP_API_KEY = process.env.AFTERSHIP_API_KEY;
const AFTERSHIP_API_URL = 'https://api.aftership.com/tracking/2024-10';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { productId, trackingNumber, carrier } = JSON.parse(event.body);

    if (!productId || !trackingNumber) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Product ID and tracking number required' })
      };
    }

    // Get product to verify ownership
    const { data: product, error: productError } = await supabase
      .from('sourced_products')
      .select('id, user_id, asin, title')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Product not found' })
      };
    }

    // Create tracking in AfterShip
    const trackingData = {
      tracking_number: trackingNumber,
      title: product.title || `Product ${product.asin}`,
      customer_name: 'Product CRM User',
      order_id: product.asin,
      custom_fields: {
        product_id: productId,
        user_id: product.user_id
      }
    };

    // Add carrier if specified
    if (carrier) {
      trackingData.slug = carrier.toLowerCase();
    }

    try {
      const response = await axios.post(
        `${AFTERSHIP_API_URL}/trackings`,
        { tracking: trackingData },
        {
          headers: {
            'as-api-key': AFTERSHIP_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      const aftershipTracking = response.data.data.tracking;
      
      // Update product with tracking info
      const { error: updateError } = await supabase
        .from('sourced_products')
        .update({
          tracking_number: trackingNumber,
          aftership_tracking_id: aftershipTracking.id,
          carrier: aftershipTracking.slug,
          tracking_status: aftershipTracking.tag,
          tracking_updated_at: new Date().toISOString()
        })
        .eq('id', productId);

      if (updateError) {
        console.error('Error updating product:', updateError);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          tracking: {
            id: aftershipTracking.id,
            tracking_number: trackingNumber,
            carrier: aftershipTracking.slug,
            status: aftershipTracking.tag,
            tracking_url: `https://track.aftership.com/${aftershipTracking.slug}/${trackingNumber}`
          }
        })
      };

    } catch (apiError) {
      console.error('AfterShip API error:', apiError.response?.data || apiError.message);
      
      // If tracking already exists, that's okay - just update our product
      if (apiError.response?.status === 400 && apiError.response?.data?.meta?.code === 4003) {
        // Tracking already exists, just update our product
        const { error: updateError } = await supabase
          .from('sourced_products')
          .update({
            tracking_number: trackingNumber,
            carrier: carrier || null,
            tracking_updated_at: new Date().toISOString()
          })
          .eq('id', productId);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            message: 'Tracking already exists in AfterShip',
            tracking_number: trackingNumber
          })
        };
      }

      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to create tracking',
          details: apiError.response?.data?.meta?.message || apiError.message
        })
      };
    }

  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};