import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function ListingSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({});
  const [availablePolicies, setAvailablePolicies] = useState({
    fulfillment: [],
    payment: [],
    return: []
  });
  const [location, setLocation] = useState({
    addressLine1: '',
    city: '',
    stateOrProvince: '',
    postalCode: '',
    country: 'US'
  });
  const [ebayConnected, setEbayConnected] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/listing-settings');

      setSettings(response.data.currentSettings || {});
      setAvailablePolicies(response.data.availablePolicies || {});
      setEbayConnected(response.data.ebayConnected || false);

      if (response.data.currentSettings?.defaultLocation?.address) {
        setLocation(response.data.currentSettings.defaultLocation.address);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Don't show alert on initial load - just set error state
      if (error.response?.status === 401) {
        setError('Please connect your eBay account first.');
      } else if (error.response?.data?.requiresEbayConnection) {
        setError('Please connect your eBay account to configure listing settings.');
        setEbayConnected(false);
      } else {
        setError('Unable to load settings. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const newSettings = {
        defaultFulfillmentPolicyId: settings.defaultFulfillmentPolicyId,
        defaultPaymentPolicyId: settings.defaultPaymentPolicyId,
        defaultReturnPolicyId: settings.defaultReturnPolicyId,
        defaultCondition: settings.defaultCondition || 'NEW_OTHER',
        defaultLocation: {
          address: location
        }
      };

      await api.put('/listing-settings', newSettings);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Listing Creation Settings</h1>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
              {!ebayConnected && (
                <a href="/account?tab=integrations" className="text-sm text-red-600 underline mt-2 inline-block">
                  Go to Account → Integrations to connect eBay
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Payment Policy
        </label>
        <select
          className="w-full border rounded px-3 py-2"
          value={settings.defaultPaymentPolicyId || ''}
          onChange={(e) => setSettings({ ...settings, defaultPaymentPolicyId: e.target.value })}
          disabled={!ebayConnected || availablePolicies.payment.length === 0}
        >
          <option value="">
            {availablePolicies.payment.length === 0 ? 'No payment policies found' : 'Select payment policy...'}
          </option>
          {availablePolicies.payment.map(policy => (
            <option key={policy.paymentPolicyId} value={policy.paymentPolicyId}>
              {policy.name}
            </option>
          ))}
        </select>
        {availablePolicies.payment.length === 0 && ebayConnected && (
          <p className="text-sm text-amber-600 mt-1">
            Please create payment policies in your eBay account first.
          </p>
        )}
      </div>

      {/* Shipping/Fulfillment Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Shipping Policy
        </label>
        <select
          className="w-full border rounded px-3 py-2"
          value={settings.defaultFulfillmentPolicyId || ''}
          onChange={(e) => setSettings({ ...settings, defaultFulfillmentPolicyId: e.target.value })}
          disabled={!ebayConnected || availablePolicies.fulfillment.length === 0}
        >
          <option value="">
            {availablePolicies.fulfillment.length === 0 ? 'No shipping policies found' : 'Select shipping policy...'}
          </option>
          {availablePolicies.fulfillment.map(policy => (
            <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
              {policy.name}
            </option>
          ))}
        </select>
        {availablePolicies.fulfillment.length === 0 && ebayConnected && (
          <p className="text-sm text-amber-600 mt-1">
            Please create shipping policies in your eBay account first.
          </p>
        )}
      </div>

      {/* Return Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Return Policy
        </label>
        <select
          className="w-full border rounded px-3 py-2"
          value={settings.defaultReturnPolicyId || ''}
          onChange={(e) => setSettings({ ...settings, defaultReturnPolicyId: e.target.value })}
          disabled={!ebayConnected || availablePolicies.return.length === 0}
        >
          <option value="">
            {availablePolicies.return.length === 0 ? 'No return policies found' : 'Select return policy...'}
          </option>
          {availablePolicies.return.map(policy => (
            <option key={policy.returnPolicyId} value={policy.returnPolicyId}>
              {policy.name}
            </option>
          ))}
        </select>
        {availablePolicies.return.length === 0 && ebayConnected && (
          <p className="text-sm text-amber-600 mt-1">
            Please create return policies in your eBay account first.
          </p>
        )}
      </div>

      {/* Default Condition */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Condition
        </label>
        <select
          className="w-full border rounded px-3 py-2"
          value={settings.defaultCondition || 'NEW_OTHER'}
          onChange={(e) => setSettings({ ...settings, defaultCondition: e.target.value })}
        >
          <option value="NEW_OTHER">New Open Box</option>
          <option value="NEW">New</option>
          <option value="LIKE_NEW">Like New</option>
          <option value="USED_EXCELLENT">Used - Excellent</option>
          <option value="USED_VERY_GOOD">Used - Very Good</option>
          <option value="USED_GOOD">Used - Good</option>
        </select>
      </div>

      {/* Shipping Location */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Default Shipping Location</h2>

        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Address Line 1</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2"
            value={location.addressLine1}
            onChange={(e) => setLocation({ ...location, addressLine1: e.target.value })}
            placeholder="123 Main St"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={location.city}
              onChange={(e) => setLocation({ ...location, city: e.target.value })}
              placeholder="San Francisco"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={location.stateOrProvince}
              onChange={(e) => setLocation({ ...location, stateOrProvince: e.target.value })}
              placeholder="CA"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Postal Code</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={location.postalCode}
              onChange={(e) => setLocation({ ...location, postalCode: e.target.value })}
              placeholder="94105"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={location.country}
              onChange={(e) => setLocation({ ...location, country: e.target.value })}
              placeholder="US"
              maxLength="2"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
