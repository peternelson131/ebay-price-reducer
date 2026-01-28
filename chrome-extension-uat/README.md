# eBay Price Reducer - Chrome Extension

Chrome extension for automated Amazon product research and eBay pricing recommendations.

## Features

- 🔍 **Amazon Product Detection** - Automatically detects products on Amazon pages
- 📊 **Side Panel UI** - Clean interface for product analysis
- 🔄 **Real-time Data** - Extracts ASIN, title, price, and more
- 💾 **Local Storage** - Saves recent products for quick access

## Project Structure

```
chrome-extension/
├── manifest.json              # Manifest V3 configuration
├── icons/                     # Extension icons (16, 48, 128px)
├── sidepanel/                 # Side panel UI
│   ├── index.html            # Main UI layout
│   ├── sidepanel.js          # UI controller logic
│   └── sidepanel.css         # Styling
├── content/                   # Content scripts
│   └── amazon-autofill.js    # Amazon page data extraction
├── background/                # Background service worker
│   └── service-worker.js     # Extension lifecycle & messaging
└── README.md                  # This file
```

## Installation

### Load Extension in Developer Mode

1. **Open Chrome Extensions Page**
   ```
   chrome://extensions/
   ```
   Or: Menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

3. **Load Unpacked Extension**
   - Click "Load unpacked"
   - Navigate to: `projects/ebay-price-reducer/chrome-extension/`
   - Select the folder

4. **Verify Installation**
   - Extension should appear in the list
   - Pin the extension icon to your toolbar (optional)

### Expected Result

✅ Extension loads without errors
✅ Extension icon appears in toolbar
✅ No red errors in chrome://extensions/

## Usage

### Opening the Side Panel

**Method 1:** Click the extension icon in your Chrome toolbar

**Method 2:** Right-click the extension icon → "Open side panel"

### Testing on Amazon

1. Navigate to any Amazon product page, e.g.:
   ```
   https://www.amazon.com/dp/B09G9FPHY6
   ```

2. Open the side panel (click extension icon)

3. **Expected Behavior:**
   - Status indicator turns green ("Ready to analyze")
   - Product ASIN detected and logged to console
   - "Analyze Product" button becomes enabled

### Viewing Logs

Open Chrome DevTools for debugging:

1. **Side Panel Console:**
   - Right-click in the side panel → Inspect
   - View console for side panel logs

2. **Content Script Console:**
   - Open DevTools on the Amazon page (F12)
   - View console for content script logs

3. **Service Worker Console:**
   - Go to `chrome://extensions/`
   - Click "Inspect views: service worker" under the extension
   - View background service worker logs

## Current Implementation Status

### ✅ Implemented

- Manifest V3 configuration
- Side panel UI with status indicators
- Content script for Amazon product detection
- ASIN, title, and price extraction
- Service worker for message routing
- Recent products storage

### 🚧 Placeholder (Coming Soon)

- Backend API integration
- Keepa product analysis
- eBay competitor pricing
- Price recommendation algorithm
- Bulk product processing

## Permissions

The extension requests these permissions:

- **`sidePanel`** - Display side panel UI
- **`storage`** - Save user settings and recent products
- **`activeTab`** - Read current tab URL and title
- **`https://*.amazon.com/*`** - Access Amazon product pages

## Troubleshooting

### Extension Won't Load

- **Check manifest.json** for syntax errors
- **Verify Chrome version** - Requires Chrome 114+ for `sidePanel`
- **Check console** at chrome://extensions/ for error messages

### Side Panel Won't Open

- **Reload extension** - Click refresh icon on chrome://extensions/
- **Check permissions** - Ensure `sidePanel` permission is granted
- **Try different window** - Some windows may have restrictions

### Product Not Detected

- **Verify you're on a product page** - URL must contain `/dp/` or `/gp/product/`
- **Check content script console** - Open DevTools on Amazon page
- **Wait for page load** - Content script runs after page is fully loaded

### Console Errors

Common errors and solutions:

```javascript
// Error: Cannot access chrome.tabs
// Solution: Only side panel/service worker can access tabs API

// Error: Could not establish connection
// Solution: Service worker may need restart - reload extension

// Error: No tab with id
// Solution: Tab was closed - check tab exists before operations
```

## Development

### File Watching

For development, you'll need to manually reload:

1. Make code changes
2. Go to `chrome://extensions/`
3. Click reload icon (🔄) for the extension
4. Refresh any open Amazon tabs
5. Reopen side panel if needed

### Adding New Features

**To add a new content script:**
1. Create file in `content/`
2. Add to `manifest.json` → `content_scripts` → `js` array

**To add new permissions:**
1. Update `manifest.json` → `permissions` or `host_permissions`
2. Reload extension
3. Chrome will prompt user to accept new permissions

**To add new API integrations:**
1. Update `background/service-worker.js` for backend calls
2. Add message handlers in `sidepanel/sidepanel.js`

## API Integration (Future)

The extension will integrate with:

- **Backend API** - Product analysis and pricing
- **Keepa API** - Historical Amazon data
- **eBay API** - Competitor pricing

API configuration will be stored in `chrome.storage.local`.

## Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)

## Version

**Current:** v0.1.0 (Development Scaffold)

## License

Private - Part of eBay Price Reducer project
