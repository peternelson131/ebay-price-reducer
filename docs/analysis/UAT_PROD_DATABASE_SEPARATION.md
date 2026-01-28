# Analysis: UAT/Production Database Separation

**Date:** 2026-01-27
**Status:** Investigation Complete - Awaiting Action
**Priority:** HIGH

---

## Summary

UAT and Production environments are currently sharing the same Supabase database. This is a significant risk - changes in UAT affect Production and vice versa.

---

## Investigation Findings

### Confirmed: Same Database ⚠️

| Environment | Netlify Site | Supabase URL | Project ID |
|-------------|-------------|--------------|------------|
| **UAT** | dainty-horse-49c336 (uat branch) | `https://zxcdkanccbdeqebnabgg.supabase.co` | `zxcdkanccbdeqebnabgg` |
| **Production** | dainty-horse-49c336 (main branch) | `https://zxcdkanccbdeqebnabgg.supabase.co` | `zxcdkanccbdeqebnabgg` |

**Same database? YES**

### Root Cause

All Supabase environment variables in Netlify are set with `context: "all"`, meaning both UAT and Production branches use identical database connection values. When the sites were consolidated to a single Netlify site with branch deploys, branch-specific environment variables were not configured.

### Existing Supabase Projects

| Project | ID | Status | Notes |
|---------|-----|--------|-------|
| ebay-price-reducer | `zxcdkanccbdeqebnabgg` | ✅ ACTIVE | Currently used by BOTH environments |
| **ebay-price-reducer-uat** | `zzbzzpjqmbferplrwesn` | ❌ INACTIVE | Created 2026-01-12, never activated |
| website | `pvabhjacoatfbnkmvkvk` | ❌ INACTIVE | Unrelated project |

### Good News

An `ebay-price-reducer-uat` Supabase project already exists but is paused/inactive. It can be reactivated and used.

---

## Risks of Current State

1. **Data Corruption** - UAT testing could corrupt production data
2. **False Positives** - UAT tests may pass because they're hitting real data
3. **Privacy Concerns** - Test users see real customer data
4. **Deployment Risk** - Can't safely test database migrations in UAT first

---

## Recommended Separation Plan

### Phase 1: Reactivate UAT Project

1. Log into Supabase dashboard
2. Find `ebay-price-reducer-uat` project
3. Reactivate/resume the project
4. Note the new connection credentials

### Phase 2: Schema Sync

1. Export schema from Production (tables, views, functions, RLS policies, triggers)
   ```bash
   # Using Supabase CLI
   supabase db dump --project-ref zxcdkanccbdeqebnabgg --schema-only > schema.sql
   ```
2. Apply schema to UAT project
   ```bash
   supabase db push --project-ref zzbzzpjqmbferplrwesn
   ```
3. Verify schema matches

### Phase 3: Configure Branch-Specific Environment Variables

Update Netlify environment variables to use branch contexts:

**For UAT branch (`uat`):**
```
SUPABASE_URL = https://zzbzzpjqmbferplrwesn.supabase.co
SUPABASE_ANON_KEY = [UAT anon key]
SUPABASE_SERVICE_ROLE_KEY = [UAT service role key]
VITE_SUPABASE_URL = https://zzbzzpjqmbferplrwesn.supabase.co
VITE_SUPABASE_ANON_KEY = [UAT anon key]
```

**For Production branch (`main`):**
```
SUPABASE_URL = https://zxcdkanccbdeqebnabgg.supabase.co
SUPABASE_ANON_KEY = [existing production anon key]
SUPABASE_SERVICE_ROLE_KEY = [existing production service role key]
VITE_SUPABASE_URL = https://zxcdkanccbdeqebnabgg.supabase.co
VITE_SUPABASE_ANON_KEY = [existing production anon key]
```

### Phase 4: Seed UAT Data

- Do NOT copy production data (privacy concern)
- Create fresh test accounts
- Seed with demo/fake products
- Or use existing demo environment setup

### Phase 5: Verification

1. Make a test change in UAT database
2. Confirm it does NOT appear in Production
3. Make a test change in Production  
4. Confirm it does NOT appear in UAT

---

## Components That Connect to Database

| Component | Currently Points To | Needs UAT Version? |
|-----------|--------------------|--------------------|
| Web app (UAT branch) | Production DB | ✅ Yes - needs UAT DB |
| Web app (Production branch) | Production DB | Already correct |
| Netlify Functions (UAT) | Production DB | ✅ Yes - needs UAT DB |
| Netlify Functions (Prod) | Production DB | Already correct |
| PWA | Production DB | Maybe - depends on usage |
| Chrome Extension | Production DB | Maybe - depends on usage |
| n8n workflows | Production DB | Probably keep on Prod only |

---

## Action Items

- [ ] Pete: Reactivate `ebay-price-reducer-uat` in Supabase dashboard
- [ ] Clawd: Export production schema
- [ ] Clawd: Import schema to UAT project
- [ ] Clawd: Configure branch-specific Netlify env vars
- [ ] Clawd: Create test seed data for UAT
- [ ] Clawd: Verify separation works
- [ ] Clawd: Update credentials.json with both connections
- [ ] Clawd: Document both environments

---

## Questions to Answer Before Proceeding

1. ✅ Is there an existing UAT Supabase project? **Yes - `ebay-price-reducer-uat`**
2. How much test data do we need in UAT?
3. Are there any services that should NOT be separated (keep pointing to prod)?
4. Should we set up automated schema sync between environments?
5. Who needs access to the UAT Supabase dashboard?

---

## Estimated Effort

- Reactivate project: 5 minutes (Pete in dashboard)
- Schema sync: 15-30 minutes
- Environment variable setup: 15 minutes
- Seed data creation: 30-60 minutes
- Verification: 15 minutes

**Total: ~1.5-2 hours**

---

## References

- Production Supabase: https://supabase.com/dashboard/project/zxcdkanccbdeqebnabgg
- UAT Supabase: https://supabase.com/dashboard/project/zzbzzpjqmbferplrwesn
- Netlify Site: https://app.netlify.com/sites/dainty-horse-49c336
