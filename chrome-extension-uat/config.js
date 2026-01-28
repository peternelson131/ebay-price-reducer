/**
 * UAT Environment Configuration
 * This extension connects to uat.opsyncpro.io for testing
 */

const CONFIG = {
  ENV: 'uat',
  API_BASE_URL: 'https://uat.opsyncpro.io/.netlify/functions',
  APP_URL: 'https://uat.opsyncpro.io',
  SUPABASE_URL: 'https://zzbzzpjqmbferplrwesn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Ynp6cGpxbWJmZXJwbHJ3ZXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxODg5MzksImV4cCI6MjA4Mzc2NDkzOX0.MyhWWOBVTFoSzJ_j1JjSTEcrLjOCQt4e0n_Ir0FxzGQ',
  
  // Visual indicators for UAT
  BADGE_COLOR: '#f97316', // Orange for UAT
  BADGE_TEXT: 'UAT',
  IS_UAT: true
};

// Freeze to prevent accidental modification
Object.freeze(CONFIG);

// Log environment on load (for debugging)
console.log('🧪 OpSyncPro Extension running in UAT mode');
console.log('   API:', CONFIG.API_BASE_URL);
