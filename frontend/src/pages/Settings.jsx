import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general')
  const { register, handleSubmit } = useForm()

  const onSaveGeneral = (data) => {
    console.log('General settings:', data)
    toast.success('General settings saved')
  }

  const onSaveEbay = (data) => {
    console.log('eBay settings:', data)
    toast.success('eBay credentials saved')
  }

  const onSaveNotifications = (data) => {
    console.log('Notification settings:', data)
    toast.success('Notification settings saved')
  }

  const tabs = [
    { id: 'general', name: 'General' },
    { id: 'ebay', name: 'eBay Integration' },
    { id: 'notifications', name: 'Notifications' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your eBay price reduction preferences
        </p>
      </div>

      <div className="card">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-ebay-blue text-ebay-blue'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="card-body">
          {/* General Settings */}
          {activeTab === 'general' && (
            <form onSubmit={handleSubmit(onSaveGeneral)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Default Price Reduction Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Default Reduction Strategy</label>
                    <select {...register('defaultReductionStrategy')} className="form-input">
                      <option value="fixed_percentage">Fixed Percentage</option>
                      <option value="market_based">Market Based</option>
                      <option value="time_based">Time Based</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Strategy applied to new imported listings
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Reduction Percentage (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      defaultValue="5"
                      {...register('defaultReductionPercentage')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Reduction Interval (days)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      defaultValue="7"
                      {...register('defaultReductionInterval')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Default Minimum Price Ratio (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      defaultValue="70"
                      {...register('defaultMinimumPriceRatio')}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Percentage of original price to set as minimum (70% = never go below 70% of original)
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Monitoring Preferences
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="autoEnableMonitoring"
                      defaultChecked
                      {...register('autoEnableMonitoring')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="autoEnableMonitoring" className="ml-2 text-sm text-gray-700">
                      Automatically enable monitoring for newly imported listings
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="pauseOnWeekends"
                      {...register('pauseOnWeekends')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="pauseOnWeekends" className="ml-2 text-sm text-gray-700">
                      Pause price reductions on weekends
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="marketAnalysisBeforeReduction"
                      defaultChecked
                      {...register('marketAnalysisBeforeReduction')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="marketAnalysisBeforeReduction" className="ml-2 text-sm text-gray-700">
                      Perform market analysis before each price reduction
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save General Settings
                </button>
              </div>
            </form>
          )}

          {/* eBay Integration */}
          {activeTab === 'ebay' && (
            <form onSubmit={handleSubmit(onSaveEbay)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  eBay API Credentials
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Configure your eBay developer credentials to enable API access.
                  <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="text-ebay-blue hover:text-blue-700 ml-1">
                    Get your credentials here
                  </a>
                </p>

                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">App ID (Client ID)</label>
                    <input
                      type="text"
                      placeholder="Your eBay App ID"
                      {...register('ebayAppId')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dev ID</label>
                    <input
                      type="text"
                      placeholder="Your eBay Dev ID"
                      {...register('ebayDevId')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Cert ID (Client Secret)</label>
                    <input
                      type="password"
                      placeholder="Your eBay Cert ID"
                      {...register('ebayCertId')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">User Token</label>
                    <input
                      type="password"
                      placeholder="Your eBay User Token"
                      {...register('ebayUserToken')}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Environment</label>
                    <select {...register('ebayEnvironment')} className="form-input">
                      <option value="sandbox">Sandbox (Testing)</option>
                      <option value="production">Production</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Sync Settings
                </h3>

                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Auto-sync Interval (hours)</label>
                    <select {...register('syncInterval')} className="form-input">
                      <option value="1">Every hour</option>
                      <option value="6">Every 6 hours</option>
                      <option value="12">Every 12 hours</option>
                      <option value="24">Daily</option>
                    </select>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="autoImportNewListings"
                      {...register('autoImportNewListings')}
                      className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                    />
                    <label htmlFor="autoImportNewListings" className="ml-2 text-sm text-gray-700">
                      Automatically import new eBay listings
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button type="button" className="btn-secondary">
                  Test Connection
                </button>
                <button type="submit" className="btn-primary">
                  Save eBay Settings
                </button>
              </div>
            </form>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSubmit(onSaveNotifications)} className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Email Notifications
                </h3>

                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      {...register('notificationEmail')}
                      className="form-input"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="priceReductionAlerts"
                        defaultChecked
                        {...register('priceReductionAlerts')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="priceReductionAlerts" className="ml-2 text-sm text-gray-700">
                        Notify when prices are reduced
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="errorAlerts"
                        defaultChecked
                        {...register('errorAlerts')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="errorAlerts" className="ml-2 text-sm text-gray-700">
                        Notify when errors occur
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="weeklyReports"
                        {...register('weeklyReports')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="weeklyReports" className="ml-2 text-sm text-gray-700">
                        Send weekly activity reports
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="marketInsights"
                        {...register('marketInsights')}
                        className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
                      />
                      <label htmlFor="marketInsights" className="ml-2 text-sm text-gray-700">
                        Send market analysis insights
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Alert Thresholds
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-group">
                    <label className="form-label">Alert when price drops below (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      defaultValue="80"
                      {...register('priceDropThreshold')}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get notified when a listing's price drops below this percentage of its original price
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Alert when near minimum price (%)</label>
                    <input
                      type="number"
                      min="90"
                      max="100"
                      defaultValue="95"
                      {...register('nearMinimumThreshold')}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Get notified when a listing is close to its minimum price
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Save Notification Settings
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}