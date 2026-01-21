/**
 * OneDrive API Utilities
 * Helper functions for Microsoft Graph API calls with automatic token refresh
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken, decryptToken } = require('./onedrive-encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const TOKEN_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

/**
 * Refresh an expired access token using the refresh token
 */
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', error);
    throw new Error('Failed to refresh access token');
  }

  return await response.json();
}

/**
 * Get valid access token for user, refreshing if necessary
 * @param {string} userId - User ID
 * @returns {Promise<{accessToken: string, connection: object}>}
 */
async function getValidAccessToken(userId) {
  // Fetch user's OneDrive connection
  const { data: connection, error: fetchError } = await supabase
    .from('user_onedrive_connections')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (fetchError || !connection) {
    throw new Error('OneDrive not connected');
  }

  // Check if token is expired or expiring soon (within 5 minutes)
  const now = new Date();
  const expiresAt = new Date(connection.token_expires_at);
  const expiresInMs = expiresAt.getTime() - now.getTime();
  const needsRefresh = expiresInMs < 5 * 60 * 1000; // Less than 5 minutes

  if (!needsRefresh) {
    // Token is still valid
    const accessToken = decryptToken(connection.access_token_encrypted);
    return { accessToken, connection };
  }

  // Token expired or expiring soon - refresh it
  console.log('Refreshing OneDrive access token for user:', userId);
  
  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  const tokenData = await refreshAccessToken(refreshToken);

  const {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_in
  } = tokenData;

  // Encrypt new tokens
  const accessTokenEncrypted = encryptToken(newAccessToken);
  const refreshTokenEncrypted = encryptToken(newRefreshToken || refreshToken); // Some refreshes don't return new refresh token
  const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  // Update database
  const { error: updateError } = await supabase
    .from('user_onedrive_connections')
    .update({
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error updating refreshed tokens:', updateError);
    // Still return the new token even if DB update failed
  }

  return {
    accessToken: newAccessToken,
    connection: {
      ...connection,
      access_token_encrypted: accessTokenEncrypted,
      token_expires_at: newExpiresAt
    }
  };
}

/**
 * Make a Graph API request with automatic retry on 401
 * @param {string} userId - User ID
 * @param {string} endpoint - Graph API endpoint (e.g., '/me/drive/root/children')
 * @param {object} options - Fetch options
 * @returns {Promise<any>} - Response JSON
 */
async function graphApiRequest(userId, endpoint, options = {}) {
  const { accessToken } = await getValidAccessToken(userId);
  
  const url = endpoint.startsWith('https://') 
    ? endpoint 
    : `https://graph.microsoft.com/v1.0${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (response.status === 401) {
    // Token might be invalid - force refresh and retry once
    console.log('Got 401 from Graph API, forcing token refresh');
    const { accessToken: newAccessToken } = await getValidAccessToken(userId);
    
    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${newAccessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!retryResponse.ok) {
      const error = await retryResponse.text();
      throw new Error(`Graph API request failed: ${retryResponse.status} ${error}`);
    }

    // Handle empty responses (e.g., DELETE returns 204 No Content)
    if (retryResponse.status === 204 || retryResponse.headers.get('content-length') === '0') {
      return { success: true };
    }

    return await retryResponse.json();
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph API request failed: ${response.status} ${error}`);
  }

  // Handle empty responses (e.g., DELETE returns 204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return { success: true };
  }

  return await response.json();
}

module.exports = {
  getValidAccessToken,
  graphApiRequest,
  refreshAccessToken
};
