// Strategy helper functions for the application
// Strategies are now persisted in the database via strategiesAPI

import { strategiesAPI } from '../lib/supabase'

// Helper function to get active strategies for use in listings
export const getActiveStrategies = async () => {
  const strategies = await strategiesAPI.getStrategies()
  return strategies
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
  const amount = strategy.strategy_type === 'percentage'
    ? `${strategy.reduction_percentage}%`
    : `$${strategy.reduction_amount}`
  return `${strategy.name} (${amount} every ${strategy.interval_days} days)`
}

// Get all strategies (alias for consistency)
export const getAllStrategies = async () => {
  return await strategiesAPI.getStrategies()
}

// Legacy strategy mapping for backward compatibility
const LEGACY_STRATEGIES = {
  'fixed_percentage': {
    name: 'Fixed Percentage',
    strategy_type: 'percentage',
    reduction_percentage: 10,
    reduction_amount: 0,
    interval_days: 7
  },
  'market_based': {
    name: 'Market Based',
    strategy_type: 'percentage',
    reduction_percentage: 5,
    reduction_amount: 0,
    interval_days: 14
  },
  'time_based': {
    name: 'Time Based',
    strategy_type: 'percentage',
    reduction_percentage: 15,
    reduction_amount: 0,
    interval_days: 30
  }
}

// Backward compatible strategy display info helper
// Accepts listing object and strategies array
// Returns strategy object or null
// SYNCHRONOUS - no async calls
export const getStrategyDisplayInfo = (listing, strategies = []) => {
  if (!listing) return null

  // Try new system first: listing.strategy_id (UUID reference)
  if (listing.strategy_id) {
    const strategy = strategies.find(s => s.id === listing.strategy_id)
    if (strategy) return strategy
  }

  // Fall back to old system: listing.reduction_strategy (string value)
  if (listing.reduction_strategy) {
    // Check if it's a UUID (new system value stored in old column)
    const strategyById = strategies.find(s => s.id === listing.reduction_strategy)
    if (strategyById) return strategyById

    // Fall back to legacy string mapping
    const legacyStrategy = LEGACY_STRATEGIES[listing.reduction_strategy]
    if (legacyStrategy) return legacyStrategy
  }

  return null
}