# eBay Price Reducer - QA Test Cases

Generated: 2026-01-11

## Priority Legend
- **P0**: Critical - Security/data loss issues, must fix before release
- **P1**: High - Blocks core functionality, fix in current sprint
- **P2**: Medium - Degrades UX significantly, fix soon
- **P3**: Low - Polish items, can defer

## Complexity Legend
- **Simple**: < 2 hours, isolated change
- **Medium**: 2-8 hours, touches multiple components
- **Complex**: 8+ hours, architectural changes or new features

---

## Issue #1: Data Isolation Bug (FIXED)

**Status:** ✅ FIXED  
**Priority:** P0 (Critical/Security)  
**Complexity:** Medium

### Description
Users could see other users' listings due to wrong auth token method being used.

### Acceptance Criteria
```gherkin
Given I am logged in as User A
When I view my listings page
Then I should only see listings created by User A
And I should not see any listings from other users

Given I am logged in as User B
When I access a listing URL belonging to User A
Then I should receive a 403 Forbidden error
And I should not see User A's listing data
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 1.1 | Verify own listings only | 1. Create User A with 3 listings<br>2. Create User B with 2 listings<br>3. Log in as User A<br>4. View listings page | User A sees only their 3 listings |
| 1.2 | Direct URL access denied | 1. Get listing ID from User A<br>2. Log in as User B<br>3. Navigate to `/listings/{userA_listing_id}` | 403 error, no data exposed |
| 1.3 | API endpoint isolation | 1. Get User A's auth token<br>2. Get User B's listing ID<br>3. Call GET `/api/listings/{userB_id}` with User A's token | 403 response |
| 1.4 | Verify strategies isolation | 1. Create strategy for User A<br>2. Log in as User B<br>3. View strategies page | User B sees only their strategies |
| 1.5 | Cross-user edit blocked | 1. Get User A's listing ID<br>2. Log in as User B<br>3. Attempt PUT to User A's listing | 403 error, no modification |

### Regression Tests
- [ ] Run after any auth changes
- [ ] Include in CI/CD pipeline
- [ ] Monthly security audit

---

## Issue #2: Quick List Without eBay Connection

**Status:** 🔴 Open  
**Priority:** P1 (High)  
**Complexity:** Simple

### Description
Quick List allows clicking "Create eBay Listing" without eBay connection - should disable button or show warning first.

### Acceptance Criteria
```gherkin
Given I am logged in
And I have NOT connected my eBay account
When I navigate to Quick List page
Then the "Create eBay Listing" button should be disabled
And I should see a message "Connect your eBay account to create listings"
And I should see a "Connect eBay" button/link

Given I am logged in
And I HAVE connected my eBay account
When I navigate to Quick List page
Then the "Create eBay Listing" button should be enabled
And I should not see the connection warning
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 2.1 | Button disabled when not connected | 1. Log in (no eBay connected)<br>2. Navigate to Quick List<br>3. Fill out form<br>4. Observe button state | Button is disabled/grayed out |
| 2.2 | Warning message shown | 1. Log in (no eBay connected)<br>2. Navigate to Quick List | Warning message visible with connect link |
| 2.3 | Button enabled when connected | 1. Log in with eBay connected<br>2. Navigate to Quick List | Button is enabled |
| 2.4 | Connect link works | 1. Log in (no eBay connected)<br>2. Click "Connect eBay" link on Quick List | Navigates to eBay OAuth flow |
| 2.5 | State updates after connection | 1. Start on Quick List (not connected)<br>2. Connect eBay in new tab<br>3. Return to Quick List tab<br>4. Refresh page | Button now enabled |

---

## Issue #3: Login Page Says "Username" But Requires Email

**Status:** 🔴 Open  
**Priority:** P1 (High)  
**Complexity:** Simple

### Description
Login page label says "Username" but the field actually requires an email address.

### Acceptance Criteria
```gherkin
Given I am on the login page
When I view the input fields
Then I should see a field labeled "Email" (not "Username")
And the input field should have type="email"
And the placeholder should say "Enter your email"

Given I am on the login page
When I enter a non-email value like "myusername"
Then I should see validation error "Please enter a valid email address"
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 3.1 | Label text correct | 1. Navigate to /login | Label reads "Email" not "Username" |
| 3.2 | Input type is email | 1. Inspect input element | `type="email"` attribute present |
| 3.3 | Email validation - valid | 1. Enter "user@example.com"<br>2. Tab to next field | No validation error |
| 3.4 | Email validation - invalid | 1. Enter "notanemail"<br>2. Tab to next field | Shows "valid email" error |
| 3.5 | Placeholder text | 1. View empty input field | Shows "Enter your email" or similar |
| 3.6 | Signup page consistency | 1. Navigate to /signup | Email field also labeled correctly |

---

## Issue #4: No Way to Import Existing eBay Listings

**Status:** 🔴 Open  
**Priority:** P1 (High)  
**Complexity:** Complex

### Description
Users with existing eBay listings cannot import them into the system.

### Acceptance Criteria
```gherkin
Given I am logged in
And I have connected my eBay account
When I navigate to Listings page
Then I should see an "Import from eBay" button

Given I click "Import from eBay"
When my eBay account has active listings
Then I should see a list of my eBay listings to select
And I should be able to select individual listings or "Select All"
And I should see an "Import Selected" button

Given I have selected listings to import
When I click "Import Selected"
Then the listings should be created in the system
And I should see a success message with count
And imported listings should appear in my listings page
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 4.1 | Import button visible | 1. Connect eBay<br>2. Go to Listings page | "Import from eBay" button visible |
| 4.2 | Import button hidden if not connected | 1. Log in (no eBay)<br>2. Go to Listings | Import button not shown |
| 4.3 | Load eBay listings | 1. Click Import<br>2. Wait for fetch | Shows list of user's eBay listings |
| 4.4 | Select individual listings | 1. Click Import<br>2. Check 2 of 5 listings<br>3. Click Import Selected | Only 2 listings imported |
| 4.5 | Select all | 1. Click Import<br>2. Click "Select All"<br>3. Import | All listings imported |
| 4.6 | Duplicate handling | 1. Import listing A<br>2. Try to import listing A again | Shows "already imported" or skips |
| 4.7 | Empty eBay account | 1. Connect eBay with no listings<br>2. Click Import | Shows "No listings found on eBay" |
| 4.8 | Pagination for many listings | 1. User has 200+ eBay listings<br>2. Click Import | Pagination or "Load More" works |
| 4.9 | Import error handling | 1. Click Import<br>2. eBay API fails | Shows error, no partial state |
| 4.10 | Imported data accuracy | 1. Import listing<br>2. Compare to eBay original | Title, price, quantity match |

---

## Issue #5: No "Connect eBay" Prompt on Quick List

**Status:** 🔴 Open  
**Priority:** P2 (Medium)  
**Complexity:** Simple

### Description
Quick List page doesn't prompt users to connect eBay when not connected (related to but distinct from #2).

### Acceptance Criteria
```gherkin
Given I am logged in
And I have NOT connected my eBay account
When I navigate to Quick List page
Then I should see a prominent banner/callout
And the banner should explain why eBay connection is needed
And the banner should include a "Connect eBay Account" button

Given I dismiss the banner
When I return to Quick List later
Then the banner should reappear (unless eBay is connected)
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 5.1 | Prompt shown when not connected | 1. Log in (no eBay)<br>2. Go to Quick List | Prominent connect prompt visible |
| 5.2 | Prompt not shown when connected | 1. Log in with eBay<br>2. Go to Quick List | No connect prompt |
| 5.3 | Connect button in prompt works | 1. Click connect in prompt | Initiates eBay OAuth |
| 5.4 | Prompt explains benefits | 1. View prompt text | Clear explanation of why connection needed |

---

## Issue #6: No Loading Indicators on Some Async Operations

**Status:** 🔴 Open  
**Priority:** P2 (Medium)  
**Complexity:** Medium

### Description
Some async operations lack loading indicators, leaving users uncertain if action worked.

### Acceptance Criteria
```gherkin
Given I trigger an async operation
When the request is in progress
Then I should see a loading indicator (spinner/skeleton/progress)
And interactive elements should be disabled to prevent double-submit
And the loading indicator should disappear when complete

Given an async operation takes more than 5 seconds
When I am waiting
Then I should see a message like "This may take a moment..."
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 6.1 | Create listing shows loader | 1. Fill Quick List form<br>2. Click Create<br>3. Observe during API call | Spinner visible, button disabled |
| 6.2 | Save strategy shows loader | 1. Create/edit strategy<br>2. Click Save | Spinner visible during save |
| 6.3 | Delete listing shows loader | 1. Click delete on listing<br>2. Confirm | Loader during deletion |
| 6.4 | Connect eBay shows loader | 1. Start eBay OAuth<br>2. Return from eBay | Processing indicator shown |
| 6.5 | Load listings shows skeleton | 1. Navigate to Listings page | Skeleton/shimmer while loading |
| 6.6 | Fetch Amazon data shows loader | 1. Enter ASIN<br>2. Click lookup | Spinner while fetching |
| 6.7 | No double-submit | 1. Click Create Listing<br>2. Rapidly click again | Second click ignored |
| 6.8 | Error clears loader | 1. Trigger operation<br>2. API returns error | Loader stops, error shown |

---

## Issue #7: Preferences Checkboxes Show as "Disabled"

**Status:** 🔴 Open  
**Priority:** P2 (Medium)  
**Complexity:** Simple

### Description
Preferences checkboxes appear visually disabled even when viewing/editing, causing confusion.

### Acceptance Criteria
```gherkin
Given I am on the Preferences page
When I view the checkboxes
Then enabled checkboxes should appear with normal styling
And checkboxes should clearly indicate checked/unchecked state
And checkboxes should be visually interactive (hover state, cursor pointer)

Given I click a checkbox
When it toggles
Then the visual state should immediately update
And the styling should not appear "grayed out" or disabled
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 7.1 | Checkboxes not grayed out | 1. Go to Preferences<br>2. Observe checkbox styling | Normal color, not faded/gray |
| 7.2 | Hover state visible | 1. Hover over checkbox | Visual hover feedback |
| 7.3 | Cursor is pointer | 1. Hover over checkbox | Cursor changes to pointer |
| 7.4 | Toggle works visually | 1. Click checkbox<br>2. Observe | Clear visual toggle |
| 7.5 | Checked state distinct | 1. View checked vs unchecked | Clear visual difference |
| 7.6 | Actually disabled vs styled disabled | 1. Compare to real disabled input | Editable checkboxes look different |

---

## Issue #8: No "Run Now" Option for Price Reduction Strategies

**Status:** 🔴 Open  
**Priority:** P2 (Medium)  
**Complexity:** Medium

### Description
Users cannot manually trigger a price reduction strategy; must wait for scheduled run.

### Acceptance Criteria
```gherkin
Given I have an active price reduction strategy
When I view the strategy details
Then I should see a "Run Now" button

Given I click "Run Now" on a strategy
When the strategy executes
Then I should see a loading indicator
And I should see results (listings updated, prices changed)
And the last run timestamp should update

Given I click "Run Now" and no listings match
When execution completes
Then I should see "No listings matched the strategy criteria"
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 8.1 | Run Now button visible | 1. Create strategy<br>2. View strategy | "Run Now" button present |
| 8.2 | Run Now executes strategy | 1. Click Run Now<br>2. Wait for completion | Strategy runs, prices updated |
| 8.3 | Shows execution results | 1. Run strategy<br>2. View results | Shows "X listings updated" |
| 8.4 | Updates last run time | 1. Note current "last run"<br>2. Run Now<br>3. Check last run | Timestamp updated |
| 8.5 | No matches message | 1. Create strategy with no matching listings<br>2. Run Now | Shows "no listings matched" |
| 8.6 | Disabled for inactive strategy | 1. Disable strategy<br>2. View Run Now button | Button disabled or hidden |
| 8.7 | Error handling | 1. Run Now<br>2. API fails | Error message shown |
| 8.8 | Prevent concurrent runs | 1. Click Run Now<br>2. Click again while running | Second click blocked |

---

## Issue #9: No Visual Price History Chart

**Status:** 🔴 Open  
**Priority:** P2 (Medium)  
**Complexity:** Complex

### Description
Listings don't show a visual chart of price history over time.

### Acceptance Criteria
```gherkin
Given I view a listing detail page
And the listing has price history
When the page loads
Then I should see a line chart showing price over time
And the chart should show dates on X-axis and prices on Y-axis

Given I hover over a point on the chart
When the tooltip appears
Then I should see the exact date and price at that point

Given a listing has no price history
When I view the listing
Then I should see "No price history yet" instead of empty chart
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 9.1 | Chart renders with data | 1. View listing with price changes | Line chart visible |
| 9.2 | Correct data points | 1. View chart<br>2. Compare to raw history | Chart matches actual history |
| 9.3 | Tooltip on hover | 1. Hover over chart point | Shows date and price |
| 9.4 | Empty state | 1. View new listing (no history) | Shows "no history" message |
| 9.5 | Single data point | 1. View listing with 1 price | Shows single point or message |
| 9.6 | Many data points | 1. View listing with 100+ changes | Chart handles gracefully |
| 9.7 | Responsive sizing | 1. View on mobile<br>2. View on desktop | Chart resizes appropriately |
| 9.8 | Time range filter | 1. Filter to last 7 days | Chart updates to show range |

---

## Issue #10: ASIN Input Placeholder in Wrong Location

**Status:** 🔴 Open  
**Priority:** P3 (Low)  
**Complexity:** Simple

### Description
ASIN input placeholder text shows in label area instead of inside the input field.

### Acceptance Criteria
```gherkin
Given I am on the Quick List page
When I view the ASIN input field
Then the label should say "ASIN" or "Amazon ASIN"
And the placeholder inside the input should say "e.g., B08N5WRWNW"
And the placeholder should disappear when I start typing
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 10.1 | Placeholder in input | 1. View ASIN field (empty) | Placeholder text inside input |
| 10.2 | Label is correct | 1. View ASIN label | Says "ASIN" not placeholder text |
| 10.3 | Placeholder clears on focus | 1. Click into ASIN field | Placeholder fades/clears |
| 10.4 | Placeholder clears on type | 1. Start typing ASIN | Placeholder replaced by input |
| 10.5 | Placeholder returns when empty | 1. Type text<br>2. Clear field | Placeholder reappears |

---

## Issue #11: No Confirmation Dialog for Delete Account

**Status:** 🔴 Open  
**Priority:** P3 (Low)  
**Complexity:** Simple

### Description
Clicking "Delete Account" doesn't show confirmation dialog - could lead to accidental deletion.

### Acceptance Criteria
```gherkin
Given I am on the account settings page
When I click "Delete Account"
Then I should see a confirmation modal/dialog
And the dialog should warn about permanent data loss
And I should be required to type "DELETE" or my email to confirm

Given I see the confirmation dialog
When I click "Cancel" or close the dialog
Then my account should NOT be deleted
And I should remain on the settings page

Given I complete the confirmation requirements
When I click the final "Delete" button
Then my account should be deleted
And I should be logged out
And I should be redirected to the home page
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 11.1 | Confirmation dialog appears | 1. Go to Settings<br>2. Click Delete Account | Modal/dialog appears |
| 11.2 | Dialog has warning text | 1. View confirmation dialog | Warning about permanent deletion |
| 11.3 | Requires confirmation input | 1. View dialog | Must type "DELETE" or email |
| 11.4 | Cancel preserves account | 1. Click Delete<br>2. Click Cancel | Account still exists |
| 11.5 | Close modal preserves account | 1. Click Delete<br>2. Click X or outside | Account still exists |
| 11.6 | Wrong confirmation rejected | 1. Type wrong text<br>2. Click Delete | Delete button disabled/error |
| 11.7 | Correct confirmation deletes | 1. Type correct text<br>2. Click Delete | Account deleted, logged out |
| 11.8 | Redirect after deletion | 1. Complete deletion | Redirected to home/login |

---

## Issue #12: Missing Min Price Input in Quick List Form

**Status:** 🔴 Open  
**Priority:** P3 (Low)  
**Complexity:** Simple

### Description
Quick List form doesn't have a minimum price input, which is important for price reduction strategies.

### Acceptance Criteria
```gherkin
Given I am on the Quick List page
When I view the form fields
Then I should see a "Minimum Price" input field
And the field should accept numeric currency values
And the field should be optional (not required)

Given I enter a minimum price
When I create the listing
Then the minimum price should be saved with the listing
And price reduction strategies should respect this minimum
```

### Test Cases

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| 12.1 | Min price field exists | 1. Go to Quick List | "Minimum Price" input visible |
| 12.2 | Accepts valid price | 1. Enter "19.99" | Value accepted |
| 12.3 | Field is optional | 1. Leave min price empty<br>2. Create listing | Listing created successfully |
| 12.4 | Saved to listing | 1. Enter min price<br>2. Create<br>3. View listing | Min price shown on listing |
| 12.5 | Validates numeric | 1. Enter "abc" | Validation error |
| 12.6 | Validates not negative | 1. Enter "-5" | Validation error |
| 12.7 | Validates min < asking | 1. Enter min > asking price | Warning or error |
| 12.8 | Strategy respects min | 1. Set min price $20<br>2. Run strategy to reduce<br>3. Check price | Price doesn't go below $20 |

---

## Test Execution Summary

### By Priority
| Priority | Count | Issues |
|----------|-------|--------|
| P0 | 1 | #1 (FIXED) |
| P1 | 3 | #2, #3, #4 |
| P2 | 4 | #5, #6, #7, #8, #9 |
| P3 | 3 | #10, #11, #12 |

### By Complexity
| Complexity | Count | Issues |
|------------|-------|--------|
| Simple | 7 | #2, #3, #5, #7, #10, #11, #12 |
| Medium | 3 | #1, #6, #8 |
| Complex | 2 | #4, #9 |

### Recommended Fix Order
1. **#3** - Login label fix (Simple, P1) - Quick win
2. **#2** - Disable Create button (Simple, P1) - Quick win  
3. **#5** - Add connect prompt (Simple, P2) - Pairs with #2
4. **#4** - Import listings (Complex, P1) - Major feature gap
5. **#7** - Checkbox styling (Simple, P2)
6. **#6** - Loading indicators (Medium, P2)
7. **#8** - Run Now button (Medium, P2)
8. **#9** - Price history chart (Complex, P2)
9. **#10, #11, #12** - Polish items (P3)

---

## Automation Notes

### Candidates for E2E Tests (Playwright)
- #1 - Data isolation (critical security)
- #2 - Button state based on connection
- #3 - Form validation
- #4 - Import flow (once implemented)

### Candidates for Unit Tests
- #6 - Loading state hooks
- #7 - Checkbox component styling
- #12 - Price validation logic

### Manual Testing Required
- #9 - Chart visual verification
- #11 - Confirmation flow UX
