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

// Find the title input by looking for label with "Title" text
function findTitleInput() {
  // Strategy 1: Find label containing "Title" and get associated input
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent.includes('Title')) {
      // Check for 'for' attribute
      if (label.htmlFor) {
        const input = document.getElementById(label.htmlFor);
        if (input) {
          console.log('Found title input via label[for]:', input);
          return input;
        }
      }
      // Check for input as sibling or child
      const parent = label.parentElement;
      if (parent) {
        const input = parent.querySelector('input[type="text"], input:not([type])');
        if (input) {
          console.log('Found title input as sibling of label:', input);
          return input;
        }
      }
    }
  }
  
  // Strategy 2: Find input with name/id containing "title" (case insensitive)
  const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
  for (const input of inputs) {
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    
    if (name.includes('title') || id.includes('title') || ariaLabel.includes('title')) {
      console.log('Found title input by name/id/aria:', input);
      return input;
    }
  }
  
  // Strategy 3: Find inputs NOT in a search context (exclude inputs next to Search buttons)
  for (const input of inputs) {
    const parent = input.closest('div, form, section');
    if (parent) {
      const hasSearchButton = parent.querySelector('button') && 
        parent.textContent.toLowerCase().includes('search');
      if (!hasSearchButton) {
        // Check if this input has hint text about characters
        const container = input.closest('div');
        if (container && container.textContent.includes('character')) {
          console.log('Found title input by character hint:', input);
          return input;
        }
      }
    }
  }
  
  console.log('Could not find title input');
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

// Handle autofill request from side panel
function handleAutofill(data) {
  console.log('Autofill requested with data:', data);
  
  const results = {
    titleFilled: false,
    asinFilled: false,
    errors: []
  };
  
  // Try to fill title
  if (data.title) {
    const titleInput = findTitleInput();
    if (titleInput) {
      simulateTyping(titleInput, data.title);
      results.titleFilled = true;
    } else {
      results.errors.push('Could not find title input field');
      console.warn('Title input not found. Available inputs:', 
        Array.from(document.querySelectorAll('input')).map(i => ({
          name: i.name,
          id: i.id,
          placeholder: i.placeholder,
          type: i.type,
          'aria-label': i.getAttribute('aria-label'),
          parentText: i.parentElement?.textContent?.slice(0, 50)
        }))
      );
    }
  }
  
  // Optionally fill ASIN search (if requested)
  if (data.asin && data.fillAsin) {
    const asinInput = findElement(UPLOAD_SELECTORS.asinSearch);
    if (asinInput) {
      simulateTyping(asinInput, data.asin);
      results.asinFilled = true;
    } else {
      results.errors.push('Could not find ASIN/product search field');
    }
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

  return true; // Keep channel open for async response
});

// Start
init();
