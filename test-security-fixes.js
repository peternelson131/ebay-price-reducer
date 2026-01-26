/**
 * Security Fixes Test Suite
 * Verifies token encryption, rate limiting, and log sanitization
 * 
 * Usage: node test-security-fixes.js
 */

const { encryptToken, decryptToken, isConfigured } = require('./netlify/functions/utils/social-token-encryption');
const { sanitize, sanitizeObject } = require('./netlify/functions/utils/log-sanitizer');
const { checkRateLimit } = require('./netlify/functions/utils/rate-limit');

console.log('🔒 Security Fixes Test Suite\n');
console.log('=' .repeat(60) + '\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ============================================================================
// TEST 1: Token Encryption
// ============================================================================
console.log('📦 Test 1: Token Encryption\n');

test('Encryption is configured', () => {
  assert(isConfigured(), 'SOCIAL_TOKEN_ENCRYPTION_KEY not configured');
});

test('Can encrypt a token', () => {
  const plaintext = 'test-access-token-12345';
  const encrypted = encryptToken(plaintext);
  
  assert(encrypted, 'Encrypted token is falsy');
  assert(encrypted !== plaintext, 'Encrypted token equals plaintext');
  assert(encrypted.includes(':'), 'Encrypted token missing colon separators');
  
  const parts = encrypted.split(':');
  assert(parts.length === 3, `Expected 3 parts (iv:authTag:ciphertext), got ${parts.length}`);
});

test('Can decrypt a token', () => {
  const plaintext = 'test-access-token-67890';
  const encrypted = encryptToken(plaintext);
  const decrypted = decryptToken(encrypted);
  
  assert(decrypted === plaintext, `Decrypted token doesn't match original`);
});

test('Decryption fails on tampered data', () => {
  const plaintext = 'test-access-token-abcdef';
  const encrypted = encryptToken(plaintext);
  
  // Tamper with the encrypted data
  const tampered = encrypted.replace(/.$/, '0');
  
  try {
    decryptToken(tampered);
    throw new Error('Should have thrown on tampered data');
  } catch (error) {
    assert(error.message.includes('Decryption failed'), 'Expected decryption error');
  }
});

test('Encryption produces different ciphertexts', () => {
  const plaintext = 'test-token-consistency';
  const encrypted1 = encryptToken(plaintext);
  const encrypted2 = encryptToken(plaintext);
  
  assert(encrypted1 !== encrypted2, 'Same plaintext should produce different ciphertexts (IV randomization)');
  
  const decrypted1 = decryptToken(encrypted1);
  const decrypted2 = decryptToken(encrypted2);
  
  assert(decrypted1 === plaintext, 'First decryption failed');
  assert(decrypted2 === plaintext, 'Second decryption failed');
});

// ============================================================================
// TEST 2: Rate Limiting
// ============================================================================
console.log('\n📊 Test 2: Rate Limiting\n');

test('Rate limit allows initial requests', () => {
  const result = checkRateLimit('test-user-1', 'user');
  
  assert(result.allowed === true, 'First request should be allowed');
  assert(result.remaining >= 0, 'Remaining should be non-negative');
  assert(result.limit === 100, 'User limit should be 100');
});

test('Rate limit counts requests', () => {
  const userId = 'test-user-2';
  
  const result1 = checkRateLimit(userId, 'user');
  const result2 = checkRateLimit(userId, 'user');
  
  assert(result1.remaining > result2.remaining, 'Remaining count should decrease');
});

test('Rate limit blocks after limit', () => {
  const userId = 'test-user-3';
  const limit = 10; // Use 'auth' limit for faster testing
  
  // Make requests up to the limit
  for (let i = 0; i < limit; i++) {
    const result = checkRateLimit(userId, 'auth');
    assert(result.allowed === true, `Request ${i + 1} should be allowed`);
  }
  
  // Next request should be blocked
  const blockedResult = checkRateLimit(userId, 'auth');
  assert(blockedResult.allowed === false, 'Request should be blocked after limit');
  assert(blockedResult.remaining === 0, 'Remaining should be 0');
});

test('Rate limit has proper reset time', () => {
  const result = checkRateLimit('test-user-4', 'user');
  const now = Date.now();
  
  assert(result.resetTime > now, 'Reset time should be in the future');
  assert(result.resetTime <= now + 60000, 'Reset time should be within 1 minute');
});

// ============================================================================
// TEST 3: Log Sanitization
// ============================================================================
console.log('\n🔐 Test 3: Log Sanitization\n');

test('Sanitize removes Bearer tokens', () => {
  const input = 'Authorization: Bearer abc123def456';
  const output = sanitize(input);
  
  assert(!output.includes('abc123'), 'Token should be removed');
  assert(output.includes('[REDACTED]'), 'Should contain redaction marker');
});

test('Sanitize removes access_token in JSON', () => {
  const input = '{"access_token":"secret123","user":"john"}';
  const output = sanitize(input);
  
  assert(!output.includes('secret123'), 'Token should be removed');
  assert(output.includes('[REDACTED]'), 'Should contain redaction marker');
  assert(output.includes('john'), 'Non-sensitive data should remain');
});

test('Sanitize removes access_token in URL params', () => {
  const input = 'https://api.example.com/data?access_token=secret456&user=alice';
  const output = sanitize(input);
  
  assert(!output.includes('secret456'), 'Token should be removed');
  assert(output.includes('[REDACTED]'), 'Should contain redaction marker');
  assert(output.includes('alice'), 'Non-sensitive data should remain');
});

test('Sanitize removes passwords', () => {
  const input = '{"username":"user","password":"mypassword123"}';
  const output = sanitize(input);
  
  assert(!output.includes('mypassword123'), 'Password should be removed');
  assert(output.includes('[REDACTED]'), 'Should contain redaction marker');
});

test('Sanitize removes client_secret', () => {
  const input = 'client_secret=abc123xyz789';
  const output = sanitize(input);
  
  assert(!output.includes('abc123xyz789'), 'Secret should be removed');
  assert(output.includes('[REDACTED]'), 'Should contain redaction marker');
});

test('Sanitize partially redacts emails', () => {
  const input = 'User email: john.doe@example.com';
  const output = sanitize(input);
  
  assert(!output.includes('john.doe'), 'Full email user should be redacted');
  assert(output.includes('example.com'), 'Domain should be visible');
  assert(output.includes('j*'), 'Should show partial user');
});

test('SanitizeObject redacts sensitive keys', () => {
  const input = {
    username: 'john',
    access_token: 'secret123',
    refresh_token: 'secret456',
    api_key: 'key789',
    email: 'john@example.com'
  };
  
  const output = sanitizeObject(input);
  
  assert(output.username === 'john', 'Non-sensitive field should remain');
  assert(output.access_token === '[REDACTED]', 'access_token should be redacted');
  assert(output.refresh_token === '[REDACTED]', 'refresh_token should be redacted');
  assert(output.api_key === '[REDACTED]', 'api_key should be redacted');
  assert(!output.email.includes('john@'), 'Email should be sanitized');
});

test('SanitizeObject handles nested objects', () => {
  const input = {
    user: {
      name: 'Alice',
      credentials: {
        token: 'secret',
        password: 'pass123'
      }
    }
  };
  
  const output = sanitizeObject(input);
  
  assert(output.user.name === 'Alice', 'Nested non-sensitive field should remain');
  assert(output.user.credentials.token === '[REDACTED]', 'Nested token should be redacted');
  assert(output.user.credentials.password === '[REDACTED]', 'Nested password should be redacted');
});

// ============================================================================
// TEST 4: Integration Tests
// ============================================================================
console.log('\n🔗 Test 4: Integration Tests\n');

test('Encrypted token can survive full cycle', () => {
  // Simulate: callback -> encrypt -> store -> read -> decrypt -> use -> refresh -> re-encrypt
  
  const originalToken = 'meta-access-token-xyz';
  
  // 1. Callback encrypts before storage
  const encryptedForStorage = encryptToken(originalToken);
  
  // 2. API function reads and decrypts
  const decryptedForUse = decryptToken(encryptedForStorage);
  assert(decryptedForUse === originalToken, 'Token should decrypt correctly');
  
  // 3. After refresh, re-encrypt new token
  const newToken = 'meta-access-token-refreshed';
  const encryptedNewToken = encryptToken(newToken);
  
  // 4. Read and decrypt refreshed token
  const decryptedNewToken = decryptToken(encryptedNewToken);
  assert(decryptedNewToken === newToken, 'Refreshed token should decrypt correctly');
});

test('Log sanitization catches common leaks', () => {
  const dangerousLog = {
    message: 'Token exchange successful',
    response: {
      access_token: 'EAABwzL...',
      token_type: 'bearer',
      expires_in: 5184000
    },
    user: {
      id: '12345',
      email: 'user@example.com'
    }
  };
  
  const sanitized = sanitizeObject(dangerousLog);
  
  assert(sanitized.message === 'Token exchange successful', 'Message should remain');
  assert(sanitized.response.access_token === '[REDACTED]', 'Token should be redacted');
  assert(sanitized.user.id === '12345', 'User ID should remain');
  assert(!sanitized.user.email.includes('user@'), 'Email should be sanitized');
});

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('\n📈 Test Summary:\n');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📊 Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! Security fixes are working correctly.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Review errors above.\n');
  process.exit(1);
}
