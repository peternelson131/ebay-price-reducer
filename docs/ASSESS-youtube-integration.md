# Impact Assessment: YouTube Integration

## Backend Impact

### Database Changes
New tables required:
```sql
-- Store OAuth connections (extensible to other platforms)
social_connections (
  id, user_id, platform, access_token, refresh_token,
  token_expires_at, account_id, account_name, connected_at, is_active
)

-- Posting schedule preferences
posting_schedules (
  id, user_id, platform, post_time, timezone, is_active
)

-- Post history/queue
scheduled_posts (
  id, user_id, video_id, platform, scheduled_for, title, description,
  status, posted_at, platform_post_id, error_message, retry_count
)
```

### API Endpoints
- `GET/POST /api/youtube/auth` - Start OAuth flow
- `GET /api/youtube/callback` - OAuth callback
- `GET /api/youtube/status` - Connection status
- `DELETE /api/youtube/disconnect` - Remove connection
- `GET/PUT /api/youtube/schedule` - Get/set posting schedule
- `GET /api/youtube/posts` - Post history
- `POST /api/youtube/post-now` - Manual post trigger (optional)

### Background Jobs
- Token refresh job (check daily, refresh if expiring within 7 days)
- Scheduled posting job (run every hour, post videos due)

### External Dependencies
- Google Cloud Project (need to create)
- YouTube Data API v3 (need to enable)
- OAuth 2.0 credentials (client ID, client secret)

## Frontend Impact

### New UI Components
1. **Settings > Social Connections section**
   - "Connect YouTube" button
   - Connected status display (channel name, avatar)
   - "Disconnect" option

2. **Settings > Posting Schedule section**
   - Time picker for daily post time
   - Timezone selector
   - Enable/disable toggle

3. **Post History view** (could be in CRM or separate tab)
   - List of posted/pending/failed videos
   - Status indicators
   - Retry button for failures

### Modified Components
- Account/Settings page - add new sections

## Infrastructure Impact

### Environment Variables
```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://[domain]/.netlify/functions/youtube-callback
```

### Scheduled Functions
- Netlify Scheduled Functions for:
  - Token refresh (daily)
  - Post execution (hourly)

### Storage
- Videos already in OneDrive need accessible URLs
- May need to download video → upload to YouTube (can't just provide URL)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Google quota exceeded | Low | Medium | Start with conservative limits, monitor usage |
| OAuth token expiry | Medium | High | Proactive refresh, alert on failure |
| Video upload failures | Medium | Medium | Retry logic, error notifications |
| User disconnects mid-post | Low | Low | Check connection before posting |

## Dependencies
- [ ] Google Cloud Project created
- [ ] YouTube Data API enabled
- [ ] OAuth consent screen configured
- [ ] Client credentials obtained

## Rollback Strategy
- Feature can be disabled via environment variable
- Social connections table can be cleared
- No impact on core CRM functionality

## Effort Estimate
- Backend: 1-2 days
- Frontend: 0.5-1 day
- Testing/QA: 0.5 day
- **Total: 2-3 days**

---
*Created: 2026-01-22*
*Status: Approved*
