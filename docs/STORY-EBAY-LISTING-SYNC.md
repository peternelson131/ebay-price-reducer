# Story: eBay Listing Sync

## Overview

Implement automatic hourly sync of eBay listings with a manual "Sync Now" button. The sync should properly handle listing lifecycle states including closed listings and zero-stock items.

## Business Requirements

1. **Automatic Sync**: Listings should sync from eBay every hour automatically
2. **Manual Sync**: Users can trigger an immediate sync via "Sync Now" button
3. **Closed Listings**: Mark listings as `Ended` when they're closed on eBay
4. **Zero Stock**: Update `quantity_available` to reflect actual eBay inventory
5. **New Listings**: Import any new listings created directly on eBay

## User Stories

### US-1: Automatic Hourly Sync
**As a** seller
**I want** my eBay listings to automatically sync every hour
**So that** I don't have to manually trigger imports

**Acceptance Criteria:**
- [ ] Scheduled function runs every hour
- [ ] Syncs both Trading API and Inventory API listings
- [ ] Updates existing listings (price, quantity, status)
- [ ] Creates new listings not yet in database
- [ ] Logs sync results for debugging

### US-2: Manual Sync Button
**As a** seller
**I want** a "Sync Now" button on the Listings page
**So that** I can immediately import new listings when needed

**Acceptance Criteria:**
- [ ] Button visible on Listings page header
- [ ] Shows loading state while syncing
- [ ] Displays success/error message after sync
- [ ] Shows count of listings synced/updated
- [ ] Disabled while sync is in progress

### US-3: Handle Closed Listings
**As a** seller
**I want** closed eBay listings to be marked as Ended
**So that** they don't appear in my active listings view

**Acceptance Criteria:**
- [ ] Sync detects listings no longer active on eBay
- [ ] Updates `listing_status` to 'Ended'
- [ ] Sets `ended_at` timestamp
- [ ] Listing disappears from Active view (existing filter handles this)

### US-4: Handle Zero Stock
**As a** seller
**I want** sold-out listings to show accurate quantity
**So that** I know which items need restocking

**Acceptance Criteria:**
- [ ] Sync updates `quantity_available` from eBay
- [ ] Zero-stock active listings hidden from Active view (already implemented)
- [ ] Quantity changes reflected immediately after sync

---

## Technical Design

### Backend Components

#### 1. Scheduled Function (NEW)
**File**: `netlify/functions/sync-ebay-listings-scheduled.js`

```javascript
// Netlify scheduled function - runs hourly
// @netlify/functions schedule: "0 * * * *" (every hour at :00)

exports.handler = async (event, context) => {
  // 1. Get all users with connected eBay accounts
  // 2. For each user, call sync-ebay-listings
  // 3. Log results
};
```

**netlify.toml addition:**
```toml
[functions."sync-ebay-listings-scheduled"]
schedule = "0 * * * *"
```

#### 2. Update Existing Sync Functions
**Files**: 
- `sync-trading-api-listings.js`
- `sync-inventory-api-listings.js`

**Changes needed:**
- Detect closed/ended listings
- Update `listing_status` = 'Ended' for closed items
- Set `ended_at` = current timestamp
- Update `quantity_available` accurately
- Handle "item not found" as ended

#### 3. API Endpoint for Manual Sync
**File**: `sync-ebay-listings.js` (existing)

Already exists, just needs UI integration.

---

### Frontend Components

#### 1. Sync Button on Listings Page
**File**: `frontend/src/pages/Listings.jsx`

**Location**: Header area, next to "Active" filter button

**States:**
- Default: "Sync eBay" with refresh icon
- Loading: "Syncing..." with spinner
- Success: Toast notification with stats
- Error: Toast notification with error message

**UI Mockup:**
```
┌─────────────────────────────────────────────────────┐
│ Your eBay Listings                                  │
│ Manage and monitor your eBay listing prices         │
├─────────────────────────────────────────────────────┤
│ [🔍 Search...]                                      │
│                                                     │
│ [Active ▼] [🔄 Sync eBay]     [Add Filter] [Columns]│
│                                                     │
│ Showing 1-25 of 142 listings    Last synced: 5m ago │
└─────────────────────────────────────────────────────┘
```

#### 2. Last Sync Timestamp
Display when listings were last synced (optional enhancement).

---

## Data Flow

### Sync Process
```
1. Trigger (scheduled or manual)
         │
         ▼
2. Get user's eBay access token
         │
         ▼
3. Call eBay Trading API (GetMyeBaySelling)
   - Get active listings
   - Get ended listings (last 30 days)
         │
         ▼
4. Call eBay Inventory API (getInventoryItems)
   - Get all inventory items
   - Get offer details for each
         │
         ▼
5. For each listing:
   ├─ If exists in DB → UPDATE (price, qty, status)
   └─ If new → INSERT
         │
         ▼
6. For DB listings not in eBay response:
   └─ Mark as 'Ended' (sold or manually closed)
         │
         ▼
7. Return stats: { synced, created, updated, ended }
```

### Status Mapping
| eBay Status | DB listing_status | Notes |
|-------------|-------------------|-------|
| Active | Active | Normal listing |
| Ended | Ended | Sold, closed, or expired |
| Completed | Ended | Auction completed |
| Not Found | Ended | Deleted from eBay |

---

## Implementation Tasks

### Backend (Agent 1)
- [ ] Create `sync-ebay-listings-scheduled.js` scheduled function
- [ ] Update `sync-trading-api-listings.js` to handle ended listings
- [ ] Update `sync-inventory-api-listings.js` to handle ended listings
- [ ] Add logic to mark missing listings as Ended
- [ ] Add `netlify.toml` schedule configuration
- [ ] Test with UAT environment

### Frontend (Agent 2)
- [ ] Add "Sync eBay" button to Listings.jsx header
- [ ] Implement loading state with spinner
- [ ] Add success/error toast notifications
- [ ] Display sync stats (created, updated, ended)
- [ ] Optional: Add "Last synced" timestamp display

---

## Testing

### Test Cases
1. **TC-1**: Manual sync imports new listing created on eBay
2. **TC-2**: Manual sync updates quantity for existing listing
3. **TC-3**: Manual sync marks closed listing as Ended
4. **TC-4**: Scheduled sync runs automatically (check logs)
5. **TC-5**: Sync handles eBay API errors gracefully
6. **TC-6**: Sync button shows loading state
7. **TC-7**: Success toast shows accurate counts

### UAT Test Data
- Create listing on eBay sandbox
- Trigger manual sync
- Verify listing appears
- Close listing on eBay
- Trigger sync again
- Verify listing marked as Ended

---

## Definition of Done

- [ ] Scheduled function deployed and running hourly
- [ ] Sync Now button functional in UI
- [ ] Closed listings properly marked as Ended
- [ ] Zero stock quantity updated correctly
- [ ] No console errors
- [ ] Tested in UAT environment
- [ ] Documentation updated
