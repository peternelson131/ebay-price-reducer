# Social Media Platform Integrations

Documentation for each social media platform integration.

---

## Platforms

| Platform | Status | Documentation |
|----------|--------|---------------|
| [Instagram](./instagram.md) | ✅ Ready | Reels & Feed via Meta Graph API |
| [TikTok](./tiktok.md) | 📋 Planned | Content Posting API |
| [YouTube](./youtube.md) | ✅ Ready | Shorts & Videos via Data API v3 |
| [Facebook](./facebook.md) | 📋 Planned | Pages via Meta Graph API |
| [Twitter/X](./twitter.md) | 📋 Planned | API v2 |
| [LinkedIn](./linkedin.md) | 📋 Planned | Marketing API |
| [Pinterest](./pinterest.md) | 📋 Planned | API v5 |
| [Threads](./threads.md) | 📋 Planned | Threads Graph API |
| [Bluesky](./bluesky.md) | 📋 Planned | AT Protocol |

---

## Quick Reference

### Universal Video Format
All platforms accept this format:
```yaml
Container: MP4
Video: H.264 (High Profile)
Audio: AAC-LC (128 kbps)
```

### Authentication Methods
| Platform | Auth Type | Token Expiry |
|----------|-----------|--------------|
| Instagram | Meta OAuth | 60 days |
| TikTok | TikTok OAuth | 24 hours |
| YouTube | Google OAuth | 1 hour |
| Facebook | Meta OAuth | 60 days |
| Twitter | OAuth 2.0 | 2 hours |
| LinkedIn | OAuth 2.0 | 2 months |
| Pinterest | OAuth 2.0 | 1 day |
| Threads | Meta OAuth | 60 days |
| Bluesky | App Password | N/A |

### Rate Limits Summary
| Platform | Posts/Day |
|----------|-----------|
| Instagram | ~25 |
| TikTok | Varies |
| YouTube | ~100 |
| Facebook | ~50 |
| Twitter | 300/3h |
| LinkedIn | 150 |
| Pinterest | ~50 |
| Threads | 500 |
| Bluesky | Variable |

---

## Implementation Priority

1. **Phase 1** (Current): Instagram, YouTube
2. **Phase 2**: Facebook, TikTok
3. **Phase 3**: Twitter, LinkedIn
4. **Phase 4**: Pinterest, Threads, Bluesky

---

*Last updated: 2026-01-23*
