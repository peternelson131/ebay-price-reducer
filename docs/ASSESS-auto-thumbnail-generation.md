# Impact Assessment: Auto-Thumbnail Generation

## Agents Consulted
- Backend: Database, APIs, image processing
- Frontend: Settings UI, zone editor component
- QA: Testing requirements

---

## Backend Impact

### Database Changes
| Change | Impact | Risk |
|--------|--------|------|
| New `thumbnail_templates` table | Low - isolated new table | Low |
| New columns on `influencer_tasks` | Low - nullable additions | Low |

### New APIs Required
1. `GET/POST/PUT/DELETE /thumbnail-templates` - CRUD operations
2. `POST /generate-thumbnail` - Image compositing

### Dependencies
- **Sharp library** - Image processing (new dependency)
- **Supabase Storage** - Template and thumbnail storage

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sharp binary size for Netlify | Low | High | Use Jimp fallback if needed |
| Storage quota exceeded | Low | Medium | Monitor usage |
| Slow generation | Medium | Low | Async generation, show loading state |

---

## Frontend Impact

### UI Changes
| Page | Change | Impact |
|------|--------|--------|
| Settings.jsx | Add "Thumbnail Templates" section | Medium |
| New component | ThumbnailZoneEditor.jsx | New file |

### User Flow
1. User navigates to Settings → Thumbnail Templates
2. Clicks "Add Template"
3. Enters owner name, uploads image
4. Draws rectangle on image to define zone
5. Saves template
6. (Later) Tasks auto-generate thumbnails using template

### Chrome Extension
| Change | Impact |
|--------|--------|
| Download button → "Download All" | Low |
| Fetches thumbnail URL alongside video | Low |
| Downloads both files | Low |

---

## Integration Points

### Existing Systems Affected
| System | How Affected |
|--------|--------------|
| Influencer task creation | Hook to trigger thumbnail generation |
| Chrome extension API | Add thumbnail_url to task response |
| Supabase Storage | New buckets for templates/thumbnails |

### No Impact To
- eBay listings functionality
- Keepa API integration (read-only, already exists)
- OneDrive integration
- Other Settings sections

---

## UX Considerations

### Settings Page
- New tab/section should match existing styling
- Zone editor should be intuitive (click + drag)
- Show preview of generated thumbnail

### Chrome Extension
- "Download All" should be clear
- Handle case where thumbnail doesn't exist
- Show download progress for both files

---

## Rollback Strategy
1. Database: Migration can be reversed (drop table, remove columns)
2. APIs: Delete new function files
3. Frontend: Remove Settings section
4. Extension: Revert to single download button

**Low risk** - feature is additive and isolated.

---

## Testing Requirements (for QA)

### Unit Tests
- [ ] Template CRUD operations
- [ ] Zone validation (must be within bounds)
- [ ] Image compositing output dimensions

### Integration Tests
- [ ] Upload template → stored in Supabase
- [ ] Create task → thumbnail generated
- [ ] Extension → downloads both files

### UI Tests
- [ ] Zone editor drag functionality
- [ ] Template list renders correctly
- [ ] Settings section visible

---

## Summary

| Aspect | Impact Level |
|--------|--------------|
| Database | Low (additive) |
| Backend | Medium (new service) |
| Frontend | Medium (new component) |
| Extension | Low (small change) |
| Existing features | None |
| **Overall Risk** | **Low** |

---

*Assessment created: 2026-01-22*
*Status: ✅ Complete*
