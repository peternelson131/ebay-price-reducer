# Impact Assessment: OneDrive Video Integration

**Created:** 2026-01-21

---

## Backend Impact

| Component | Impact | Changes Needed |
|-----------|--------|----------------|
| Database | **NEW** | 2 new tables: `user_onedrive_connections`, `product_videos` |
| Auth | **NEW** | Microsoft OAuth flow (new provider) |
| API | **NEW** | 8 new Netlify Functions |
| Security | **MODIFY** | Add token encryption utility |
| Existing Tables | **NONE** | No changes to existing tables |

## Frontend Impact

| Component | Impact | Changes Needed |
|-----------|--------|----------------|
| Settings Page | **MODIFY** | Add OneDrive connection section |
| Product CRM | **MODIFY** | Add video upload + gallery |
| New Components | **NEW** | FolderPicker, VideoUploader, VideoGallery |
| Routing | **NONE** | No new routes needed |

## Infrastructure Impact

| Component | Impact | Notes |
|-----------|--------|-------|
| Supabase | **MODIFY** | New tables + RLS policies |
| Netlify | **MODIFY** | New functions, env vars |
| External | **NEW** | Azure App Registration required |

## Risk Assessment

| Area | Risk Level | Notes |
|------|------------|-------|
| Existing functionality | 🟢 LOW | No changes to existing features |
| Data migration | 🟢 NONE | New tables only |
| Breaking changes | 🟢 NONE | Additive only |
| Auth complexity | 🟡 MEDIUM | New OAuth provider |

## Dependencies

### External Setup Required (Before Coding)
1. **Azure App Registration** - Microsoft OAuth credentials
   - Client ID
   - Client Secret
   - Redirect URI configuration

### Environment Variables Needed
```
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=
ENCRYPTION_KEY=  # For token encryption (may already exist)
```

---

## Agents Involved

| Agent | Responsibility |
|-------|----------------|
| **Backend** | Database schema, OAuth flow, API endpoints |
| **Frontend** | Settings UI, Upload component, Video gallery |
| **QA** | Test OAuth flow, upload reliability, isolation |
| **DevOps** | Azure setup, env vars, deployment |

---

*Assessment complete. No blocking issues. Ready for /plan.*
