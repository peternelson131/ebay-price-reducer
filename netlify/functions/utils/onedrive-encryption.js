/**
 * OneDrive Token Encryption Utilities
 * Uses AES-256-GCM encryption for Microsoft OAuth tokens
 * 
 * GCM (Galois/Counter Mode) provides:
 * - Authenticated encryption (prevents tampering)
 * - Better security for cloud tokens vs CBC mode
 * - Standard for OAuth token encryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key (read at execution time for serverless)
 * @returns {string} - Hex-encoded encryption key
 */
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }
  
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return key;
}

/**
 * Encrypt a token using AES-256-GCM
 * @param {string} plaintext - Token to encrypt
 * @returns {string} - Encrypted string in format "iv:authTag:encryptedData" (all hex)
 */
function encryptToken(plaintext) {
  if (!plaintext) {
    throw new Error('Cannot encrypt null or empty token');
  }
  
  const encryptionKey = getEncryptionKey();
  
  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(encryptionKey, 'hex'),
    iv
  );
  
  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get auth tag
  const authTag = cipher.getAuthTag();
  
  // Return as iv:authTag:encryptedData (all hex)
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
}

/**
 * Decrypt a token using AES-256-GCM
 * @param {string} encrypted - Encrypted string in format "iv:authTag:encryptedData"
 * @returns {string} - Decrypted plaintext token
 */
function decryptToken(encrypted) {
  if (!encrypted) {
    throw new Error('Cannot decrypt null or empty value');
  }
  
  const encryptionKey = getEncryptionKey();
  
  try {
    // Split components
    const parts = encrypted.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format. Expected iv:authTag:data');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = Buffer.from(parts[2], 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(encryptionKey, 'hex'),
      iv
    );
    
    // Set auth tag
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Token decryption error:', error.message);
    throw new Error('Failed to decrypt token. Token may be corrupted or tampered with.');
  }
}

/**
 * Check if encryption is properly configured
 * @returns {boolean}
 */
function isEncryptionConfigured() {
  try {
    const key = process.env.ENCRYPTION_KEY;
    return !!key && key.length === 64; // 32 bytes = 64 hex chars
  } catch (error) {
    return false;
  }
}

/**
 * Generate a new encryption key (for setup/testing)
 * @returns {string} - 64 character hex string (32 random bytes)
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encryptToken,
  decryptToken,
  isEncryptionConfigured,
  generateEncryptionKey
};
