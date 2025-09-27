import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useForm } from 'react-hook-form'
import { listingsApi } from '../services/api'
import { toast } from 'react-toastify'
import {
  ArrowLeftIcon,
  TrendingDownIcon,
  ChartBarIcon,
  ClockIcon
} from '@heroicons/react/24/outline'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showSettings, setShowSettings] = useState(false)

  const { data: listing, isLoading } = useQuery(
    ['listing', id],
    () => listingsApi.getListing(id)
  )

  const { data: priceHistory } = useQuery(
    ['priceHistory', id],
    () => listingsApi.getPriceHistory(id)
  )

  const { data: marketAnalysis } = useQuery(
    ['marketAnalysis', id],
    () => listingsApi.getMarketAnalysis(id)
  )

  const { register, handleSubmit, reset } = useForm()

  const updateMutation = useMutation(
    (data) => listingsApi.updateListing(id, data),
    {
      onSuccess: () => {
        toast.success('Listing settings updated')
        queryClient.invalidateQueries(['listing', id])
        setShowSettings(false)
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update listing')
      }
    }
  )

  const reducePriceMutation = useMutation(
    ({ listingId, customPrice }) => listingsApi.reducePrice(listingId, customPrice),
    {
      onSuccess: (data) => {
        toast.success(`Price reduced to $${data.data.newPrice}`)
        queryClient.invalidateQueries(['listing', id])
        queryClient.invalidateQueries(['priceHistory', id])
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to reduce price')
      }
    }
  )

  const onUpdateSettings = (data) => {
    updateMutation.mutate(data)
  }

  const handleReducePrice = (customPrice = null) => {
    if (window.confirm(`Are you sure you want to reduce the price${customPrice ? ` to $${customPrice}` : ''}?`)) {
      reducePriceMutation.mutate({ listingId: id, customPrice })
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ebay-blue"></div>
      </div>
    )
  }

  if (!listing?.data) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Listing not found</div>
        <button onClick={() => navigate('/listings')} className="btn-primary">
          Back to Listings
        </button>
      </div>
    )
  }

  const listingData = listing.data
  const priceHistoryData = priceHistory?.data?.priceHistory || []
  const marketData = marketAnalysis?.data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/listings')}
          className="flex items-center text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Listings
        </button>

        <div className="flex space-x-3">
          <button
            onClick={() => handleReducePrice()}
            className="btn-danger btn-sm"
            disabled={reducePriceMutation.isLoading}
          >
            <TrendingDownIcon className="h-4 w-4 mr-1" />
            Reduce Price Now
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn-secondary btn-sm"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Listing Info */}
          <div className="card">
            <div className="card-body">
              <div className="flex">
                <div className="flex-shrink-0">
                  {listingData.imageUrls && listingData.imageUrls[0] ? (
                    <img
                      className="h-32 w-32 rounded-lg object-cover"
                      src={listingData.imageUrls[0]}
                      alt={listingData.title}
                    />
                  ) : (
                    <div className="h-32 w-32 rounded-lg bg-gray-300 flex items-center justify-center">
                      <span className="text-gray-500">No Image</span>
                    </div>
                  )}
                </div>

                <div className="ml-6 flex-1">
                  <h1 className="text-xl font-bold text-gray-900 mb-2">
                    {listingData.title}
                  </h1>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">eBay Item ID:</span>
                      <div className="font-medium">{listingData.ebayItemId}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Category:</span>
                      <div className="font-medium">{listingData.category}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Condition:</span>
                      <div className="font-medium">{listingData.condition}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Quantity:</span>
                      <div className="font-medium">{listingData.quantity}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Price History */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">Price History</h3>
            </div>
            <div className="card-body">
              {priceHistoryData.length > 0 ? (
                <div className="space-y-3">
                  {priceHistoryData.slice().reverse().map((entry, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                      <div>
                        <div className="font-medium">${entry.price}</div>
                        <div className="text-sm text-gray-500">{entry.reason.replace('_', ' ')}</div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(entry.date).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  No price history available
                </div>
              )}
            </div>
          </div>

          {/* Market Analysis */}
          {marketData && marketData.hasData && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <ChartBarIcon className="h-5 w-5 mr-2" />
                  Market Analysis
                </h3>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-500">Average Market Price:</span>
                    <div className="font-medium text-lg">${marketData.averagePrice}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Your Position:</span>
                    <div className={`font-medium ${
                      marketData.currentPricePosition === 'below_average'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {marketData.currentPricePosition === 'below_average' ? 'Below Average' : 'Above Average'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Suggested Price:</span>
                    <div className="font-medium text-lg">${marketData.suggestedPrice}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Recent Sales:</span>
                    <div className="font-medium">{marketData.totalSales}</div>
                  </div>
                </div>

                {marketData.suggestedPrice < listingData.currentPrice && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-md">
                    <p className="text-sm text-yellow-800">
                      Consider reducing your price to ${marketData.suggestedPrice} to be more competitive.
                    </p>
                    <button
                      onClick={() => handleReducePrice(marketData.suggestedPrice)}
                      className="btn-primary btn-sm mt-2"
                    >
                      Apply Suggested Price
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Current Status */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">Current Status</h3>
            </div>
            <div className="card-body space-y-4">
              <div>
                <span className="text-gray-500">Current Price:</span>
                <div className="text-2xl font-bold text-green-600">
                  ${listingData.currentPrice}
                </div>
              </div>

              <div>
                <span className="text-gray-500">Original Price:</span>
                <div className="font-medium">${listingData.originalPrice}</div>
              </div>

              <div>
                <span className="text-gray-500">Minimum Price:</span>
                <div className="font-medium">${listingData.minimumPrice}</div>
              </div>

              <div>
                <span className="text-gray-500">Monitoring Status:</span>
                <div>
                  <span className={`badge ${
                    listingData.priceReductionEnabled ? 'badge-success' : 'badge-warning'
                  }`}>
                    {listingData.priceReductionEnabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>

              {listingData.nextPriceReduction && (
                <div>
                  <span className="text-gray-500">Next Reduction:</span>
                  <div className="font-medium flex items-center">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    {new Date(listingData.nextPriceReduction).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium text-gray-900">Settings</h3>
              </div>
              <div className="card-body">
                <form onSubmit={handleSubmit(onUpdateSettings)} className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">
                      <input
                        type="checkbox"
                        defaultChecked={listingData.priceReductionEnabled}
                        {...register('priceReductionEnabled')}
                        className="mr-2"
                      />
                      Enable Price Monitoring
                    </label>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reduction Strategy</label>
                    <select
                      defaultValue={listingData.reductionStrategy}
                      {...register('reductionStrategy')}
                      className="form-input"
                    >
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reduction Percentage (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={listingData.reductionPercentage}
                      {...register('reductionPercentage', { valueAsNumber: true })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Minimum Price ($)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={listingData.minimumPrice}
                      {...register('minimumPrice', { valueAsNumber: true })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Reduction Interval (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      defaultValue={listingData.reductionInterval}
                      {...register('reductionInterval', { valueAsNumber: true })}
                      className="form-input"
                    />
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="btn-primary btn-sm"
                      disabled={updateMutation.isLoading}
                    >
                      Save Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}