/**
 * Social Token Encryption Utilities
 * Uses AES-256-GCM for authenticated encryption of OAuth tokens
 * 
 * GCM (Galois/Counter Mode) provides both confidentiality and authenticity,
 * ensuring tokens haven't been tampered with.
 * 
 * Environment Variable: SOCIAL_TOKEN_ENCRYPTION_KEY
 * Format: 64 hex characters (32 bytes)
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the social token encryption key
 * Read at execution time for serverless compatibility
 * @returns {string} Encryption key from environment
 */
function getEncryptionKey() {
  const key = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY environment variable not set');
  }
  
  if (key.length !== 64) {
    throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return key;
}

/**
 * Encrypt a token using AES-256-GCM
 * @param {string} plaintext - Token to encrypt
 * @returns {string} Encrypted token in format "iv:authTag:ciphertext" (hex encoded)
 */
function encryptToken(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Invalid token: must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(key, 'hex'),
    iv
  );
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Return as iv:authTag:encrypted (all hex)
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
}

/**
 * Decrypt a token using AES-256-GCM
 * @param {string} encryptedToken - Encrypted token in format "iv:authTag:ciphertext"
 * @returns {string} Decrypted plaintext token
 * @throws {Error} If decryption fails (wrong key, tampered data, etc.)
 */
function decryptToken(encryptedToken) {
  if (!encryptedToken || typeof encryptedToken !== 'string') {
    throw new Error('Invalid encrypted token: must be a non-empty string');
  }

  const key = getEncryptionKey();
  const parts = encryptedToken.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format: expected "iv:authTag:ciphertext"');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes`);
  }
  
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes`);
  }
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(key, 'hex'),
    iv
  );
  
  decipher.setAuthTag(authTag);
  
  let decrypted;
  try {
    decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
  
  return decrypted;
}

/**
 * Check if social token encryption is properly configured
 * @returns {boolean} True if key is valid
 */
function isConfigured() {
  try {
    const key = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    return !!key && key.length === 64;
  } catch {
    return false;
  }
}

/**
 * Generate a new encryption key (for setup/testing)
 * @returns {string} 64 hex character key (32 bytes)
 */
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Test the encryption/decryption with a sample value
 * @returns {boolean} True if test passes
 */
function selfTest() {
  try {
    const testValue = 'test-token-' + Date.now();
    const encrypted = encryptToken(testValue);
    const decrypted = decryptToken(encrypted);
    return decrypted === testValue;
  } catch (error) {
    console.error('Encryption self-test failed:', error.message);
    return false;
  }
}

module.exports = {
  encryptToken,
  decryptToken,
  isConfigured,
  generateKey,
  selfTest
};
