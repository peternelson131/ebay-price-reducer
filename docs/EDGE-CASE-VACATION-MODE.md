# Edge Case: eBay Vacation Mode

> How vacation mode affects listing sync and price reductions

---

## Overview

When a seller enables **Vacation Mode** on eBay, their listings remain technically active but have modified visibility and handling times. This creates edge cases for our import and price reduction logic.

---

## How eBay Vacation Mode Works

### Vacation Mode Options (Seller Settings)
| Setting | Description |
|---------|-------------|
| **Display Away Message** | Shows "Seller Away" banner on listings |
| **Hide Listings from Search** | Removes from search results (optional) |
| **Extended Handling Time** | Automatically adds days to shipping estimate |
| **Disable Immediate Payment** | Allows buyers to wait (optional) |
| **Start/End Date** | Schedule vacation period |
| **Auto-Response Message** | Message to buyers who contact seller |

### What Happens to Listings
- **Listing Status**: Remains `Active` (not `Ended` or `Inactive`)
- **Visibility**: Reduced if "hide from search" enabled
- **Purchasing**: Still possible unless seller disables
- **Handling Time**: Extended by vacation duration

---

## API Behavior During Vacation Mode

### Trading API (GetMyeBaySelling)

**Listings still appear in results with status `Active`:**
```xml
<GetMyeBaySellingResponse>
  <ActiveList>
    <ItemArray>
      <Item>
        <ItemID>123456789</ItemID>
        <SellingStatus>
          <ListingStatus>Active</ListingStatus>  <!-- Still Active! -->
        </SellingStatus>
        <!-- No vacation-specific field on the item itself -->
      </Item>
    </ItemArray>
  </ActiveList>
</GetMyeBaySellingResponse>
```

**⚠️ Key Point:** GetMyeBaySelling does NOT indicate vacation mode on individual listings.

### Trading API (GetUser / GetUserPreferences)

**Vacation settings are on the SELLER ACCOUNT, not listings:**
```xml
<GetUserPreferencesResponse>
  <SellerVacationPreferences>
    <OnVacation>true</OnVacation>
    <ReturnDate>2026-01-20</ReturnDate>
    <VacationMessage>On vacation until Jan 20</VacationMessage>
    <HideFixedPriceListings>true</HideFixedPriceListings>
    <MessageDisplayOption>ShowOnAllListings</MessageDisplayOption>
  </SellerVacationPreferences>
</GetUserPreferencesResponse>
```

### Inventory API

**Listings/Offers remain PUBLISHED:**
```json
{
  "offers": [{
    "offerId": "123456789",
    "status": "PUBLISHED",  // Still published!
    "pricingSummary": {
      "price": { "value": "24.99", "currency": "USD" }
    }
  }]
}
```

**⚠️ Key Point:** Inventory API does NOT expose vacation mode status.

### Account API (sell/account/v1)

**No direct vacation mode endpoint in REST APIs.**

The vacation settings are primarily managed through:
1. eBay Seller Hub UI
2. Trading API (GetUserPreferences / SetUserPreferences)

---

## Detecting Vacation Mode

### Recommended: Check via Trading API

```typescript
// Call GetUserPreferences to check vacation status
async function checkVacationMode(userToken: string): Promise<VacationStatus> {
  const response = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetUserPreferences',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-SITEID': '0',
      'Content-Type': 'text/xml',
      'X-EBAY-API-IAF-TOKEN': userToken,
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
      <GetUserPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <ShowSellerPaymentPreferences>false</ShowSellerPaymentPreferences>
        <ShowSellerReturnPreferences>false</ShowSellerReturnPreferences>
        <ShowSellerFavoriteItemPreferences>false</ShowSellerFavoriteItemPreferences>
        <!-- No direct vacation preference flag - need to check via other means -->
      </GetUserPreferencesRequest>`,
  });
  
  // Parse XML response for vacation settings
  // Note: May need GetUser call instead for vacation info
}
```

### Alternative: Store Vacation Status Manually

Add a user preference in our database:
```sql
ALTER TABLE user_profiles ADD COLUMN vacation_mode BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN vacation_until TIMESTAMP;
```

User can toggle in our app, or we prompt when sync runs.

---

## Impact on Price Reducer

### Should We Reduce Prices During Vacation?

| Scenario | Recommendation | Reason |
|----------|---------------|--------|
| **Standard vacation (listings visible)** | ⚠️ **Pause** | No sales happening, price drops waste margin |
| **Vacation + hidden from search** | ❌ **Definitely Pause** | Zero visibility = zero sales |
| **Short vacation (<3 days)** | ⚠️ **Pause** | Skip reduction cycles |
| **Long vacation (>1 week)** | ❌ **Pause** | Preserve pricing power for return |

### Why PAUSE Price Reductions

1. **No Conversion**: If listings are hidden or have "Away" message, conversion rate drops significantly
2. **Wasted Margin**: Price reductions without sales = lost profit when returning
3. **Competitive Reset**: Competitors may raise prices while you're away
4. **Strategy Timing**: Price reductions assume active selling period

---

## Recommended Implementation

### Option 1: User Toggle (Simple)

Add vacation mode toggle to user settings:

```typescript
// User Profile Settings
interface UserSettings {
  vacation_mode: boolean;
  vacation_until: Date | null;
}

// In price reduction job, check first
async function shouldReducePrices(userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('vacation_mode, vacation_until')
    .eq('user_id', userId)
    .single();
    
  // Check vacation mode
  if (profile.vacation_mode) {
    // Auto-disable if vacation_until has passed
    if (profile.vacation_until && new Date(profile.vacation_until) < new Date()) {
      await supabase
        .from('user_profiles')
        .update({ vacation_mode: false, vacation_until: null })
        .eq('user_id', userId);
      return true; // Resume reductions
    }
    return false; // Still on vacation
  }
  
  return true; // Not on vacation
}
```

### Option 2: API Detection (Complex)

Check vacation status via eBay API during sync:

```typescript
async function syncListingsWithVacationCheck(userId: string, token: string) {
  // Step 1: Check vacation mode via Trading API
  const vacationStatus = await checkVacationModeViaAPI(token);
  
  if (vacationStatus.onVacation) {
    // Update user profile
    await supabase
      .from('user_profiles')
      .update({
        vacation_mode: true,
        vacation_until: vacationStatus.returnDate,
      })
      .eq('user_id', userId);
      
    // Log for visibility
    console.log(`User ${userId} is on vacation until ${vacationStatus.returnDate}`);
  }
  
  // Step 2: Continue with normal sync (listings still need updating)
  await syncListings(userId, token);
}
```

---

## Sync Behavior During Vacation

### ✅ CONTINUE During Vacation
| Action | Reason |
|--------|--------|
| Sync listing titles | Keep data current |
| Sync quantities | Track any sales that happen |
| Sync status changes | Catch if listing ends |
| Update last_sync | Track freshness |

### ❌ PAUSE During Vacation
| Action | Reason |
|--------|--------|
| Auto price reductions | No/low conversions |
| Price strategy execution | Wasted margin |
| Aggressive pricing | Save for active period |

---

## Database Schema Updates

```sql
-- Add vacation columns to user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS vacation_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vacation_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS vacation_auto_detected BOOLEAN DEFAULT false;

-- Track price reduction pause reason
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS reduction_paused_reason VARCHAR(50);
  -- Values: 'vacation', 'sold_out', 'at_minimum', 'manual'
```

---

## UI Considerations

### Dashboard Alert
When vacation mode is detected/enabled:
```
⚠️ Vacation Mode Active
Price reductions are paused until [date].
Your [X] active listings will NOT receive automatic price drops.
[Resume Reductions] [Keep Paused]
```

### Settings Page
```
Vacation Mode
━━━━━━━━━━━━━
☑️ I'm currently on vacation
📅 Return date: [date picker]

When vacation mode is ON:
• Listing sync continues normally
• Auto price reductions are PAUSED
• Manual price changes still allowed
```

---

## What Happens When Vacation Ends

### Automatic Resume
```typescript
async function checkAndResumeFromVacation() {
  const { data: vacationUsers } = await supabase
    .from('user_profiles')
    .select('user_id, vacation_until')
    .eq('vacation_mode', true)
    .lt('vacation_until', new Date().toISOString());
    
  for (const user of vacationUsers) {
    // Auto-disable vacation mode
    await supabase
      .from('user_profiles')
      .update({ vacation_mode: false, vacation_until: null })
      .eq('user_id', user.user_id);
      
    // Notify user
    console.log(`User ${user.user_id} vacation ended - resuming price reductions`);
  }
}
```

### Price Reduction Catch-Up
Should we "catch up" on missed reductions?

**Recommendation: NO**
- Resume normal schedule
- Don't apply multiple reductions at once
- Market conditions may have changed during vacation

---

## Edge Case Matrix

| Scenario | Listings Status | Sync? | Reduce Prices? |
|----------|-----------------|-------|----------------|
| Vacation + visible | Active | ✅ | ❌ Pause |
| Vacation + hidden | Active | ✅ | ❌ Pause |
| Vacation ended | Active | ✅ | ✅ Resume |
| Vacation + sold out | SoldOut | ✅ | ❌ N/A |
| No vacation | Active | ✅ | ✅ Normal |

---

## Implementation Priority

### Phase 1: Manual Toggle (MVP)
1. Add `vacation_mode` to user_profiles
2. Add toggle in user settings UI
3. Check vacation_mode in price reduction job
4. Skip users with vacation_mode = true

### Phase 2: Auto-Detection
1. Call GetUserPreferences during sync
2. Auto-update vacation_mode based on API response
3. Show detected vacation in UI

### Phase 3: Smart Resume
1. Track vacation_until date
2. Auto-resume when date passes
3. Notify user when resuming

---

## Summary

**Key Takeaways:**
1. Listings remain `Active` during vacation mode - status doesn't change
2. Vacation mode is an **account-level** setting, not per-listing
3. Must check via Trading API GetUserPreferences or manual user toggle
4. **PAUSE price reductions** during vacation to preserve margin
5. **CONTINUE syncing** to keep data fresh
6. Auto-resume when vacation ends

**Recommended Approach:**
Start with a simple user toggle (Phase 1), then add API detection later (Phase 2).

---

*Created: 2026-01-12*
*Related: IMPORT-PROCESS-SPEC.md, EBAY-API-TECHNICAL.md*
