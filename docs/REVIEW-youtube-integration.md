# Review Document: YouTube Integration

## Feature Request
Build YouTube integration allowing users to connect their YouTube channel and automatically post videos as YouTube Shorts on a daily schedule.

## Understanding

### What
- OAuth integration with YouTube (Google) API
- User connects their YouTube channel in Settings
- Videos from CRM can be scheduled to post to YouTube Shorts
- Initial MVP: Daily posting at a user-configured time

### Who
- Any user of the app (multi-tenant)
- Each user connects their own YouTube channel

### Why
- Save time by automating social media posting
- Extend reach of influencer videos beyond Amazon

## Scope

### In Scope
- YouTube OAuth 2.0 connection flow
- Token storage and refresh
- Settings UI for connecting YouTube
- Daily scheduled posting (configurable time)
- Post videos as Shorts with auto-generated titles
- Basic post history/status

### Out of Scope (Phase 1)
- Other platforms (Instagram, TikTok, Facebook) - future phases
- Calendar-based scheduling - future enhancement
- Analytics/performance tracking
- Bulk scheduling UI

## Success Criteria
1. User can connect their YouTube channel via OAuth
2. User can set a daily posting time
3. System posts one video per day as a Short
4. User can see post history (success/failed)
5. Tokens auto-refresh before expiry

## Technical Context
- YouTube Data API v3
- No Google approval wait (just enable in Google Cloud Console)
- Videos < 60 seconds + vertical aspect ratio = auto-detected as Shorts
- Default quota: ~6 uploads/day (can request increase)
- OAuth 2.0 with refresh tokens

## Questions Resolved
- Multi-tenant: Yes, each user connects their own channel
- Same pattern will work for other platforms later
- Per-owner connections possible in future (Model B from analysis)

---
*Created: 2026-01-22*
*Status: Approved*
