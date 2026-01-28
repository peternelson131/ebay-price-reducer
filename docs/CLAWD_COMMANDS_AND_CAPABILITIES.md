# Clawd Commands & Capabilities Reference

**Last Updated:** 2026-01-28
**Purpose:** Reference for writing prompts that Clawd (Clawdbot) can execute

---

## Who is Clawd?

Clawd 🦞 is an AI assistant running on Clawdbot - a platform that connects Claude to external tools and services. Clawd operates autonomously, has access to the filesystem, can execute shell commands, control browsers, manage deployments, and interact with APIs.

---

## Custom Workflow Commands

These are structured workflows defined in `/clawd/commands/`:

### `/ship` - Autonomous Feature Delivery
**Purpose:** Fully autonomous feature implementation with self-verification
**Flow:**
1. Gather requirements and credentials upfront
2. Spawn appropriate specialist agents (backend, frontend, etc.)
3. Implement changes
4. Deploy to UAT, verify
5. Deploy to production, verify
6. Report completion with evidence

**When to use:** New features, bug fixes, complete implementations

---

### `/newfeature` - Modular Feature Development
**Purpose:** Orchestrates the full feature workflow with checkpoints
**Sub-commands:**
- `/review` - Understand the ask, create Review Document
- `/assess` - Impact analysis across all agents
- `/plan` - Task breakdown with acceptance criteria
- `/implement` - Execute tasks with domain agents
- `/confirm` - QA verification with UI testing
- `/iterate` - Pivot approach if current path fails
- `/teach` - Compile and document lessons learned
- `/document` - Update documentation

---

### `/troubleshoot` - Problem Solving
**Purpose:** Diagnose and fix issues systematically
**Sub-commands:**
- `/diagnose` - Understand & reproduce the problem
- `/investigate` - Root cause analysis

---

### `/analysis` - Deep Exploration (No Implementation)
**Purpose:** Explore a feature idea without implementing
**Output:** Analysis documents with options and trade-offs

---

### `/validate` - Automated Testing Loop
**Purpose:** Deploy → test → check → fix loop for end-to-end validation

---

### `/revise` - Iterate on Existing Features
**Purpose:** Bug fixes, UI tweaks, enhancements to existing features

---

## Agent System

Clawd coordinates specialist agents for different domains:

| Agent | Domain | Responsibilities |
|-------|--------|------------------|
| `backend` | APIs, databases, server logic | Backend code, API design, database schema, security |
| `frontend` | React, UI/UX, components | Frontend code, UI bugs, styling, user experience |
| `qa` | Testing, verification | Test all changes, verify functionality, catch regressions |
| `ebay` | eBay API, policies, listings | eBay-specific features, API issues |
| `amazon` | Amazon API, Keepa, products | Amazon/Keepa integration, ASIN lookups |
| `devops` | Deployment, CI/CD, infra | Netlify, Supabase, environment issues |
| `documentation` | Docs, guides, specs | User guides, API docs, technical specs |
| `planning` | Task breakdown, coordination | Breaking work into deliverables |
| `teacher` | Explanations, tutorials | Learning from mistakes, explanations |

---

## Tool Capabilities

### File Operations
```
read [path]              - Read file contents
write [path] [content]   - Create/overwrite file
edit [path]              - Make precise edits to files
```

### Shell Commands
```
exec [command]           - Run shell commands
bash [command]           - Execute bash commands
process [action]         - Manage background processes
```

### Web & Browser
```
web_search [query]       - Search the web (Brave API)
web_fetch [url]          - Fetch and extract content from URL
browser [action]         - Control web browser (screenshots, navigation, etc.)
```

### Supabase Database
```
# Direct API calls via curl
curl -s "$SUPABASE_URL/rest/v1/[table]" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY"

# Query via Management API
curl -s -X POST "https://api.supabase.com/v1/projects/[project]/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d '{"query": "SELECT ..."}'
```

### Netlify Deployment
```
# Check deploy status
curl -s "https://api.netlify.com/api/v1/sites/[site_id]/deploys" \
  -H "Authorization: Bearer $NETLIFY_TOKEN"

# Trigger deploy
git push  # Auto-deploys via GitHub integration

# Set environment variables
netlify env:set [KEY] [value] --context [production|branch-deploy]
```

### Memory System
```
memory_search [query]    - Search memory files semantically
memory_get [path]        - Read specific memory file
```

### Messaging
```
message [action]         - Send messages via Discord/Slack/etc.
sessions_spawn [agent]   - Spawn background sub-agent
sessions_send [message]  - Send message to another session
```

### Scheduling
```
cron [action]            - Manage scheduled jobs (reminders, etc.)
```

---

## Prompt Writing Guidelines

### For Feature Requests

**Good prompt structure:**
```
Feature: [Clear name]

Context:
- [What exists currently]
- [What problem this solves]

Requirements:
1. [Specific requirement with acceptance criteria]
2. [Another requirement]

Technical Notes:
- [Relevant tables/endpoints]
- [Related existing code]

Example:
- [Concrete example of expected behavior]
```

**Example:**
```
Feature: Auto-create upload task after video download

Context:
- Videos are uploaded to OneDrive and tracked in product_videos table
- Influencer tasks track what needs to be uploaded to Amazon
- Currently tasks must be created manually

Requirements:
1. When video upload_status becomes 'complete', create influencer task
2. Task should link to the CRM record and video
3. Failed downloads should NOT create tasks

Technical Notes:
- Table: influencer_tasks (asin, video_id, search_asin, status)
- Table: product_videos (product_id, upload_status)
- Endpoint: POST /videos handles video metadata

Example:
- Upload video for ASIN B0ABC123
- Task created: {asin: "B0ABC123", video_id: "xxx", status: "pending"}
```

---

### For Bug Reports

**Good prompt structure:**
```
Bug: [Short description]

Current Behavior:
- [What happens now]
- [Error messages if any]

Expected Behavior:
- [What should happen]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]

Relevant Files/Tables:
- [File paths]
- [Database tables]

Screenshots/Evidence:
- [Attach if available]
```

---

### For Analysis Requests

**Good prompt structure:**
```
Analysis: [Topic]

Questions to Answer:
1. [Specific question]
2. [Another question]

Context:
- [Background information]

Constraints:
- [Any limitations]
- [Budget/time constraints]

Output Needed:
- [Document? Decision? Comparison?]
```

---

## Credentials Location

All credentials are stored in: `~/clawd/secrets/credentials.json`

Contains:
- `netlify.personalAccessToken`
- `supabase.accessToken`
- `supabase.projects.production.*`
- `supabase.projects.uat.*`
- `keepa.apiKey`
- `discord.guildId`
- `ebay.clientId/clientSecret`

**Important:** Clawd checks this file BEFORE asking for credentials.

---

## Working Directory

Clawd's workspace: `/Users/jcsdirect/clawd`

Key paths:
- `projects/ebay-price-reducer/` - OpSyncPro codebase
- `memory/` - Daily logs and persistent memory
- `lessons/` - Documented learnings from past mistakes
- `secrets/` - Credentials (not committed to git)
- `commands/` - Custom workflow definitions

---

## Response Expectations

### What Clawd Does Well
- ✅ Autonomous implementation without hand-holding
- ✅ Self-verification with screenshots/evidence
- ✅ Database queries and migrations
- ✅ Git commits and deployments
- ✅ Browser automation for testing
- ✅ Multi-step workflows with checkpoints

### What Clawd Needs
- ❌ Ambiguous requirements → provide clear acceptance criteria
- ❌ Missing context → reference relevant tables/files
- ❌ Vague scope → specify what's in/out of scope

---

## Common Patterns

### Database Update
```sql
-- Update via Supabase Management API
curl -s -X POST "https://api.supabase.com/v1/projects/[project]/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "UPDATE table SET col = value WHERE condition"}'
```

### Create Migration
```sql
-- Save to supabase/migrations/YYYYMMDD_description.sql
CREATE TABLE IF NOT EXISTS ...;
ALTER TABLE ... ADD COLUMN ...;
CREATE OR REPLACE FUNCTION ...;
```

### Deploy to Production
```bash
cd /Users/jcsdirect/clawd/projects/ebay-price-reducer
git add -A && git commit -m "message" && git push
# Wait for Netlify build (check via API)
```

### Generate Thumbnail
```bash
curl -X POST "https://opsyncpro.io/.netlify/functions/generate-thumbnail" \
  -H "x-webhook-secret: $SECRET" \
  -d '{"taskId": "uuid"}'
```

### Check Task Status
```bash
curl -s "$SUPABASE_URL/rest/v1/influencer_tasks?asin=eq.B0XXX" \
  -H "apikey: $KEY" | jq
```

---

## Autonomy Principles

1. **Don't ask what you can discover** - Check files, query databases, test APIs
2. **Don't ask for verification** - Verify yourself with browser/screenshots
3. **Don't ask to proceed** - Just proceed unless destructive
4. **Gather credentials upfront** - Check credentials.json first
5. **One input → Complete delivery** - Minimize back-and-forth

---

*This document is maintained by Clawd 🦞 for use in Claude Projects.*
