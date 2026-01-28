# OpSyncPro + Clawd Reference for Claude Projects

**Purpose:** Upload this file to a Claude Project to enable Claude to write detailed, accurate prompts for Clawd (the AI assistant running OpSyncPro development).

---

## Quick Reference

### What is OpSyncPro?
E-commerce platform for Amazon Influencers: Product CRM, video management, thumbnail generation, Amazon upload tracking, social posting, eBay price management.

### What is Clawd?
AI assistant (Claude) running on Clawdbot with access to: filesystem, shell commands, browser control, Supabase database, Netlify deployments, and specialist sub-agents.

---

## Writing Prompts for Clawd

### Template: Feature Request
```
Feature: [Clear name]

Context:
- [Current state]
- [Problem being solved]

Requirements:
1. [Requirement with acceptance criteria]
2. [Another requirement]

Tables/Endpoints:
- [Relevant database tables]
- [Relevant API endpoints]

Example:
[Concrete expected behavior]
```

### Template: Bug Fix
```
Bug: [Description]

Current: [What happens]
Expected: [What should happen]

Steps to Reproduce:
1. [Step]
2. [Step]

Files: [Relevant paths]
Tables: [Relevant tables]
```

### Template: Analysis
```
Analysis: [Topic]

Questions:
1. [Question]
2. [Question]

Context: [Background]
Output Needed: [Document/Decision/Comparison]
```

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `sourced_products` | CRM products (asin, title, status, owners) |
| `product_videos` | Videos in OneDrive |
| `influencer_tasks` | Chrome extension upload tasks |
| `thumbnail_templates` | Owner-branded thumbnail backgrounds |
| `asin_correlations` | Similar products across marketplaces |
| `crm_statuses` | Custom status options per user |
| `crm_owners` | Product owners/influencers |

### Important Relationships
- `influencer_tasks.search_asin` → parent ASIN for correlated products
- `influencer_tasks.video_id` → inherited from parent for correlated ASINs
- `product_owners.product_id` → links owners to products
- `thumbnail_templates.owner_id` → owner-specific templates

---

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /videos` | Save video, create influencer tasks |
| `GET /get-thumbnail` | Get thumbnail download URL |
| `POST /generate-thumbnail` | Generate thumbnail for task |
| `GET /influencer-tasks` | List tasks (Chrome extension) |
| `GET /sourced-products` | List CRM products |

---

## Clawd's Workflow Commands

| Command | Use When |
|---------|----------|
| `/ship` | Complete feature delivery (autonomous) |
| `/newfeature` | Complex features with checkpoints |
| `/troubleshoot` | Diagnosing problems |
| `/analysis` | Exploring without implementing |
| `/validate` | End-to-end testing loop |

---

## Specialist Agents

Clawd spawns these for domain-specific work:
- `backend` - APIs, database, server logic
- `frontend` - React UI, components, styling
- `qa` - Testing and verification
- `devops` - Deployment, CI/CD
- `documentation` - Docs and guides

---

## Autonomy Rules

Clawd prefers:
- ✅ Clear acceptance criteria over vague descriptions
- ✅ Examples of expected behavior
- ✅ References to specific tables/files
- ✅ Self-contained requests (all info in one prompt)

Clawd will NOT ask about:
- Credentials (checks `credentials.json` first)
- Permission to proceed (just proceeds)
- Verification (verifies itself with browser/tests)

---

## Example Prompts

### Example 1: Feature
```
Feature: Auto-generate thumbnail when owner assigned

Context:
- Thumbnails use owner-branded templates
- Currently requires manual trigger
- Template exists in thumbnail_templates table

Requirements:
1. When product_owners record created, trigger thumbnail generation
2. Use the owner's template from thumbnail_templates
3. Store result in influencer_tasks.image_url

Tables:
- product_owners (product_id, owner_id, is_primary)
- thumbnail_templates (owner_id, template_storage_path, placement_zone)
- influencer_tasks (asin, image_url)

Example:
- Assign owner "Pete" to product B0ABC123
- Thumbnail auto-generates using Pete's template
- Task image_url updated with Supabase signed URL
```

### Example 2: Bug Fix
```
Bug: Correlated ASINs not showing video in Chrome extension

Current: B0GCDJF3CW shows "No video" even though parent B0FY6XK7TF has video
Expected: Correlated ASINs should inherit video_id from search_asin

Tables:
- influencer_tasks (asin, search_asin, video_id)

Fix: Propagate video_id when parent task is updated
```

### Example 3: Analysis
```
Analysis: Social posting workflow optimization

Questions:
1. What's the current flow from video upload to social post?
2. Where are the bottlenecks?
3. What could be automated?

Output: Document with recommendations and effort estimates
```

---

## Tech Stack Summary

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Netlify Functions (Node.js)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (JWT)
- **Storage:** Supabase Storage + OneDrive
- **Deployment:** Netlify (git push → auto-deploy)
- **Extension:** Chrome Extension (Manifest V3)

---

## File Paths

- Frontend: `projects/ebay-price-reducer/frontend/src/`
- Functions: `projects/ebay-price-reducer/netlify/functions/`
- Migrations: `projects/ebay-price-reducer/supabase/migrations/`
- Extension: `projects/ebay-price-reducer/chrome-extension/`
- Docs: `projects/ebay-price-reducer/docs/`

---

## Environment

- **Production:** opsyncpro.io (Supabase: zxcdkanccbdeqebnabgg)
- **UAT:** uat.opsyncpro.io (Supabase: zzbzzpjqmbferplrwesn)
- **Netlify Site:** dainty-horse-49c336

---

*Upload this file to your Claude Project for persistent reference when writing prompts for Clawd 🦞*
