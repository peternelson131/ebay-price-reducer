import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function ListingSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/listing-settings');
      setSettings(response.data.currentSettings || {});
      setAvailablePolicies(response.data.availablePolicies || {});

      if (response.data.currentSettings?.defaultLocation?.address) {
        setLocation(response.data.currentSettings.defaultLocation.address);
      }

      // Also fetch user's Keepa API key if available
      if (response.data.keepaApiKey) {
        setSettings(prev => ({ ...prev, keepaApiKey: response.data.keepaApiKey }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const newSettings = {
        keepaApiKey: settings.keepaApiKey,
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
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Listing Creation Settings</h1>

      {/* Keepa API Key */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Keepa API Key
        </label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2"
          value={settings.keepaApiKey || ''}
          onChange={(e) => setSettings({ ...settings, keepaApiKey: e.target.value })}
          placeholder="Enter your Keepa API key"
        />
        <p className="text-sm text-gray-600 mt-1">
          Required for fetching product data from Amazon. Get your API key from{' '}
          <a href="https://keepa.com/#!api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            keepa.com/#!api
          </a>
        </p>
      </div>

      {/* Payment Policy */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Default Payment Policy
        </label>
        <select
          className="w-full border rounded px-3 py-2"
          value={settings.defaultPaymentPolicyId || ''}
          onChange={(e) => setSettings({ ...settings, defaultPaymentPolicyId: e.target.value })}
        >
          <option value="">Select payment policy...</option>
          {availablePolicies.payment.map(policy => (
            <option key={policy.paymentPolicyId} value={policy.paymentPolicyId}>
              {policy.name} ({policy.paymentPolicyId})
            </option>
          ))}
        </select>
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
        >
          <option value="">Select shipping policy...</option>
          {availablePolicies.fulfillment.map(policy => (
            <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>
              {policy.name} ({policy.fulfillmentPolicyId})
            </option>
          ))}
        </select>
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
        >
          <option value="">Select return policy...</option>
          {availablePolicies.return.map(policy => (
            <option key={policy.returnPolicyId} value={policy.returnPolicyId}>
              {policy.name} ({policy.returnPolicyId})
            </option>
          ))}
        </select>
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
