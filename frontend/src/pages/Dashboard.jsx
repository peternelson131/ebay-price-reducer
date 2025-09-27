import { useQuery } from 'react-query'
import { listingsApi, monitorApi } from '../services/api'
import {
  CurrencyDollarIcon,
  ListBulletIcon,
  ClockIcon,
  TrendingDownIcon
} from '@heroicons/react/24/outline'

export default function Dashboard() {
  const { data: listings } = useQuery('listings', () => listingsApi.getListings())
  const { data: monitorStatus } = useQuery('monitorStatus', () => monitorApi.getStatus())

  const stats = [
    {
      name: 'Total Listings',
      value: listings?.data?.total || 0,
      icon: ListBulletIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      name: 'Active Monitoring',
      value: listings?.data?.listings?.filter(l => l.priceReductionEnabled).length || 0,
      icon: ClockIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      name: 'Price Reductions Today',
      value: '3',
      icon: TrendingDownIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    },
    {
      name: 'Total Savings',
      value: '$142.50',
      icon: CurrencyDollarIcon,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    }
  ]

  const recentListings = listings?.data?.listings?.slice(0, 5) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor and manage your eBay listings price reduction
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="card-body">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`p-3 rounded-md ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.name}
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stat.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Listings */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Recent Listings</h3>
          </div>
          <div className="card-body">
            {recentListings.length > 0 ? (
              <div className="space-y-4">
                {recentListings.map((listing) => (
                  <div key={listing._id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {listing.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        ${listing.currentPrice} • {listing.listingStatus}
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                      <span className={`badge ${
                        listing.priceReductionEnabled
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}>
                        {listing.priceReductionEnabled ? 'Monitoring' : 'Paused'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <ListBulletIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No listings</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Import your eBay listings to get started.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Monitor Status */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Monitor Status</h3>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Service Status</span>
                <span className={`badge ${
                  monitorStatus?.data?.isRunning
                    ? 'badge-success'
                    : 'badge-danger'
                }`}>
                  {monitorStatus?.data?.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Next Check</span>
                <span className="text-sm text-gray-900">In 45 minutes</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Last Sync</span>
                <span className="text-sm text-gray-900">2 minutes ago</span>
              </div>

              <div className="pt-4">
                <button className="btn-primary w-full">
                  View All Listings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button className="btn-primary">
              Import eBay Listings
            </button>
            <button className="btn-secondary">
              Run Manual Price Check
            </button>
            <button className="btn-secondary">
              Export Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}