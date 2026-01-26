# Quick Deployment Guide - Security Fixes

## ⚡ Pre-Deployment (5 minutes)

### 1. Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Save this 64-character hex string - you'll need it for both UAT and Production.

### 2. Set Environment Variable

**Netlify Dashboard:**
1. Go to Site Settings → Environment Variables
2. Add new variable:
   - **Key:** `SOCIAL_TOKEN_ENCRYPTION_KEY`
   - **Value:** [paste your 64-char hex key]
   - **Scope:** Select UAT environment

---

## 🚀 Deploy to UAT

### 1. Deploy Code
```bash
cd ~/clawd/projects/ebay-price-reducer

# Verify all changes are saved
git status

# Commit and push (if not already done)
git add .
git commit -m "Security fixes: Token encryption, rate limiting, log sanitization"
git push origin uat
```

### 2. Run Migration Script

**Wait for deployment to finish**, then:

```bash
# Set environment variables for migration
export SUPABASE_URL="your-uat-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-uat-service-key"
export SOCIAL_TOKEN_ENCRYPTION_KEY="your-encryption-key"

# Run migration
node migrate-encrypt-social-tokens.js
```

Expected output:
```
🔒 Starting token encryption migration...
📊 Found X connections to process:
✅ Encrypted meta token for user abc123
✅ Encrypted instagram token for user xyz789
📈 Migration Summary:
   ✅ Encrypted: X
   ⏭️  Skipped (already encrypted): 0
   ❌ Failed: 0
✅ Migration complete! All tokens are now encrypted.
```

### 3. Test in UAT

Test these features:
- [ ] Connect Meta account (OAuth flow)
- [ ] Connect Instagram account (OAuth flow)
- [ ] Post to Meta/Instagram
- [ ] View Instagram inbox
- [ ] Send Instagram message
- [ ] Trigger rate limiting (make 11 rapid auth requests)
- [ ] Check logs (verify no tokens/secrets visible)

---

## 🎯 Deploy to Production

**Only after UAT testing passes!**

### 1. Set Production Environment Variable

**Netlify Dashboard:**
1. Go to Site Settings → Environment Variables
2. Find `SOCIAL_TOKEN_ENCRYPTION_KEY`
3. Add Production scope (or create new with same value)

### 2. Deploy Code
```bash
git push origin main  # Or your production branch
```

### 3. Run Migration Script (Production)

**BACKUP DATABASE FIRST!**

```bash
# Set production environment variables
export SUPABASE_URL="your-prod-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-prod-service-key"
export SOCIAL_TOKEN_ENCRYPTION_KEY="your-prod-encryption-key"

# Run migration
node migrate-encrypt-social-tokens.js
```

### 4. Monitor

Watch for:
- [ ] No errors in Netlify function logs
- [ ] Users can still connect accounts
- [ ] Posts still work
- [ ] No tokens in logs

---

## 🆘 Rollback (If Needed)

### Quick Rollback
```bash
git revert HEAD
git push origin main
```

### Full Rollback with Data
If you need to decrypt tokens (emergency only):

1. Revert code
2. Keep `SOCIAL_TOKEN_ENCRYPTION_KEY` in environment
3. Tokens will still work (they're already encrypted)
4. New connections will be plaintext again (not ideal)

**Better approach:** Fix the issue and redeploy.

---

## 📊 Verification

Run test suite:
```bash
export SOCIAL_TOKEN_ENCRYPTION_KEY="your-key"
node test-security-fixes.js
```

Expected: All tests pass ✅

---

## 🔍 Troubleshooting

### "SOCIAL_TOKEN_ENCRYPTION_KEY environment variable not set"
- **Fix:** Set the environment variable in Netlify
- **Note:** May need to wait 1-2 minutes for deployment

### "Decryption failed" errors
- **Cause:** Key mismatch or corrupted data
- **Fix:** Verify same key in all environments

### Migration shows "already encrypted"
- **Status:** This is normal - tokens are already encrypted
- **Action:** No further action needed

### Rate limiting too strict
- **Edit:** `netlify/functions/utils/rate-limit.js`
- **Change:** Increase `requests` value in `RATE_LIMITS` object

---

## 📞 Support

Issues? Contact Backend Agent or check:
- Full docs: `SECURITY-FIXES-SUMMARY.md`
- Test suite: `test-security-fixes.js`
- Migration: `migrate-encrypt-social-tokens.js`

---

**Total deployment time: ~15 minutes**  
**Risk level: Low** (backwards compatible, tested)
