import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const API_SERVICES = [
  {
    id: 'keepa',
    name: 'Keepa',
    description: 'Required for product data, variations, and similar product search',
    helpUrl: 'https://keepa.com/#!api',
    placeholder: 'Enter your Keepa API key'
  },
  {
    id: 'ebay_app_id',
    name: 'eBay App ID (Client ID)',
    description: 'From eBay Developer Program',
    helpUrl: 'https://developer.ebay.com/my/keys',
    placeholder: 'Enter your eBay App ID'
  },
  {
    id: 'ebay_cert_id',
    name: 'eBay Cert ID (Client Secret)',
    description: 'From eBay Developer Program',
    helpUrl: 'https://developer.ebay.com/my/keys',
    placeholder: 'Enter your eBay Cert ID'
  },
  {
    id: 'ebay_dev_id',
    name: 'eBay Dev ID',
    description: 'From eBay Developer Program',
    helpUrl: 'https://developer.ebay.com/my/keys',
    placeholder: 'Enter your eBay Dev ID'
  },
  {
    id: 'ebay_refresh_token',
    name: 'eBay Refresh Token',
    description: 'OAuth refresh token for API access',
    helpUrl: 'https://developer.ebay.com/api-docs/static/oauth-tokens.html',
    placeholder: 'Enter your eBay refresh token'
  }
];

// Individual key input component
function ApiKeyInput({ service, existingKey, onSave, onDelete, saving }) {
  const [inputValue, setInputValue] = useState(existingKey?.value || '');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setInputValue(existingKey?.value || '');
  }, [existingKey]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{service.name}</h3>
          <p className="mt-1 text-sm text-gray-500">{service.description}</p>
          <a
            href={service.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-blue-600 hover:text-blue-800"
          >
            Get API key →
          </a>
        </div>
        {existingKey && (
          <span className={`px-2 py-1 text-xs rounded-full ${
            existingKey.isValid 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {existingKey.isValid ? 'Active' : 'Invalid'}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={service.placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <button
            onClick={() => onSave(service.id, inputValue)}
            disabled={saving || !inputValue.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {existingKey && (
            <button
              onClick={() => onDelete(service.id)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
            >
              Delete
            </button>
          )}
        </div>
        {existingKey?.lastUsed && (
          <p className="mt-2 text-xs text-gray-400">
            Last used: {new Date(existingKey.lastUsed).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ApiKeys() {
  const { user } = useAuth();
  const [keys, setKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (user) {
      loadKeys();
    }
  }, [user]);

  const loadKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const keyMap = {};
      (data || []).forEach(row => {
        keyMap[row.service] = {
          id: row.id,
          value: row.api_key_encrypted,
          isValid: row.is_valid,
          lastUsed: row.last_used_at
        };
      });
      setKeys(keyMap);
    } catch (error) {
      console.error('Error loading keys:', error);
      setMessage({ type: 'error', text: 'Failed to load API keys' });
    } finally {
      setLoading(false);
    }
  };

  const saveKey = async (serviceId, value) => {
    if (!value.trim()) return;
    
    setSaving(prev => ({ ...prev, [serviceId]: true }));
    setMessage(null);

    try {
      const existing = keys[serviceId];
      
      if (existing?.id) {
        const { error } = await supabase
          .from('user_api_keys')
          .update({
            api_key_encrypted: value.trim(),
            is_valid: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_api_keys')
          .insert({
            user_id: user.id,
            service: serviceId,
            api_key_encrypted: value.trim(),
            label: 'default'
          });
        
        if (error) throw error;
      }

      setMessage({ type: 'success', text: `${serviceId} key saved successfully` });
      await loadKeys();
    } catch (error) {
      console.error('Error saving key:', error);
      setMessage({ type: 'error', text: `Failed to save ${serviceId} key: ${error.message}` });
    } finally {
      setSaving(prev => ({ ...prev, [serviceId]: false }));
    }
  };

  const deleteKey = async (serviceId) => {
    const existing = keys[serviceId];
    if (!existing?.id) return;

    if (!confirm(`Are you sure you want to delete your ${serviceId} API key?`)) return;

    try {
      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `${serviceId} key deleted` });
      await loadKeys();
    } catch (error) {
      console.error('Error deleting key:', error);
      setMessage({ type: 'error', text: `Failed to delete ${serviceId} key` });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <p className="mt-2 text-gray-600">
          Manage your API credentials for external services. Keys are encrypted and stored securely.
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {API_SERVICES.map(service => (
          <ApiKeyInput
            key={service.id}
            service={service}
            existingKey={keys[service.id]}
            onSave={saveKey}
            onDelete={deleteKey}
            saving={saving[service.id]}
          />
        ))}
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-blue-900">Security Note</h3>
        <p className="mt-1 text-sm text-blue-700">
          Your API keys are encrypted at rest and only used to make requests on your behalf. 
          We never share your keys with third parties.
        </p>
      </div>
    </div>
  );
}
