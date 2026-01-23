# Review Document: Self-Hosted Social Posting Service

**Date:** 2026-01-23  
**Status:** Ready for /assess  
**Triggering Request:** Build self-hosted Post-Bridge equivalent for social media video posting

---

## Request Summary

Build a unified social media posting service that allows Pete to post product videos to multiple platforms (Instagram, TikTok, YouTube, Facebook, Twitter, LinkedIn, Pinterest, Threads, Bluesky) from the eBay Price Reducer app. The service should handle:
- Video upload and transcoding to universal format
- Multi-platform posting with platform-specific configuration
- Post scheduling with calendar/list UI
- Status tracking and results

This replaces dependency on third-party services like Post-Bridge with a self-hosted solution.

---

## Core Objective

**One sentence:** Enable posting product videos to 9 social media platforms from a single interface with scheduling and automatic video transcoding.

---

## Scope

### In Scope
- **Media Service:** Presigned URL uploads, FFmpeg transcoding to H.264/AAC MP4
- **Post Service:** Create, schedule, status tracking, results
- **Platform Integrations:** All 9 platforms (Instagram, TikTok, YouTube, Facebook, Twitter, LinkedIn, Pinterest, Threads, Bluesky)
- **OAuth Flows:** Connect social accounts (popup-based per lessons)
- **Scheduling UI:** Calendar view (month/week) + list views (all/scheduled/posted/drafts)
- **Background Processing:** Cron-based scheduled post execution

### Out of Scope
- Analytics/engagement metrics (future phase)
- Comment management (future phase)
- Multi-user/team features (single user for now)
- Bulk import from external sources

### Assumptions
- Videos already exist in the app's video gallery (from existing Chrome extension)
- Existing Railway transcoder can be extended for this use case
- Instagram and YouTube OAuth flows partially exist (need extension)
- User is on Supabase Pro tier (100GB storage included)

---

## Relevant Context

### Existing Analysis Docs
Comprehensive analysis already completed and available:
- `analysis/post-bridge-technical-analysis.md` - Full API architecture reverse-engineered
- `analysis/platform-integration-spec.md` - All 9 platform requirements
- `analysis/seamless-video-posting-deep-dive.md` - FFmpeg pipelines
- `analysis/video-handling-and-scheduling-analysis.md` - Storage costs + Calendar UI
- `integrations/*.md` - Individual platform docs

### Key Findings from Analysis
1. **Universal video format:** H.264/AAC MP4 works on ALL 9 platforms
2. **Storage costs:** Minimal ($0-5/mo even for heavy use)
3. **Transcoding:** Convert immediately on upload, delete originals
4. **Scheduling:** Calendar (month/week) + list views pattern from Post-Bridge

### Applicable Lessons
- **OAuth patterns** (`lessons/oauth-patterns.md`): Use popup windows for all OAuth flows - keeps user on app page, clear visual feedback
- **API design** (`lessons/api-design.md`): Check bulk endpoints, cache aggressively, consider rate limits per platform

---

## Implementation Estimate

From analysis docs: **~28 hours total**

| Phase | Hours |
|-------|-------|
| Video handling (presigned URLs, transcode) | 4h |
| Storage optimization (cleanup, retention) | 2h |
| Database schema (social_posts table) | 2h |
| Calendar UI (month/week views) | 8h |
| List views (all/scheduled/posted/drafts) | 4h |
| Schedule modal (date/time/platform picker) | 4h |
| Cron processing (scheduled post execution) | 4h |

---

## Open Questions

None - the analysis docs are comprehensive. All business decisions were made during the analysis phase:
- ✅ Platform scope: All 9 platforms
- ✅ Storage strategy: 30-day retention, delete after posting
- ✅ UI pattern: Calendar + list views
- ✅ Video format: Universal H.264/AAC

---

## Ready for /assess: YES

The scope is clear, analysis is complete, and no blocking questions remain. Ready to assess impact across all agents.

---

*Review completed: 2026-01-23*
