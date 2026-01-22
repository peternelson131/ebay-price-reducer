// eBay Price Reducer - Amazon Content Script
// Runs on Amazon product pages to detect and extract product information

console.log('eBay Price Reducer: Content script loaded on', window.location.href);

// Configuration
const SELECTORS = {
  productTitle: '#productTitle',
  asin: 'input[name="ASIN"]',
  price: '.a-price .a-offscreen',
  images: '#altImages img',
  features: '#feature-bullets ul li'
};

// Check if we're on a product page
function isProductPage() {
  const url = window.location.href;
  return url.includes('/dp/') || url.includes('/gp/product/');
}

// Extract ASIN from page
function extractASIN() {
  // Try from URL first
  const urlMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  if (urlMatch) return urlMatch[1];

  // Try from input field
  const asinInput = document.querySelector(SELECTORS.asin);
  if (asinInput) return asinInput.value;

  return null;
}

// Extract product title
function extractTitle() {
  const titleElement = document.querySelector(SELECTORS.productTitle);
  return titleElement ? titleElement.textContent.trim() : null;
}

// Extract price
function extractPrice() {
  const priceElement = document.querySelector(SELECTORS.price);
  if (!priceElement) return null;

  const priceText = priceElement.textContent.trim();
  const priceMatch = priceText.match(/[\d,]+\.?\d*/);
  return priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : null;
}

// Extract basic product data
function extractProductData() {
  if (!isProductPage()) {
    console.log('Not a product page');
    return null;
  }

  const data = {
    asin: extractASIN(),
    title: extractTitle(),
    price: extractPrice(),
    url: window.location.href,
    timestamp: new Date().toISOString()
  };

  console.log('Extracted product data:', data);
  return data;
}

// Notify side panel that a product was detected
function notifyProductDetected() {
  const productData = extractProductData();
  
  if (productData && productData.asin) {
    chrome.runtime.sendMessage({
      type: 'PRODUCT_DETECTED',
      data: productData
    }).catch(err => {
      console.warn('Could not send message to extension:', err);
    });
  }
}

// Initialize
function init() {
  console.log('Initializing Amazon content script');
  
  // Check immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyProductDetected);
  } else {
    notifyProductDetected();
  }

  // Also check after a short delay (for dynamic content)
  setTimeout(notifyProductDetected, 1000);
}

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  if (message.type === 'EXTRACT_PRODUCT_DATA') {
    const data = extractProductData();
    sendResponse({ success: true, data });
  }

  return true; // Keep channel open for async response
});

// Start
init();
