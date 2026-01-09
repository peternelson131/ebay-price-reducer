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

function ApiKeyInput({ service, existingKey, onSave, onDelete, saving }) {
  const [inputValue, setInputValue] = useState(existingKey?.value || '');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setInputValue(existingKey?.value || '');
  }, [existingKey]);

  return (
    <div className="bg-dark-surface rounded-lg border border-dark-border p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium text-text-primary">{service.name}</h3>
          <p className="mt-1 text-sm text-text-tertiary">{service.description}</p>
          <a
            href={service.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-accent hover:text-accent-hover transition-colors inline-block"
          >
            Get API key →
          </a>
        </div>
        {existingKey && (
          <span className={`px-2 py-1 text-xs rounded-lg ${
            existingKey.isValid 
              ? 'bg-success/10 text-success' 
              : 'bg-error/10 text-error'
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
              className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-lg text-text-primary placeholder-text-tertiary focus:ring-2 focus:ring-accent focus:border-transparent transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <button
            onClick={() => onSave(service.id, inputValue)}
            disabled={saving || !inputValue.trim()}
            className="px-4 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {existingKey && (
            <button
              onClick={() => onDelete(service.id)}
              className="px-4 py-2.5 bg-error/10 text-error border border-error/30 rounded-lg hover:bg-error/20 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
        {existingKey?.lastUsed && (
          <p className="mt-2 text-xs text-text-tertiary">
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">API Keys</h1>
        <p className="mt-2 text-text-secondary">
          Manage your API credentials for external services. Keys are encrypted and stored securely.
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-success/10 border-success/30 text-success' 
            : 'bg-error/10 border-error/30 text-error'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-4">
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

      <div className="mt-8 p-4 bg-accent/10 border border-accent/30 rounded-lg">
        <h3 className="font-medium text-accent">Security Note</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Your API keys are encrypted at rest and only used to make requests on your behalf. 
          We never share your keys with third parties.
        </p>
      </div>
    </div>
  );
}
