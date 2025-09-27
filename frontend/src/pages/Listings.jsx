import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { listingsApi } from '../services/api'
import { toast } from 'react-toastify'
import {
  EyeIcon,
  PencilIcon,
  TrashIcon,
  TrendingDownIcon,
  PlusIcon
} from '@heroicons/react/24/outline'

export default function Listings() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('Active')
  const queryClient = useQueryClient()

  const { data: listings, isLoading, error } = useQuery(
    ['listings', { page, status }],
    () => listingsApi.getListings({ page, status }),
    {
      keepPreviousData: true
    }
  )

  const reducePriceMutation = useMutation(listingsApi.reducePrice, {
    onSuccess: (data, listingId) => {
      toast.success(`Price reduced to $${data.data.newPrice}`)
      queryClient.invalidateQueries('listings')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to reduce price')
    }
  })

  const deleteMutation = useMutation(listingsApi.deleteListing, {
    onSuccess: () => {
      toast.success('Listing removed from monitoring')
      queryClient.invalidateQueries('listings')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete listing')
    }
  })

  const handleReducePrice = (listingId) => {
    if (window.confirm('Are you sure you want to reduce the price now?')) {
      reducePriceMutation.mutate(listingId)
    }
  }

  const handleDelete = (listingId) => {
    if (window.confirm('Remove this listing from monitoring? This will not delete it from eBay.')) {
      deleteMutation.mutate(listingId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ebay-blue"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">Error loading listings</div>
        <button
          onClick={() => queryClient.invalidateQueries('listings')}
          className="btn-primary"
        >
          Retry
        </button>
      </div>
    )
  }

  const listingsData = listings?.data?.listings || []
  const totalPages = listings?.data?.totalPages || 1

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Listings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your eBay listings and price reduction settings
          </p>
        </div>

        <button className="btn-primary">
          <PlusIcon className="h-5 w-5 mr-2" />
          Import Listings
        </button>
      </div>

      {/* Filters */}
      <div className="flex space-x-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="form-input w-auto"
        >
          <option value="Active">Active</option>
          <option value="Ended">Ended</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Listings Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Min Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Next Reduction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {listingsData.map((listing) => (
                <tr key={listing._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-16 w-16">
                        {listing.imageUrls && listing.imageUrls[0] ? (
                          <img
                            className="h-16 w-16 rounded-lg object-cover"
                            src={listing.imageUrls[0]}
                            alt={listing.title}
                          />
                        ) : (
                          <div className="h-16 w-16 rounded-lg bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-500 text-xs">No Image</span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                          {listing.title}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {listing.ebayItemId}
                        </div>
                        <div className="text-xs text-gray-400">
                          {listing.category}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      ${listing.currentPrice}
                    </div>
                    <div className="text-xs text-gray-500">
                      Original: ${listing.originalPrice}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${listing.minimumPrice}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <span className={`badge ${
                        listing.listingStatus === 'Active' ? 'badge-success' : 'badge-warning'
                      }`}>
                        {listing.listingStatus}
                      </span>
                      <div>
                        <span className={`badge ${
                          listing.priceReductionEnabled ? 'badge-info' : 'badge-warning'
                        }`}>
                          {listing.priceReductionEnabled ? 'Monitoring' : 'Paused'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {listing.nextPriceReduction ? (
                      new Date(listing.nextPriceReduction).toLocaleDateString()
                    ) : (
                      'Not scheduled'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Link
                        to={`/listings/${listing._id}`}
                        className="text-ebay-blue hover:text-blue-700"
                        title="View Details"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Link>

                      <button
                        onClick={() => handleReducePrice(listing._id)}
                        className="text-orange-600 hover:text-orange-700"
                        title="Reduce Price Now"
                        disabled={reducePriceMutation.isLoading}
                      >
                        <TrendingDownIcon className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(listing._id)}
                        className="text-red-600 hover:text-red-700"
                        title="Remove from Monitoring"
                        disabled={deleteMutation.isLoading}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {listingsData.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">No listings found</div>
            <button className="btn-primary">
              Import Your First Listing
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="btn-secondary disabled:opacity-50"
          >
            Previous
          </button>

          <span className="flex items-center px-4 py-2 text-sm text-gray-700">
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}