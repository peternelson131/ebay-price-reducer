# User-Configurable Settings

Settings that vary per eBay seller account and must be stored/configured per user.

## eBay Business Policies (Required for Offers)

| Setting | Description | How to Get |
|---------|-------------|------------|
| `fulfillmentPolicyId` | Shipping policy | `/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US` |
| `paymentPolicyId` | Payment policy | `/sell/account/v1/payment_policy?marketplace_id=EBAY_US` |
| `returnPolicyId` | Return policy | `/sell/account/v1/return_policy?marketplace_id=EBAY_US` |

## eBay Location (Required for Publish)

| Setting | Description | How to Get |
|---------|-------------|------------|
| `merchantLocationKey` | Warehouse/store location | `/sell/inventory/v1/location` |

## Listing Defaults (Optional, nice-to-have)

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultCondition` | Item condition | "NEW" |
| `defaultQuantity` | Quantity per listing | 1 |
| `skuPrefix` | SKU prefix | "wi_" |
| `defaultCategoryId` | Fallback eBay category | TBD |

## Database Schema Addition Needed

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_fulfillment_policy_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_payment_policy_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_return_policy_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_merchant_location_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_default_condition TEXT DEFAULT 'NEW';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_sku_prefix TEXT DEFAULT 'wi_';
```

## UI Needed

Settings page section for eBay configuration:
- Dropdown to select fulfillment policy (fetch from API)
- Dropdown to select payment policy (fetch from API)
- Dropdown to select return policy (fetch from API)
- Dropdown to select merchant location (fetch from API)
- Text input for SKU prefix
- Dropdown for default condition

## Discovery Notes

As I build, I'll add more settings here when I find data points that are account-specific.

---
**Last updated:** 2026-01-09
