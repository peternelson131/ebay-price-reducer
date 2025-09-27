// Demo/Mock version of Supabase client for testing without backend setup

// Mock data for demonstration
const mockListings = [
  {
    id: '1',
    ebay_item_id: '123456789',
    title: 'Vintage Camera - Canon AE-1 35mm Film Camera',
    description: 'Classic film camera in excellent condition',
    current_price: 189.99,
    original_price: 229.99,
    currency: 'USD',
    category: 'Electronics',
    category_id: '625',
    condition: 'Used',
    image_urls: ['https://picsum.photos/300/300?random=1'],
    listing_format: 'FixedPriceItem',
    quantity: 1,
    quantity_available: 1,
    listing_status: 'Active',
    start_time: '2024-01-15T00:00:00Z',
    end_time: '2024-02-15T00:00:00Z',
    view_count: 45,
    watch_count: 8,
    price_reduction_enabled: true,
    reduction_strategy: 'fixed_percentage',
    reduction_percentage: 5,
    minimum_price: 150.00,
    reduction_interval: 7,
    last_price_reduction: '2024-01-20T00:00:00Z',
    next_price_reduction: '2024-01-27T00:00:00Z',
    market_average_price: 195.50,
    market_lowest_price: 175.00,
    market_highest_price: 225.00,
    market_competitor_count: 15,
    last_market_analysis: new Date().toISOString(),
    last_synced_with_ebay: new Date().toISOString(),
    created_at: '2024-01-15T00:00:00Z',
    updated_at: new Date().toISOString(),
    price_history: [
      { price: 229.99, reason: 'initial', created_at: '2024-01-15T00:00:00Z' },
      { price: 218.49, reason: 'fixed_percentage_reduction', created_at: '2024-01-20T00:00:00Z' },
      { price: 189.99, reason: 'fixed_percentage_reduction', created_at: '2024-01-25T00:00:00Z' }
    ],
    sync_errors: []
  },
  {
    id: '2',
    ebay_item_id: '987654321',
    title: 'Apple iPhone 13 Pro - 128GB - Graphite (Unlocked)',
    description: 'iPhone in great condition with minor wear',
    current_price: 649.99,
    original_price: 749.99,
    currency: 'USD',
    category: 'Cell Phones & Smartphones',
    category_id: '9355',
    condition: 'Used',
    image_urls: ['https://picsum.photos/300/300?random=2'],
    listing_format: 'FixedPriceItem',
    quantity: 1,
    quantity_available: 1,
    listing_status: 'Active',
    start_time: '2024-01-10T00:00:00Z',
    end_time: '2024-02-10T00:00:00Z',
    view_count: 127,
    watch_count: 23,
    price_reduction_enabled: true,
    reduction_strategy: 'market_based',
    reduction_percentage: 3,
    minimum_price: 550.00,
    reduction_interval: 5,
    last_price_reduction: '2024-01-22T00:00:00Z',
    next_price_reduction: '2024-01-27T00:00:00Z',
    market_average_price: 675.00,
    market_lowest_price: 620.00,
    market_highest_price: 720.00,
    market_competitor_count: 28,
    last_market_analysis: new Date().toISOString(),
    last_synced_with_ebay: new Date().toISOString(),
    created_at: '2024-01-10T00:00:00Z',
    updated_at: new Date().toISOString(),
    price_history: [
      { price: 749.99, reason: 'initial', created_at: '2024-01-10T00:00:00Z' },
      { price: 699.99, reason: 'market_based_reduction', created_at: '2024-01-17T00:00:00Z' },
      { price: 649.99, reason: 'market_based_reduction', created_at: '2024-01-22T00:00:00Z' }
    ],
    sync_errors: []
  },
  {
    id: '3',
    ebay_item_id: '456789123',
    title: 'Nike Air Jordan 1 Retro High OG - Size 10.5',
    description: 'Classic sneakers in good condition',
    current_price: 145.00,
    original_price: 180.00,
    currency: 'USD',
    category: 'Athletic Shoes',
    category_id: '15709',
    condition: 'Used',
    image_urls: ['https://picsum.photos/300/300?random=3'],
    listing_format: 'FixedPriceItem',
    quantity: 1,
    quantity_available: 1,
    listing_status: 'Active',
    start_time: '2024-01-12T00:00:00Z',
    end_time: '2024-02-12T00:00:00Z',
    view_count: 89,
    watch_count: 15,
    price_reduction_enabled: false,
    reduction_strategy: 'time_based',
    reduction_percentage: 7,
    minimum_price: 120.00,
    reduction_interval: 10,
    last_price_reduction: '2024-01-18T00:00:00Z',
    next_price_reduction: null,
    market_average_price: 155.00,
    market_lowest_price: 130.00,
    market_highest_price: 200.00,
    market_competitor_count: 12,
    last_market_analysis: new Date().toISOString(),
    last_synced_with_ebay: new Date().toISOString(),
    created_at: '2024-01-12T00:00:00Z',
    updated_at: new Date().toISOString(),
    price_history: [
      { price: 180.00, reason: 'initial', created_at: '2024-01-12T00:00:00Z' },
      { price: 167.40, reason: 'time_based_reduction', created_at: '2024-01-18T00:00:00Z' },
      { price: 145.00, reason: 'manual', created_at: '2024-01-23T00:00:00Z' }
    ],
    sync_errors: []
  }
]

// Mock user
const mockUser = {
  id: 'demo-user-id',
  email: 'demo@example.com',
  name: 'Demo User'
}

// Simulate network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Mock Supabase client
export const supabase = {
  auth: {
    getUser: async () => {
      await delay(100)
      return { data: { user: mockUser }, error: null }
    },
    getSession: async () => {
      await delay(100)
      return { data: { session: { user: mockUser } }, error: null }
    },
    onAuthStateChange: (callback) => {
      // Simulate logged in state
      setTimeout(() => callback('SIGNED_IN', { user: mockUser }), 100)
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    signUp: async (credentials) => {
      await delay(500)
      return { data: { user: mockUser }, error: null }
    },
    signInWithPassword: async (credentials) => {
      await delay(500)
      return { data: { user: mockUser }, error: null }
    },
    signOut: async () => {
      await delay(300)
      return { error: null }
    },
    resetPasswordForEmail: async (email) => {
      await delay(300)
      return { error: null }
    }
  }
}

// Mock API functions
export const listingsAPI = {
  async getListings(filters = {}) {
    await delay(300)
    const { page = 1, limit = 20, status = 'Active' } = filters

    let filteredListings = mockListings
    if (status !== 'all') {
      filteredListings = mockListings.filter(listing => listing.listing_status === status)
    }

    return {
      listings: filteredListings,
      total: filteredListings.length,
      totalPages: Math.ceil(filteredListings.length / limit),
      currentPage: page
    }
  },

  async getListing(id) {
    await delay(200)
    const listing = mockListings.find(l => l.id === id)
    if (!listing) throw new Error('Listing not found')
    return listing
  },

  async createListing(listing) {
    await delay(400)
    const newListing = {
      ...listing,
      id: Math.random().toString(36).substr(2, 9),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockListings.push(newListing)
    return newListing
  },

  async updateListing(id, updates) {
    await delay(300)
    const listingIndex = mockListings.findIndex(l => l.id === id)
    if (listingIndex === -1) throw new Error('Listing not found')

    mockListings[listingIndex] = {
      ...mockListings[listingIndex],
      ...updates,
      updated_at: new Date().toISOString()
    }
    return mockListings[listingIndex]
  },

  async deleteListing(id) {
    await delay(200)
    const listingIndex = mockListings.findIndex(l => l.id === id)
    if (listingIndex === -1) throw new Error('Listing not found')
    mockListings.splice(listingIndex, 1)
  },

  async recordPriceReduction(listingId, newPrice, reason = 'manual') {
    await delay(400)
    const listing = mockListings.find(l => l.id === listingId)
    if (!listing) throw new Error('Listing not found')

    const nextReduction = new Date()
    nextReduction.setDate(nextReduction.getDate() + listing.reduction_interval)

    listing.current_price = newPrice
    listing.last_price_reduction = new Date().toISOString()
    listing.next_price_reduction = nextReduction.toISOString()
    listing.updated_at = new Date().toISOString()

    listing.price_history.push({
      price: newPrice,
      reason,
      created_at: new Date().toISOString()
    })

    return listing
  }
}

export const priceHistoryAPI = {
  async getPriceHistory(listingId) {
    await delay(200)
    const listing = mockListings.find(l => l.id === listingId)
    if (!listing) throw new Error('Listing not found')
    return listing.price_history
  }
}

export const userAPI = {
  async getProfile() {
    await delay(200)
    return {
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      default_reduction_strategy: 'fixed_percentage',
      default_reduction_percentage: 5,
      default_reduction_interval: 7,
      ebay_user_token: null,
      subscription_plan: 'free',
      listing_limit: 10
    }
  },

  async updateProfile(updates) {
    await delay(300)
    return { ...mockUser, ...updates }
  }
}

export const authAPI = {
  async signUp(email, password, userData = {}) {
    await delay(500)
    return { data: { user: mockUser }, error: null }
  },

  async signIn(email, password) {
    await delay(500)
    return { data: { user: mockUser }, error: null }
  },

  async signOut() {
    await delay(300)
    return { error: null }
  },

  async resetPassword(email) {
    await delay(300)
    return { error: null }
  }
}

// Table names (kept for compatibility)
export const TABLES = {
  USERS: 'users',
  LISTINGS: 'listings',
  PRICE_HISTORY: 'price_history',
  SYNC_ERRORS: 'sync_errors',
  MONITOR_JOBS: 'monitor_jobs'
}