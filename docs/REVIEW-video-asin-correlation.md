# Review Document: Video-ASIN Correlation + Multi-Marketplace Dubbing

## Request Summary
Extend the video upload system to correlate videos with approved ASIN correlation tasks, enabling users to track which videos need to be uploaded to which Amazon marketplaces, with support for auto-dubbing non-English marketplaces.

## Core Objective
When a video is uploaded to a CRM product, automatically link it to all approved correlation tasks for that product, display video availability on tasks, and enable manual dubbing for non-English marketplaces.

## Scope

### In Scope (Phase 1 - Video-Task Correlation)
- Link uploaded videos to approved correlation tasks only
- Display video status on correlation task cards
- Show which tasks have videos ready
- View original video from task context

### In Scope (Phase 2 - Dubbing & Variants)
- Manual "Dub" button for non-English marketplace tasks
- Create language sub-folders in OneDrive (e.g., `content-german/`)
- Dub once per language (shared across all tasks needing that language)
- Save dubbed files as `{ASIN}_{Language}.ext`
- Track dubbed variants with status
- Preview/download dubbed versions

### Out of Scope (Phase 3 - Future)
- User marketplace approval settings
- Auto-upload to Amazon
- Automatic dubbing triggers
- Dub cost tracking/limits

### Assumptions
- Videos are stored in OneDrive (already implemented)
- ASIN correlation system exists with approved/declined status
- Eleven Labs dubbing integration exists (dub-video.js)
- Users manually upload to Amazon influencer portal

## Relevant Context

### Past Work
- OneDrive video integration just completed (2026-01-21)
- Video upload, gallery, delete all working
- ASIN correlation exists in `influencer_tasks` table
- Auto-dubbing exists via `dub-video.js` and `dub-status.js`

### Existing Tables
- `product_videos` - Video storage metadata
- `sourced_products` - CRM products with single `asin` field
- `influencer_tasks` - ASIN correlation results (has approved/declined status)

### Marketplace-Language Mapping
| Marketplace | Language | Requires Dubbing |
|-------------|----------|------------------|
| US, CA, UK, AU | English | No |
| DE | German | Yes |
| FR | French | Yes |
| ES, MX | Spanish | Yes |
| IT | Italian | Yes |
| JP | Japanese | Yes |

## Clarifications from Pete (Already Answered)
- ✅ Only APPROVED correlations get video tasks
- ✅ Dub once per language, shared across tasks
- ✅ Manual dub trigger (button click)
- ✅ OneDrive sub-folders: `content-{language}/`
- ✅ Filename: `{OriginalASIN}_{Language}.ext`
- ✅ Manual upload to Amazon (we just prep videos)

## Open Questions
None - all questions answered during analysis phase.

## Ready for /assess: YES

---
*Created: 2026-01-21*
*Source: docs/analysis/video-asin-correlation-analysis.md*
