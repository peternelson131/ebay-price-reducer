// Shared strategy data for the application
// This acts as a temporary data store until we integrate with a proper API

// This will be dynamically updated by the Strategies component
let strategies = [
  {
    id: '1',
    name: 'Standard Price Drop',
    reductionType: 'percentage',
    reductionAmount: 5,
    frequencyDays: 7,
    active: true,
    listingsUsing: 2,
    createdAt: '2024-01-15'
  },
  {
    id: '2',
    name: 'Aggressive Market Strategy',
    reductionType: 'percentage',
    reductionAmount: 10,
    frequencyDays: 3,
    active: true,
    listingsUsing: 1,
    createdAt: '2024-02-01'
  },
  {
    id: '3',
    name: 'Fixed Dollar Reduction',
    reductionType: 'dollar',
    reductionAmount: 25,
    frequencyDays: 14,
    active: false,
    listingsUsing: 0,
    createdAt: '2024-02-10'
  }
]

export const mockStrategies = strategies

// Helper function to get active strategies for use in listings
export const getActiveStrategies = () => {
  return mockStrategies.filter(strategy => strategy.active)
}

// Helper function to get strategy by ID
export const getStrategyById = (id) => {
  return mockStrategies.find(strategy => strategy.id === id)
}

// Helper function to get strategy display name
export const getStrategyDisplayName = (strategy) => {
  if (!strategy) return 'No strategy'
  return `${strategy.name} (${strategy.reductionType === 'percentage' ? strategy.reductionAmount + '%' : '$' + strategy.reductionAmount} every ${strategy.frequencyDays} days)`
}

// Functions to update strategies (called from Strategies component)
export const updateStrategies = (newStrategies) => {
  strategies.length = 0
  strategies.push(...newStrategies)
}

export const getAllStrategies = () => {
  return [...strategies]
}