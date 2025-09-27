import axios from 'axios'
import { toast } from 'react-toastify'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    const message = error.response?.data?.error || error.message || 'An error occurred'

    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('authToken')
      toast.error('Session expired. Please log in again.')
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    } else {
      toast.error(message)
    }

    return Promise.reject(error)
  }
)

// API functions
export const listingsApi = {
  // Get all listings
  getListings: (params = {}) => {
    return api.get('/listings', { params })
  },

  // Get single listing
  getListing: (id) => {
    return api.get(`/listings/${id}`)
  },

  // Import listings from eBay
  importListings: (data) => {
    return api.post('/listings/import', data)
  },

  // Update listing settings
  updateListing: (id, data) => {
    return api.put(`/listings/${id}`, data)
  },

  // Manually reduce price
  reducePrice: (id, customPrice = null) => {
    return api.post(`/listings/${id}/reduce-price`, { customPrice })
  },

  // Get price history
  getPriceHistory: (id) => {
    return api.get(`/listings/${id}/price-history`)
  },

  // Get market analysis
  getMarketAnalysis: (id) => {
    return api.get(`/listings/${id}/market-analysis`)
  },

  // Delete listing
  deleteListing: (id) => {
    return api.delete(`/listings/${id}`)
  },
}

export const monitorApi = {
  // Get monitor status
  getStatus: () => {
    return api.get('/monitor/status')
  },

  // Start monitoring
  start: () => {
    return api.post('/monitor/start')
  },

  // Stop monitoring
  stop: () => {
    return api.post('/monitor/stop')
  },
}

export const healthApi = {
  // Health check
  check: () => {
    return api.get('/health', { baseURL: 'http://localhost:3001' })
  },
}

export default api