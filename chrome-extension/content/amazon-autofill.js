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

// ===== AUTOFILL FUNCTIONALITY FOR INFLUENCER UPLOAD PAGE =====

// Common selectors for Amazon Influencer upload form
const UPLOAD_SELECTORS = {
  // Title input field - must be specific to avoid hitting search box
  // The title field is in the right panel, has label "Title *" and helper text about 60 chars
  titleInput: [
    'input[name="title"]',
    'input#title',
    // Look for input near a label containing "Title"
    'label:has-text("Title") + input',
    'label:has-text("Title") ~ input',
    // Aria-based
    'input[aria-label="Title"]',
    'input[aria-labelledby*="title" i]'
  ],
  // ASIN/Product search field
  asinSearch: [
    'input[name="asin"]',
    'input[placeholder*="ASIN" i]',
    'input[placeholder*="product" i]',
    'input[aria-label*="product" i]',
    '[data-testid="product-search-input"]'
  ]
};

// Find element by trying multiple selectors
function findElement(selectorList) {
  for (const selector of selectorList) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        console.log('Found element with selector:', selector);
        return el;
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }
  return null;
}

// Find the TITLE input - the large center input with placeholder about "what you love about this product"
function findTitleInput() {
  const inputs = document.querySelectorAll('input, textarea');
  
  for (const input of inputs) {
    const placeholder = (input.placeholder || '').toLowerCase();
    
    // Look for the specific placeholder text about describing the product
    if (placeholder.includes('title') || 
        placeholder.includes('love about') || 
        placeholder.includes('recommend') ||
        placeholder.includes('describe')) {
      console.log('Found title input by placeholder:', input);
      return input;
    }
  }
  
  // Fallback: find textarea (title might be a textarea for longer text)
  const textareas = document.querySelectorAll('textarea');
  for (const ta of textareas) {
    const placeholder = (ta.placeholder || '').toLowerCase();
    if (placeholder.includes('title') || placeholder.length > 50) {
      console.log('Found title textarea:', ta);
      return ta;
    }
  }
  
  // Fallback: input with name/id containing "title"
  for (const input of inputs) {
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    if (name.includes('title') || id.includes('title')) {
      console.log('Found title input by name/id:', input);
      return input;
    }
  }
  
  console.log('Could not find title input');
  return null;
}

// Find the ASIN/Search input - the left panel "Search Amazon" input
function findAsinSearchInput() {
  const inputs = document.querySelectorAll('input');
  
  for (const input of inputs) {
    const placeholder = (input.placeholder || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    
    // Look for "Search Amazon" or similar
    if (placeholder.includes('search amazon') || 
        placeholder.includes('search') ||
        ariaLabel.includes('search amazon') ||
        ariaLabel.includes('search')) {
      // Make sure it's not a site-wide search (check if near a "Search" button)
      const parent = input.closest('div, form');
      if (parent) {
        const btn = parent.querySelector('button, [role="button"]');
        if (btn && btn.textContent.toLowerCase().includes('search')) {
          console.log('Found ASIN search input:', input);
          return input;
        }
      }
      // Still return if it matches well
      if (placeholder.includes('search amazon')) {
        console.log('Found ASIN search input by placeholder:', input);
        return input;
      }
    }
  }
  
  console.log('Could not find ASIN search input');
  return null;
}

// Simulate human-like typing
function simulateTyping(element, text) {
  element.focus();
  element.value = '';
  
  // Dispatch events to ensure React/Angular picks up the change
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  
  // Set value
  element.value = text;
  
  // Dispatch input events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  
  console.log('Typed into element:', text);
}

// Handle fill title request
function handleFillTitle(title) {
  console.log('Fill title requested:', title);
  
  const titleInput = findTitleInput();
  if (titleInput) {
    simulateTyping(titleInput, title);
    return { success: true, message: 'Title filled!' };
  } else {
    console.warn('Title input not found. Available inputs:', 
      Array.from(document.querySelectorAll('input, textarea')).map(i => ({
        tag: i.tagName,
        name: i.name,
        id: i.id,
        placeholder: i.placeholder?.slice(0, 50),
        type: i.type,
        'aria-label': i.getAttribute('aria-label')
      }))
    );
    return { success: false, error: 'Could not find title input field. Check console for available inputs.' };
  }
}

// Handle fill ASIN request
function handleFillAsin(asin) {
  console.log('Fill ASIN requested:', asin);
  
  const asinInput = findAsinSearchInput();
  if (asinInput) {
    simulateTyping(asinInput, asin);
    return { success: true, message: 'ASIN filled in search!' };
  } else {
    console.warn('ASIN search input not found. Available inputs:', 
      Array.from(document.querySelectorAll('input')).map(i => ({
        name: i.name,
        id: i.id,
        placeholder: i.placeholder?.slice(0, 50),
        type: i.type,
        'aria-label': i.getAttribute('aria-label')
      }))
    );
    return { success: false, error: 'Could not find search input field. Check console for available inputs.' };
  }
}

// Legacy handler for backward compatibility
function handleAutofill(data) {
  console.log('Autofill requested with data:', data);
  
  const results = {
    titleFilled: false,
    asinFilled: false,
    errors: []
  };
  
  if (data.title) {
    const result = handleFillTitle(data.title);
    results.titleFilled = result.success;
    if (!result.success) results.errors.push(result.error);
  }
  
  if (data.asin && data.fillAsin) {
    const result = handleFillAsin(data.asin);
    results.asinFilled = result.success;
    if (!result.success) results.errors.push(result.error);
  }
  
  return {
    success: results.titleFilled || results.asinFilled,
    ...results
  };
}

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  if (message.type === 'EXTRACT_PRODUCT_DATA') {
    const data = extractProductData();
    sendResponse({ success: true, data });
    return true;
  }
  
  if (message.action === 'autofill') {
    const result = handleAutofill(message.data);
    sendResponse(result);
    return true;
  }
  
  if (message.action === 'fillTitle') {
    const result = handleFillTitle(message.title || 'Product Review');
    sendResponse(result);
    return true;
  }
  
  if (message.action === 'fillAsin') {
    const result = handleFillAsin(message.asin);
    sendResponse(result);
    return true;
  }

  return true; // Keep channel open for async response
});

// Start
init();
