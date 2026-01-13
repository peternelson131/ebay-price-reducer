# Quick List Page

## Purpose

Quick List lets you create a new eBay listing in seconds by entering an Amazon ASIN. The system automatically:

1. Fetches product data from Keepa
2. Generates an optimized eBay title
3. Auto-detects the eBay category
4. Creates and publishes the listing

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Quick List                                                  │
│ Create an eBay listing from an Amazon ASIN in seconds       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Amazon ASIN                                                 │
│ [B01KJEOCDW                                        ]        │
│                                                             │
│ Listing Price (USD)                                         │
│ [$] [        ]                                              │
│                                                             │
│ Quantity        Condition                                   │
│ [1    ]         [Brand New           ▼]                     │
│                                                             │
│ [      Create eBay Listing      ]                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ How it works:                                               │
│ 1. Enter an Amazon ASIN and your desired price              │
│ 2. We fetch product data from Keepa                         │
│ 3. AI generates an optimized 80-character title             │
│ 4. eBay category is auto-detected                           │
│ 5. Listing is created and published instantly               │
└─────────────────────────────────────────────────────────────┘
```

## Fields

### Amazon ASIN

The 10-character Amazon product identifier (starts with "B").

**Where to find it:**
- In the Amazon product URL: `amazon.com/dp/B01KJEOCDW`
- In the product details section on Amazon

### Listing Price

Your desired selling price on eBay in USD.

**Tips:**
- Check eBay sold listings for market price
- Factor in fees (eBay ~13% + PayPal ~3%)
- Consider your purchase cost and desired margin

### Quantity

How many units you have available to sell. Default: 1

### Condition

The item condition. Options vary by category:

| Condition | Description |
|-----------|-------------|
| Brand New | Factory sealed, never opened |
| New (Open Box) | Opened but unused |
| Like New | Used but appears new |
| Very Good | Minor wear, fully functional |
| Good | Normal wear, fully functional |
| Acceptable | Heavy wear, still functional |
| Used | General used condition |

## Process Flow

```
1. Enter ASIN
      ↓
2. Click "Create eBay Listing"
      ↓
3. System fetches product from Keepa
   - Title, images, description
   - UPC/EAN codes
      ↓
4. AI generates optimized 80-char title
      ↓
5. System detects eBay category
      ↓
6. Listing created via eBay Inventory API
      ↓
7. Success! View on eBay
```

## Requirements

- ✅ eBay account connected (see API Keys page)
- ✅ Keepa API key configured
- ✅ Valid ASIN

## Backend

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/validate-asin` | POST | Validate ASIN, fetch Keepa data |
| `/api/create-ebay-listing` | POST | Create listing on eBay |
| `/api/get-ebay-category-suggestion` | POST | Get category for product |

### External Services

1. **Keepa API** - Product data and images
2. **eBay Inventory API** - Create inventory item
3. **eBay Offer API** - Create/publish offer
4. **AI (Claude)** - Generate optimized title

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid ASIN" | ASIN doesn't exist or wrong format | Check ASIN is correct |
| "eBay not connected" | No eBay tokens | Connect eBay in API Keys |
| "Category not found" | Can't determine category | Try different ASIN |
| "Listing failed" | eBay API error | Check eBay requirements |
