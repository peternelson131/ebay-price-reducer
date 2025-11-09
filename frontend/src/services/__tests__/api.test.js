import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import apiService, { handleApiError, isDemoMode } from '../api'

// Mock fetch globally
global.fetch = vi.fn()

describe('ApiService', () => {
  beforeEach(() => {
    fetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('request method', () => {
    it('should make successful API requests', async () => {
      const mockResponse = { success: true, data: 'test data' }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await apiService.request('/test-endpoint')

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-endpoint',
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
      expect(result).toEqual(mockResponse)
    })

    it('should handle HTTP errors', async () => {
      const mockErrorResponse = { error: 'Not found' }
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => mockErrorResponse
      })

      await expect(apiService.request('/non-existent')).rejects.toThrow('Not found')
    })

    it('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(apiService.request('/test-endpoint')).rejects.toThrow('Network error')
    })

    it('should include custom headers', async () => {
      const mockResponse = { success: true }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.request('/test-endpoint', {
        headers: {
          'Authorization': 'Bearer token123'
        }
      })

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-endpoint',
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123'
          }
        }
      )
    })

    it('should handle POST requests with body', async () => {
      const mockResponse = { success: true }
      const requestBody = { userId: '123', enabled: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.request('/test-endpoint', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/test-endpoint',
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    })
  })

  // Removed tests for deleted API methods:
  // - testEbayConnection, getEbayListings, syncListings
  // - togglePriceReduction, updateItemPrice, runPriceReduction
  // - analyzeMarket

  describe('sendNotification', () => {
    it('should send notification data', async () => {
      const mockResponse = { sent: true }
      const userId = 'user123'
      const type = 'info'
      const title = 'Test Title'
      const message = 'Test message'
      const data = { extra: 'data' }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.sendNotification(userId, type, title, message, data)

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/notification-service',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId, type, title, message, data })
        })
      )
    })

    it('should use default empty object for data', async () => {
      const mockResponse = { sent: true }

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      await apiService.sendNotification('user123', 'info', 'Title', 'Message')

      expect(fetch).toHaveBeenCalledWith(
        '/.netlify/functions/notification-service',
        expect.objectContaining({
          body: JSON.stringify({
            userId: 'user123',
            type: 'info',
            title: 'Title',
            message: 'Message',
            data: {}
          })
        })
      )
    })
  })

  // Removed tests for deleted API methods:
  // - runScheduledJob, importListings, reducePrice
})

// Note: Only kept tests for core functionality (request methods) and
// methods that still exist (sendNotification, getPriceChanges, getPriceReductionLogs)

describe('handleApiError', () => {
  it('should return error message from error object', () => {
    const error = new Error('Custom error message')
    const result = handleApiError(error)
    expect(result).toBe('Custom error message')
  })

  it('should return default message when no error message', () => {
    const error = {}
    const result = handleApiError(error, 'Default message')
    expect(result).toBe('Default message')
  })

  it('should return default fallback when no custom default provided', () => {
    const error = {}
    const result = handleApiError(error)
    expect(result).toBe('An error occurred')
  })

  it('should log error to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation()
    const error = new Error('Test error')

    handleApiError(error)

    expect(consoleSpy).toHaveBeenCalledWith('API Error:', error)
    consoleSpy.mockRestore()
  })
})

describe('isDemoMode', () => {
  const originalEnv = import.meta.env

  beforeEach(() => {
    // Reset import.meta.env
    import.meta.env = { ...originalEnv }
  })

  afterEach(() => {
    import.meta.env = originalEnv
  })

  it('should return true when no SUPABASE_URL is set', () => {
    import.meta.env.VITE_SUPABASE_URL = undefined
    expect(isDemoMode()).toBe(true)
  })

  it('should return true when SUPABASE_URL contains placeholder', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://your-project-id.supabase.co'
    expect(isDemoMode()).toBe(true)
  })

  it('should return false when SUPABASE_URL is properly configured', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://real-project-id.supabase.co'
    expect(isDemoMode()).toBe(false)
  })
})