// eBay Price Reducer - Background Service Worker
// Handles extension lifecycle, side panel, and message routing

console.log('eBay Price Reducer: Service worker started');

// Installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('First install - setting up defaults');
    
    // Set default storage values
    chrome.storage.local.set({
      settings: {
        autoAnalyze: false,
        notifications: true
      },
      version: chrome.runtime.getManifest().version
    });
  }
});

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked, opening side panel');
  
  try {
    // Open side panel for this window
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Service worker received message:', message.type, 'from', sender.tab ? 'content script' : 'side panel');

  switch (message.type) {
    case 'PRODUCT_DETECTED':
      handleProductDetected(message.data, sender);
      sendResponse({ received: true });
      break;

    case 'ANALYZE_PRODUCT':
      handleAnalyzeProduct(message.data, sender)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    default:
      console.log('Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
  }
});

// Handle product detected from content script
function handleProductDetected(data, sender) {
  console.log('Product detected:', data);

  // Store in recent products
  chrome.storage.local.get(['recentProducts'], (result) => {
    const recent = result.recentProducts || [];
    
    // Add to front, limit to 10 most recent
    const updated = [data, ...recent.filter(p => p.asin !== data.asin)].slice(0, 10);
    
    chrome.storage.local.set({ recentProducts: updated });
  });

  // Forward to side panel if open
  chrome.runtime.sendMessage({
    type: 'PRODUCT_DETECTED',
    data
  }).catch(() => {
    // Side panel not open, that's fine
  });
}

// Handle analyze product request
async function handleAnalyzeProduct(data, sender) {
  console.log('Analyzing product:', data);

  // Placeholder - will integrate with backend API later
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        message: 'Analysis feature coming soon',
        asin: data.asin,
        timestamp: new Date().toISOString()
      });
    }, 1000);
  });
}

// Tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isAmazon = tab.url.includes('amazon.com');
    const isProductPage = tab.url.includes('/dp/') || tab.url.includes('/gp/product/');
    
    if (isAmazon && isProductPage) {
      console.log('Amazon product page loaded:', tab.url);
    }
  }
});

// Keep service worker alive (if needed for long operations)
let keepAliveInterval;

function startKeepAlive() {
  if (!keepAliveInterval) {
    keepAliveInterval = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => {
        // Just keep the service worker alive
      });
    }, 20000); // Every 20 seconds
  }
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Start keep-alive on install
startKeepAlive();

console.log('Service worker initialized');
