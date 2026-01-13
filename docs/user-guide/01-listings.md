# Listings Page

## Purpose

The Listings page is the main dashboard where you view, manage, and monitor all your eBay listings. From here you can:

- See all your active listings at a glance
- Enable/disable price reduction for individual listings
- Set minimum prices to protect margins
- Assign pricing strategies to listings
- Sync new listings from eBay
- Close listings directly from the app

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Your eBay Listings                                          │
│ Manage and monitor your eBay listing prices                 │
├─────────────────────────────────────────────────────────────┤
│ [🔍 Search...]                                              │
│                                                             │
│ [Active ▼] [🔄 Sync eBay]         [Add Filter] [Columns]    │
│                                                             │
│ Show: [25 ▼] per page              Showing 1-25 of X        │
├─────────────────────────────────────────────────────────────┤
│ Image | Title | Qty | Price | Min Price | Reduction | ...   │
│ ─────────────────────────────────────────────────────────── │
│ [img] | Product Name | 5 | $49.99 | [29.99] | [✓] Active    │
│ [img] | Another Item | 2 | $25.00 | [15.00] | [✓] Active    │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Search

Type in the search box to filter listings by:
- Title
- SKU
- Price
- Quantity
- Strategy name
- Any other listing data

### 2. Status Filter

Click the **Active** button to filter by listing status:
- **Active** - Listings currently live on eBay (default)
- **Ended** - Listings that have been closed or sold out
- **All** - Show all listings regardless of status

### 3. Sync eBay Button

Click **🔄 Sync eBay** to import new listings from your eBay account:
- Shows a spinner while syncing
- Displays success message with count of synced listings
- Automatically refreshes the table after sync

**Note**: Listings are also synced automatically every hour.

### 4. Columns

The table displays the following columns (customizable via Manage Columns):

| Column | Description |
|--------|-------------|
| **Image** | Product thumbnail from eBay |
| **Title** | Listing title and SKU |
| **Qty** | Available quantity |
| **Current Price** | Current eBay price |
| **Min Price** | Minimum price (floor for reductions) |
| **Price Reduction** | Toggle to enable/disable auto-reduction |
| **Strategy** | Assigned pricing strategy |
| **Age** | Days since listing was created |
| **Actions** | View on eBay, Close listing |

### 5. Inline Editing

You can edit certain fields directly in the table:

- **Min Price**: Click the input field, type a new price, and it saves automatically
- **Price Reduction**: Toggle the switch to enable/disable
- **Strategy**: Select from dropdown to assign a strategy

### 6. Actions

Each listing has action buttons:

- **View**: Opens the listing on eBay in a new tab
- **Close**: Ends the listing on eBay (with confirmation)

## Business Logic

### Quantity Filtering

Listings with **quantity = 0** are automatically hidden from the Active view because:
- No inventory means nothing to sell
- No need to reduce price on sold-out items
- Keeps the list focused on actionable items

### Price Reduction Requirements

To enable price reduction on a listing, you must:
1. Set a **minimum price** (protects your margins)
2. Toggle **Price Reduction** to Active
3. (Optional) Assign a strategy for automatic reductions

## Backend

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/listings` | GET | Fetch user's listings |
| `/api/sync-ebay-listings` | POST | Trigger eBay sync |
| `/api/reduce-price/{id}` | POST | Manually reduce a listing's price |

### Database Table: `listings`

Key columns:
- `user_id` - Owner of the listing
- `ebay_item_id` - eBay's listing ID
- `current_price` - Current eBay price
- `minimum_price` - Floor price for reductions
- `price_reduction_enabled` - Boolean toggle
- `quantity_available` - Current inventory
- `listing_status` - Active, Ended, etc.
