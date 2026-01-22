# Review Document: Auto-Thumbnail Generation

## Feature Request
User wants automated thumbnail generation for Amazon Influencer video uploads.

## Understanding

### What Pete Asked For:
1. Upload a base thumbnail template per "owner" (influencer identity)
2. Define where the product image should be placed on the template (landing zone)
3. Automatically composite the Keepa product image onto the template when tasks are created
4. Include the generated thumbnail in the Chrome extension's download feature

### Example Provided:
- Base template shows a person on the right side
- White/gray box on the left is the product landing zone
- "WATCH BEFORE YOU BUY" text overlay
- Orange arrow pointing from product to person

### Key Clarifications (from Pete):
- Each user uploads their own templates
- Account can have MULTIPLE templates (one per owner)
- Zone is defined per template and unlikely to change after setup
- Zone editor should live in Settings page
- Chrome extension should have "Download All" (video + thumbnail)

## Success Criteria
1. User can upload base thumbnail template in Settings
2. User can visually define the product landing zone (drag rectangle)
3. Thumbnails auto-generate when influencer tasks are created
4. Chrome extension downloads both video and thumbnail with one click
5. Generated thumbnails have product correctly composited in defined zone

## Scope

### In Scope:
- Database schema for templates
- Template upload and management APIs
- Image compositing service (Sharp)
- Settings page UI with zone editor
- Chrome extension "Download All" update

### Out of Scope:
- Multiple zones per template
- Text overlay customization
- AI-powered zone detection
- Batch regeneration of existing thumbnails

## Questions Answered:
- ✅ Owner = label/name per template
- ✅ Multiple templates per account
- ✅ Zone defined visually by user
- ✅ JPEG output format
- ✅ "Download All" button in extension
- ✅ Settings page location

## Related Documents
- Analysis: `docs/analysis/auto-thumbnail-generation-analysis.md`
- Plan: `docs/PLAN-auto-thumbnail-generation.md`

---
*Review created: 2026-01-22*
*Status: ✅ Complete*
