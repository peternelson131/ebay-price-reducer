# eBay Price Reducer - SaaS Feasibility Analysis

## Current Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│   Netlify   │────▶│  Supabase   │
│  Frontend   │     │  Functions  │     │  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    n8n      │ ◀── Problem for SaaS
                    │  Workflows  │
                    └─────────────┘
```

## What n8n Does (ASIN Correlation Feature)

1. **Keepa API Calls** - Fetches product data, variations, similar products
2. **Data Processing** - JavaScript code nodes transform data
3. **AI Evaluation** - Anthropic Claude evaluates if products are truly related
4. **Database Write** - Stores results in Supabase

## Why n8n Won't Scale for Multi-Tenant

| Issue | Impact |
|-------|--------|
| Single credential store | All users share your Keepa API quota |
| No user isolation | Workflows see all data |
| Execution limits | n8n Cloud caps concurrent runs |
| Cost | n8n Cloud pricing doesn't scale linearly |
| Latency | Webhook → n8n → back adds ~3-5s overhead |

## SaaS Options (Ranked by Effort)

### Option 1: Replace n8n with Serverless Functions (Recommended)
**Effort:** 2-3 weeks | **Cost:** Low

```
┌─────────────┐     ┌─────────────────────────────┐     ┌─────────────┐
│   React     │────▶│   Netlify/Vercel Functions  │────▶│  Supabase   │
│  Frontend   │     │   (with job queue)          │     │  Database   │
└─────────────┘     └─────────────────────────────┘     └─────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              ┌──────────┐           ┌──────────┐
              │ Keepa API │           │ Anthropic │
              └──────────┘           └──────────┘
```

**What to build:**
- `asin-correlation-worker.js` - Serverless function that does what n8n does
- Job queue (Supabase + polling, or Upstash QStash, or Inngest)
- User credential management (store per-user API keys)

**Pros:**
- No external dependencies
- Pay per execution
- Easy to add features
- Users bring their own API keys

**Cons:**
- More code to maintain
- Need to rebuild workflow logic

---

### Option 2: Self-Host n8n with Multi-Tenancy Hacks
**Effort:** 1-2 weeks | **Cost:** Medium (VPS ~$50/mo)

- Run n8n on a VPS (Railway, Render, DigitalOcean)
- Create workflow per user (via API)
- Store user credentials in n8n

**Pros:**
- Keep existing workflows
- Quick to deploy

**Cons:**
- Still hitting n8n's limits
- Credential management nightmare
- Won't scale past ~50 users
- n8n not designed for this

---

### Option 3: Hybrid - Keep n8n for Admin, Serverless for Users
**Effort:** 1 week | **Cost:** Low

- You keep using n8n for your own workflows
- Build lightweight serverless functions for paying users
- Users provide their own Keepa API keys

**Pros:**
- Fast to market
- You don't lose your workflows

**Cons:**
- Two systems to maintain

---

## What Needs to Change for SaaS

### 1. User API Key Management
```sql
-- New table
CREATE TABLE user_api_keys (
  user_id UUID REFERENCES auth.users,
  service TEXT, -- 'keepa', 'anthropic', etc.
  api_key_encrypted TEXT,
  tokens_used INT DEFAULT 0,
  created_at TIMESTAMP
);
```

### 2. Usage Tracking & Billing
```sql
CREATE TABLE usage_events (
  user_id UUID,
  event_type TEXT, -- 'asin_lookup', 'ai_evaluation'
  tokens_used INT,
  cost_cents INT,
  created_at TIMESTAMP
);
```

### 3. Rate Limiting
- Per-user rate limits
- Graceful degradation when limits hit

### 4. Multi-Tenant Data Isolation
- All queries filtered by `user_id`
- Row Level Security (RLS) in Supabase

---

## Honest Assessment

### What You Have (Good)
- ✅ Solid React frontend
- ✅ Supabase already multi-tenant ready
- ✅ Clean Netlify Functions structure
- ✅ Working product (validates demand)

### What's Missing (To Build)
- ❌ User API key management
- ❌ Billing/subscription system
- ❌ n8n replacement (serverless workers)
- ❌ Usage tracking
- ❌ Rate limiting
- ❌ Onboarding flow

### Rough Timeline
| Phase | Time | Result |
|-------|------|--------|
| 1. Serverless worker | 2 weeks | Replace n8n dependency |
| 2. User API keys | 1 week | Users bring own keys |
| 3. Billing (Stripe) | 1 week | Accept payments |
| 4. Polish & docs | 1 week | Launchable MVP |
| **Total** | **5-6 weeks** | **SaaS MVP** |

---

## My Recommendation

**Go with Option 1 (Serverless Functions)** if you're serious about SaaS.

The n8n workflow is ~200 lines of logic. I can help you port it to a Netlify Function this week. The hardest part is the AI evaluation loop, but that's just:

```javascript
// Pseudocode for serverless version
async function evaluateSimilarity(productA, productB) {
  const prompt = `Are these products similar enough to be listed together?
    Product A: ${productA.title}
    Product B: ${productB.title}`;
  
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    messages: [{ role: 'user', content: prompt }]
  });
  
  return response.content[0].text.includes('yes');
}
```

Want me to start building the serverless replacement?
