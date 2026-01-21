# Review Document: OneDrive Video Integration

**Created:** 2026-01-21  
**Status:** ✅ Reviewed - Moving to Implementation  
**Source:** `docs/analysis/onedrive-video-integration-analysis.md`

---

## Feature Summary

Enable users to connect their OneDrive account, upload product videos, and associate them with CRM records for Amazon Influencer workflow.

## Scope

### Phase 1 (This Implementation)
- ✅ Microsoft OAuth connection flow
- ✅ OneDrive folder picker
- ✅ Video upload with large file support (resumable uploads)
- ✅ Video metadata storage in database
- ✅ Basic CRM integration (upload + view videos)

### Future Phases (Not This Sprint)
- ❌ Chrome extension
- ❌ Amazon Influencer page automation
- ❌ Video correlation auto-association

## Key Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Users connect their own Microsoft/OneDrive account | P0 |
| 2 | Users select a default folder for video storage | P0 |
| 3 | Upload videos (100MB-1GB+) with progress tracking | P0 |
| 4 | Associate videos with CRM product records | P0 |
| 5 | View video gallery on product records | P1 |
| 6 | Multi-tenant isolation (users can't see others' videos) | P0 |

## Technical Approach

- **OAuth:** Microsoft Identity Platform (Azure AD)
- **Storage:** User's OneDrive (via Microsoft Graph API)
- **Upload:** Resumable upload sessions for large files
- **Database:** New tables for connections + video metadata
- **Security:** Encrypted OAuth tokens in Supabase

## Success Criteria

- [ ] User can connect OneDrive from Settings page
- [ ] User can select default video folder
- [ ] User can upload video (100MB+) to a CRM product
- [ ] Upload shows progress bar
- [ ] Video appears in product gallery after upload
- [ ] Different users cannot see each other's videos
- [ ] Disconnecting OneDrive removes token (not videos)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large upload failures | Resumable upload sessions with retry |
| Token expiration | Proactive token refresh |
| Rate limits | Backoff strategy |

---

*Review complete. Proceeding to /assess and /plan.*
