# eBay Aspect Keyword Review - Test Plan

## Objective
Test the new Supabase edge function that replaces the n8n workflow for eBay aspect keyword inference.

## Current State
**Existing patterns in `ebay_aspect_keywords`:**
- Color (8 patterns): Black, Blue, Gold, Green, Pink, Red, Silver, White
- Connectivity (3 patterns): USB-C, Wired, Wireless
- Platform (6 patterns): Xbox One, Xbox Series X|S, Nintendo Switch, PC, PS4, PS5
- Type (3 patterns): Over-ear, On-ear, Earbud (for headphones category 112529)

## Test Cases

### Test 1: Brand Extraction
**Product:** Nike Air Max 90 Running Shoes
**Aspect:** Brand
**Expected:** `{"aspect_value": "Nike", "keyword_pattern": "\\bNike\\b", "confidence": "high"}`

### Test 2: Size Extraction
**Product:** Men's Running Shoes Size 10.5 US
**Aspect:** US Shoe Size (Men's)
**Expected:** `{"aspect_value": "10.5", "keyword_pattern": "Size\\s*(\\d+\\.?\\d*)", "confidence": "high"}`

### Test 3: Material Extraction
**Product:** 100% Cotton T-Shirt Premium Quality
**Aspect:** Material
**Expected:** `{"aspect_value": "Cotton", "keyword_pattern": "\\b(100%\\s*)?Cotton\\b", "confidence": "high"}`

### Test 4: Storage Capacity
**Product:** Apple iPhone 14 Pro 256GB Unlocked
**Aspect:** Storage Capacity
**Expected:** `{"aspect_value": "256 GB", "keyword_pattern": "(\\d+)\\s*GB", "confidence": "high"}`

### Test 5: Screen Size
**Product:** Samsung 55-Inch 4K Smart TV OLED
**Aspect:** Screen Size
**Expected:** `{"aspect_value": "55 in", "keyword_pattern": "(\\d+)[-\\s]*(Inch|in|\")", "confidence": "high"}`

### Test 6: Low Confidence Case
**Product:** Vintage Collectible Item Rare Find
**Aspect:** Type
**Expected:** `{"confidence": "low"}` - vague title, should flag for review

## Execution Steps

### Step 1: Insert Test Records
Insert test cases into `ebay_aspect_misses` with status='pending'

### Step 2: Run Edge Function
Call the Supabase edge function

### Step 3: Verify Results
Check that:
- High confidence → auto-inserted to `ebay_aspect_keywords`
- Low confidence → status='review_needed' with notes
- All records have status != 'pending'

### Step 4: Validate Patterns
Test the generated regex patterns against sample product titles

## Success Criteria
- [ ] All 6 test cases processed
- [ ] High confidence results (Tests 1-5) auto-inserted to keywords table
- [ ] Low confidence result (Test 6) flagged for review
- [ ] Generated patterns are valid regex
- [ ] Processing time < 30 seconds for 6 records
