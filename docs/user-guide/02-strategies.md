# Strategies Page

## Purpose

The Strategies page lets you create and manage **price reduction rules** that automatically lower prices on your listings over time to increase sales velocity.

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Price Reduction Rules                                       │
│ Create and manage automated price reduction rules           │
│                                                [+ Add Rule] │
├─────────────────────────────────────────────────────────────┤
│ Your Rules (2)                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Conservative 5%                                         │ │
│ │ Reduction: 5%  |  Frequency: Every 7 days  |  1/11/2026 │ │
│ │                                      [Edit] [Delete]    │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Quick Sale $10                                          │ │
│ │ Reduction: $10  |  Frequency: Every 3 days  |  1/12/2026│ │
│ │                                      [Edit] [Delete]    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Creating a Rule

Click **+ Add New Rule** to open the creation modal:

**Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| **Rule Name** | Descriptive name for the strategy | "Aggressive Clearance" |
| **Reduction Type** | Percentage (%) or Dollar Amount ($) | Percentage |
| **Reduction Amount** | How much to reduce each time | 5 (for 5% or $5) |
| **Frequency (Days)** | How often to apply reduction | 7 (weekly) |

**Example Strategies:**

1. **Conservative** - 5% every 7 days (slow, steady drops)
2. **Moderate** - 10% every 5 days (faster sales)
3. **Aggressive** - $5 every 3 days (clearance mode)

### 2. Editing a Rule

Click **Edit** on any rule to modify its settings. Changes apply to all listings using that strategy.

### 3. Deleting a Rule

Click **Delete** to remove a rule. You'll be asked to confirm.

**Note**: You cannot delete a strategy that is currently assigned to listings.

## How Price Reduction Works

When a strategy is assigned to a listing:

```
Day 0:  Listing price = $100.00
Day 7:  Auto-reduce 5% → $95.00
Day 14: Auto-reduce 5% → $90.25
Day 21: Auto-reduce 5% → $85.74
...continues until minimum price reached
```

### Protection Mechanisms

1. **Minimum Price**: Reductions stop when the listing reaches its minimum price
2. **Active Toggle**: Only listings with Price Reduction = Active get reduced
3. **Manual Override**: You can always manually adjust prices

## Reduction Types

### Percentage (%)

Best for: Most situations
- Reduces price by X% of **current** price
- Natural slowdown as price drops
- Example: 5% of $100 = $5, 5% of $50 = $2.50

### Dollar Amount ($)

Best for: Clearance, fixed drops
- Reduces price by flat $X amount
- Consistent drops regardless of price
- Example: $10 off whether price is $100 or $50

## Backend

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| Supabase direct | GET | Fetch user's strategies |
| Supabase direct | POST | Create new strategy |
| Supabase direct | PUT | Update strategy |
| Supabase direct | DELETE | Delete strategy |

### Database Table: `strategies`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `name` | text | Strategy name |
| `reduction_type` | text | 'percentage' or 'dollar' |
| `reduction_amount` | decimal | Amount to reduce |
| `frequency_days` | integer | Days between reductions |
| `is_active` | boolean | Whether strategy is active |
| `created_at` | timestamp | Creation date |
