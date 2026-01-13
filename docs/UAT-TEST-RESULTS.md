# UAT Test Results - 2026-01-12

## Environment Setup ✅
- **Supabase UAT**: `zzbzzpjqmbferplrwesn.supabase.co`
- **Netlify UAT**: `ebay-price-reducer-uat.netlify.app`
- **eBay Sandbox**: Connected (PeterNel-jcashonl-SBX-*)

## Test Account
- **Email**: `uat-tester@test.com`
- **Password**: `uattesting123`
- **User ID**: `a0629230-b11c-4cf1-8742-12d5d66cae64`

---

## Test Results

### ✅ PASSED Tests

| Test | Status | Notes |
|------|--------|-------|
| Site loads | ✅ | UAT site accessible |
| Login page renders | ✅ | Form displays correctly |
| User login | ✅ | Successfully authenticates with test user |
| Session persistence | ✅ | User stays logged in after login |
| Navigation | ✅ | All nav links work |
| Listings page | ✅ | Shows empty state correctly |
| Strategies page | ✅ | Shows rules count correctly |
| Strategy display | ✅ | Created strategy appears in list |
| Database connection | ✅ | Supabase queries working |
| RLS policies | ✅ | User can only see own data |

### 🐛 BUGS FOUND

| Bug ID | Severity | Description | Page | Details |
|--------|----------|-------------|------|---------|
| UAT-001 | Medium | Strategy shows "$5" instead of "5%" | Strategies | reduction_type not being used in display |
| UAT-002 | Low | Shows "Every days" not "Every 7 days" | Strategies | frequency_days value missing in display |
| UAT-003 | Medium | Schema cache timing | All | PostgREST cache takes time to refresh after schema changes |

### ⚠️ Potential Issues

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Schema mismatch | High | Added missing columns to UAT database |
| Netlify env vars in build | Medium | Must build with VITE_* vars set |

---

## Quick Reference

### Schema Columns Added to UAT
```sql
-- Added to users table:
subscription_plan, subscription_active, subscription_expires_at,
listing_limit, is_active, last_login, login_count, n8n_webhook_url
```

### Test Strategy Created
```json
{
  "id": "b2285342-c9a5-47ba-b9a1-2f3c544f76f6",
  "name": "UAT Test Rule 5%",
  "reduction_type": "percentage",
  "reduction_amount": 5.00,
  "frequency_days": 7
}
```

---

## Next Tests to Run

- [ ] Create strategy from UI (currently failing - investigate)
- [ ] Edit existing strategy
- [ ] Delete strategy (with confirmation dialog)
- [ ] eBay OAuth flow with sandbox
- [ ] Listing sync from eBay sandbox
- [ ] Price update to eBay sandbox
- [ ] Keepa API lookup

## Commands for Re-Testing

```bash
# Refresh Supabase schema cache
NOTIFY pgrst, 'reload schema';

# Rebuild with UAT env vars
VITE_SUPABASE_URL="https://zzbzzpjqmbferplrwesn.supabase.co" \
VITE_SUPABASE_ANON_KEY="..." npm run build

# Deploy to UAT
npx netlify-cli deploy --dir=frontend/dist --functions=netlify/functions \
  --site=da138fe7-497a-466a-8217-45351cbaf689 --prod
```
