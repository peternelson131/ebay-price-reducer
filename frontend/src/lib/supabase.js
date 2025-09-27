import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Database types for TypeScript-like experience
export const TABLES = {
  USERS: 'users',
  LISTINGS: 'listings',
  PRICE_HISTORY: 'price_history',
  SYNC_ERRORS: 'sync_errors',
  MONITOR_JOBS: 'monitor_jobs'
}

// Helper functions for common queries
export const listingsAPI = {
  // Get all listings for current user
  async getListings(filters = {}) {
    const { page = 1, limit = 20, status = 'Active' } = filters

    let query = supabase
      .from(TABLES.LISTINGS)
      .select(`
        *,
        price_history(price, reason, created_at),
        sync_errors(error_message, resolved, created_at)
      `)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      query = query.eq('listing_status', status)
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await query
      .range(from, to)
      .limit(limit)

    if (error) throw error

    return {
      listings: data,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    }
  },

  // Get single listing
  async getListing(id) {
    const { data, error } = await supabase
      .from(TABLES.LISTINGS)
      .select(`
        *,
        price_history(price, reason, created_at),
        sync_errors(error_message, resolved, created_at)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Create new listing
  async createListing(listing) {
    const { data, error } = await supabase
      .from(TABLES.LISTINGS)
      .insert(listing)
      .select()
      .single()

    if (error) throw error

    // Create initial price history entry
    await supabase
      .from(TABLES.PRICE_HISTORY)
      .insert({
        listing_id: data.id,
        price: listing.current_price,
        reason: 'initial'
      })

    return data
  },

  // Update listing
  async updateListing(id, updates) {
    const { data, error } = await supabase
      .from(TABLES.LISTINGS)
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Delete listing
  async deleteListing(id) {
    const { error } = await supabase
      .from(TABLES.LISTINGS)
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Record price reduction
  async recordPriceReduction(listingId, newPrice, reason = 'manual') {
    const { data: listing, error: fetchError } = await supabase
      .from(TABLES.LISTINGS)
      .select('reduction_interval')
      .eq('id', listingId)
      .single()

    if (fetchError) throw fetchError

    // Calculate next reduction date
    const nextReduction = new Date()
    nextReduction.setDate(nextReduction.getDate() + listing.reduction_interval)

    // Update listing
    const { data, error } = await supabase
      .from(TABLES.LISTINGS)
      .update({
        current_price: newPrice,
        last_price_reduction: new Date().toISOString(),
        next_price_reduction: nextReduction.toISOString()
      })
      .eq('id', listingId)
      .select()
      .single()

    if (error) throw error

    // Add to price history
    await supabase
      .from(TABLES.PRICE_HISTORY)
      .insert({
        listing_id: listingId,
        price: newPrice,
        reason
      })

    return data
  },

  // Get listings due for reduction
  async getListingsDueForReduction() {
    const { data, error } = await supabase
      .from(TABLES.LISTINGS)
      .select('*')
      .eq('listing_status', 'Active')
      .eq('price_reduction_enabled', true)
      .or(`next_price_reduction.is.null,next_price_reduction.lte.${new Date().toISOString()}`)
      .gt('current_price', 'minimum_price')

    if (error) throw error
    return data
  }
}

export const priceHistoryAPI = {
  async getPriceHistory(listingId) {
    const { data, error } = await supabase
      .from(TABLES.PRICE_HISTORY)
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data
  }
}

export const userAPI = {
  async getProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from(TABLES.USERS)
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) throw error
    return data
  },

  async updateProfile(updates) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from(TABLES.USERS)
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  }
}

export const authAPI = {
  async signUp(email, password, userData = {}) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    })

    if (error) throw error

    // Create user profile
    if (data.user) {
      await supabase
        .from(TABLES.USERS)
        .insert({
          id: data.user.id,
          email: data.user.email,
          name: userData.name || email.split('@')[0]
        })
    }

    return data
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  }
}