# OpSyncPro System Overview

**Last Updated:** 2026-01-28
**Purpose:** Reference documentation for AI assistants to understand the OpSyncPro platform

---

## What is OpSyncPro?

OpSyncPro is a comprehensive platform for Amazon Influencers and e-commerce sellers that helps manage:
- Product sourcing and tracking (CRM)
- Video content creation and management
- Amazon Influencer video uploads
- Social media posting
- eBay listing management
- Price reduction strategies

---

## Architecture

### Frontend
- **Framework:** React 18 with Vite
- **Styling:** Tailwind CSS with custom theme system (light/dark mode)
- **Hosting:** Netlify (single site with branch deploys)
- **URL:** https://opsyncpro.io (production), https://uat.opsyncpro.io (UAT)

### Backend
- **Functions:** Netlify Functions (serverless)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (JWT-based)
- **Storage:** Supabase Storage + OneDrive integration

### Chrome Extension
- **Purpose:** Amazon Influencer video upload task management
- **Features:** Task list, video/thumbnail download, upload tracking

---

## Database Schema (Key Tables)

### User & Auth
- `users` - User accounts (extends Supabase auth.users)
- `user_api_keys` - API keys for integrations (eBay, Keepa, etc.)
- `user_onedrive_connections` - OneDrive OAuth tokens and folder settings

### Product CRM
- `sourced_products` - Main product tracking table
  - Fields: asin, title, image_url, video_title, status_id, brand, category, etc.
- `crm_statuses` - User-customizable status options (13 defaults)
- `crm_owners` - Product owners/influencers
- `product_owners` - Many-to-many: products ↔ owners
- `crm_collaboration_types` - Solo, Split, Consignment, etc.
- `crm_contact_sources` - Where contacts come from
- `crm_marketplaces` - eBay, Amazon, etc.

### Video Management
- `product_videos` - Videos uploaded to OneDrive
  - Fields: product_id, onedrive_file_id, filename, thumbnail_url, upload_status, social_ready_status
- `video_variants` - Different versions (original, transcoded, dubbed)

### Influencer Tasks
- `influencer_tasks` - Amazon upload tasks shown in Chrome extension
  - Fields: asin, search_asin, video_id, status, marketplace, image_url
  - `search_asin` links correlated ASINs to parent
  - `video_id` inherited from parent for correlated ASINs

### ASIN Correlations
- `asin_correlations` - Links similar products across marketplaces
- `asin_correlation_feedback` - User feedback on correlation quality

### Thumbnail System
- `thumbnail_templates` - Owner-specific thumbnail templates
  - Fields: owner_id, template_storage_path, placement_zone
- Generated thumbnails stored in `generated-thumbnails` Supabase bucket

### Social Posting
- `social_connections` - Meta/Instagram OAuth connections
- `social_posts` - Scheduled social media posts
- `social_post_jobs` - Background job queue for posting

### eBay Integration
- `listings` - eBay listing data
- `strategies` - Price reduction strategies
- `price_reduction_logs` - History of price changes

---

## Key Features

### 1. Product CRM
- Track products from sourcing to sale
- Custom statuses per user
- Multi-owner support
- Shipping/tracking integration
- Custom fields

### 2. Video Workflow
- Upload videos to OneDrive
- Auto-generate thumbnails with owner branding
- Transcode for social media
- Auto-dubbing via ElevenLabs

### 3. Amazon Influencer Tasks
- Chrome extension shows pending uploads
- Groups tasks by video (same video = same group)
- Download video + thumbnail for upload
- Track completion across marketplaces (US, CA, UK, DE)

### 4. ASIN Correlation
- Find similar products across marketplaces
- Correlated ASINs inherit video from parent
- Keepa API integration for product data

### 5. Social Media Posting
- Meta/Instagram integration
- Schedule posts with videos
- Auto-caption generation

### 6. eBay Price Reduction
- Automated price reduction strategies
- Listing management
- Inventory sync

---

## Environment Setup

### Netlify Environment Variables
| Variable | Purpose |
|----------|---------|
| SUPABASE_URL | Database connection |
| SUPABASE_ANON_KEY | Public API key |
| SUPABASE_SERVICE_ROLE_KEY | Admin API key |
| MICROSOFT_CLIENT_ID/SECRET | OneDrive OAuth |
| META_APP_ID/SECRET | Facebook/Instagram OAuth |
| EBAY_CLIENT_ID/SECRET | eBay API |
| KEEPA_API_KEY | Product data API |
| ELEVENLABS_API_KEY | Auto-dubbing |
| TRANSCODER_URL | Video transcoding service |
| WEBHOOK_SECRET | Internal automation |

### Branch Deploys
- `main` → Production (opsyncpro.io)
- `uat` → UAT (uat.opsyncpro.io) with separate Supabase project

---

## API Endpoints (Netlify Functions)

### Videos
- `POST /videos` - Save video metadata, create influencer tasks
- `GET /videos` - List videos for a product
- `DELETE /videos/:id` - Remove video

### Thumbnails
- `POST /generate-thumbnail` - Generate thumbnail for task
- `GET /get-thumbnail` - Get thumbnail download URL

### Influencer Tasks
- `GET /influencer-tasks` - List tasks (for Chrome extension)
- `PATCH /influencer-tasks/:id` - Update task status

### Products
- `GET /sourced-products` - List CRM products
- `POST /sourced-products` - Create product
- `PATCH /sourced-products/:id` - Update product

### Social
- `GET /meta-auth` - Start Meta OAuth
- `POST /meta-post` - Post to Facebook/Instagram
- `GET /instagram-inbox` - Fetch Instagram messages

### eBay
- `GET /ebay-auth` - Start eBay OAuth
- `GET /listings` - Fetch listings
- `POST /reduce-prices` - Execute price reductions

---

## Key Workflows

### Video Upload Flow
1. User uploads video in Product CRM
2. Video saved to OneDrive via `onedrive-upload-session`
3. `POST /videos` creates video record + influencer tasks
4. Tasks propagate to correlated ASINs (same search_asin)
5. Background transcode prepares for social posting
6. Chrome extension shows tasks for Amazon upload

### Thumbnail Generation Flow
1. Task created with owner assigned
2. `generate-thumbnail` called (manual or webhook)
3. Fetches owner's template from `thumbnail_templates`
4. Downloads product image from `sourced_products.image_url`
5. Composites product onto template
6. Uploads to `generated-thumbnails` bucket
7. Updates task's `image_url` with signed URL

### Correlated ASIN Inheritance
1. Parent ASIN (search_asin = asin) gets video uploaded
2. `video_id` set on parent task
3. Database trigger propagates to correlated tasks
4. `get-thumbnail` checks parent's thumbnail for correlated ASINs

---

## Chrome Extension

### Location
`/chrome-extension/` directory

### Key Files
- `sidepanel/sidepanel.js` - Main task list UI
- `manifest.json` - Extension config

### Features
- Shows pending influencer tasks grouped by video
- Download video + thumbnail button
- Mark tasks complete
- Filter by marketplace

---

## Common Issues & Solutions

### "No video" showing for correlated ASINs
- Check `video_id` is propagated from search_asin
- Run backfill: `UPDATE influencer_tasks SET video_id = parent.video_id FROM...`

### Thumbnail not downloading
- Check `generated-thumbnails` bucket exists
- Verify `image_url` contains Supabase URL
- Check `get-thumbnail` endpoint for inheritance logic

### Tasks not showing in extension
- Verify `status = 'pending'`
- Check `video_id IS NOT NULL` for video indicator

---

## Project Structure

```
/projects/ebay-price-reducer/
├── frontend/src/           # React app
│   ├── pages/              # Main page components
│   ├── components/         # Reusable components
│   ├── contexts/           # Auth, Theme contexts
│   └── lib/                # Utilities, API clients
├── netlify/functions/      # Serverless API
│   ├── utils/              # Shared utilities
│   └── *.js                # Individual endpoints
├── chrome-extension/       # Browser extension
├── supabase/migrations/    # Database migrations
├── docs/                   # Documentation
└── scripts/                # Utility scripts
```

---

## Supabase Projects

| Environment | Project ID | URL |
|-------------|------------|-----|
| Production | zxcdkanccbdeqebnabgg | https://zxcdkanccbdeqebnabgg.supabase.co |
| UAT | zzbzzpjqmbferplrwesn | https://zzbzzpjqmbferplrwesn.supabase.co |

---

## User: Pete

- **Discord:** petesflips
- **Business:** Amazon reselling/arbitrage, Influencer program
- **Tools Used:** Keepa, FlipAlert, n8n for automation
- **Preferences:** Autonomous execution, minimal back-and-forth

---

*This document is maintained by Clawd 🦞 and should be updated as the system evolves.*
