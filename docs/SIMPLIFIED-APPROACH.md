# Simplified Category Approach

## Problem with Current Approach
We built complex Amazon → eBay mapping when eBay already solves this.

## New Simpler Approach

### 1. One Table: `ebay_categories`
Store ALL eBay leaf categories with their required aspects:
```sql
CREATE TABLE ebay_categories (
  category_id TEXT PRIMARY KEY,
  category_name TEXT,
  required_aspects JSONB,  -- ["Brand", "Connectivity", "Type"]
  aspect_values JSONB      -- {"Connectivity": ["Wireless", "Wired"], ...}
);
```

### 2. Use eBay Taxonomy API
**Endpoint:** `GET /commerce/taxonomy/v1/category_tree/{category_tree_id}/get_category_suggestions`

**Input:** Product title
**Output:** Suggested eBay category ID

### 3. Flow
1. Get product data from Keepa
2. Call Taxonomy API with product title → Get eBay category ID
3. Look up category ID in our `ebay_categories` table
4. Get required aspects
5. Create listing

### 4. Benefits
- eBay handles category selection (they know best)
- We just maintain aspect requirements
- No Amazon → eBay mapping needed
- Simpler to maintain

## Next Steps
1. Test Taxonomy API
2. Create simplified `ebay_categories` table
3. Populate with category requirements
4. Update auto-list to use Taxonomy API
