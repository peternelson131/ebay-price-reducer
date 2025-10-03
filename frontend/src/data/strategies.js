// Strategy helper functions for the application
// Strategies are now persisted in the database via strategiesAPI

import { strategiesAPI } from '../lib/supabase'

// Helper function to get active strategies for use in listings
export const getActiveStrategies = async () => {
  const strategies = await strategiesAPI.getStrategies()
  return strategies.filter(strategy => strategy.active)
}

// Helper function to get strategy by ID
export const getStrategyById = async (id) => {
  try {
    return await strategiesAPI.getStrategy(id)
  } catch (error) {
    console.error('Error fetching strategy:', error)
    return null
  }
}

// Helper function to get strategy display name
export const getStrategyDisplayName = (strategy) => {
  if (!strategy) return 'No strategy'
  const amount = strategy.reduction_type === 'percentage'
    ? `${strategy.reduction_amount}%`
    : `$${strategy.reduction_amount}`
  return `${strategy.name} (${amount} every ${strategy.frequency_days} days)`
}

// Get all strategies (alias for consistency)
export const getAllStrategies = async () => {
  return await strategiesAPI.getStrategies()
}