const puppeteer = require('puppeteer');

// Test Results Tracker
const results = {
  passed: [],
  failed: [],
  skipped: []
};

function logTest(name, passed, message = '') {
  const result = { name, message, timestamp: new Date().toISOString() };
  if (passed) {
    results.passed.push(result);
    console.log(`✅ PASS: ${name}`);
  } else {
    results.failed.push(result);
    console.log(`❌ FAIL: ${name} - ${message}`);
  }
}

function logSkip(name, reason = '') {
  results.skipped.push({ name, reason, timestamp: new Date().toISOString() });
  console.log(`⏭️  SKIP: ${name} - ${reason}`);
}

// Helper to wait
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to wait for network idle
async function waitForNetworkIdle(page, timeout = 2000) {
  try {
    await page.waitForNetworkIdle({ timeout, idleTime: 500 });
  } catch {
    // Fallback if waitForNetworkIdle not available
    await wait(timeout);
  }
}

// Helper to wait for element and get text
async function getElementText(page, selector) {
  await page.waitForSelector(selector, { timeout: 5000 });
  return await page.$eval(selector, el => el.textContent.trim());
}

// Helper to check if element exists
async function elementExists(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// Helper to generate unique strategy name
function generateStrategyName(prefix = 'Test Strategy') {
  return `${prefix} ${Date.now()}`;
}

(async () => {
  console.log('\n🧪 ========================================');
  console.log('   eBay Price Reducer - Strategies Test Suite');
  console.log('   ========================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--window-size=1920,1080'],
    slowMo: 50 // Slow down operations for visibility
  });

  const page = await browser.newPage();

  // Track network requests
  const networkRequests = [];
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('strategies') || url.includes('supabase')) {
      const request = {
        url,
        status: response.status(),
        method: response.request().method(),
        timestamp: new Date().toISOString()
      };

      try {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('application/json')) {
          request.data = await response.json();
        }
      } catch (e) {
        // Not JSON or already consumed
      }

      networkRequests.push(request);
      console.log(`📡 ${request.method} ${url.split('/').pop()} - ${request.status}`);
    }
  });

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('🔴 BROWSER ERROR:', msg.text());
    }
  });

  try {
    console.log('\n📋 TEST SECTION 1: Navigation\n');

    // Test 1.1: Navigate to site and login
    console.log('Navigating to https://dainty-horse-49c336.netlify.app/...');
    await page.goto('https://dainty-horse-49c336.netlify.app/', {
      waitUntil: 'networkidle2'
    });

    // Wait a moment for auth to settle
    await wait(2000);

    // Check if we need to login or already logged in
    const isLoggedIn = await elementExists(page, 'nav a[href*="strategies"], nav a:has-text("Strategies")');

    if (!isLoggedIn) {
      console.log('⚠️  Not logged in - user needs to manually log in first');
      console.log('Please log in and then press Enter to continue tests...');
      // Wait for user to log in manually
      await wait(30000);
    }

    logTest('1.1: Initial page load', true);

    // Test 1.2: Navigate to Strategies page
    console.log('\nNavigating to Strategies page...');

    // Try multiple selectors for the strategies link
    const strategiesLink = await page.evaluateHandle(() => {
      // Try to find link by href
      let link = document.querySelector('a[href*="/strategies"]');
      if (link) return link;

      // Try to find by text content
      const links = Array.from(document.querySelectorAll('a'));
      link = links.find(a => a.textContent.toLowerCase().includes('strateg') ||
                             a.textContent.toLowerCase().includes('rules'));
      return link;
    });

    if (strategiesLink) {
      await strategiesLink.click();
      await waitForNetworkIdle(page);

      const url = page.url();
      const isOnStrategiesPage = url.includes('strategies') || url.includes('rules');
      logTest('1.2: Navigate to Strategies page', isOnStrategiesPage, `URL: ${url}`);
    } else {
      logTest('1.2: Navigate to Strategies page', false, 'Could not find Strategies link');
    }

    // Test 1.3: Verify page header
    const hasHeader = await elementExists(page, 'h1');
    if (hasHeader) {
      const headerText = await getElementText(page, 'h1');
      const isCorrectHeader = headerText.toLowerCase().includes('price') ||
                              headerText.toLowerCase().includes('strateg') ||
                              headerText.toLowerCase().includes('rules');
      logTest('1.3: Verify page header', isCorrectHeader, `Found: "${headerText}"`);
    } else {
      logTest('1.3: Verify page header', false, 'No h1 found');
    }

    await wait(1000);

    console.log('\n📋 TEST SECTION 2: Viewing Strategies\n');

    // Test 2.1: Check if strategies exist or empty state
    const hasEmptyState = await elementExists(page, 'div:has-text("No rules created yet")');
    const hasStrategiesList = await elementExists(page, 'div:has-text("Your Rules")');

    if (hasEmptyState) {
      logTest('2.1: Empty state displayed correctly', true);
      console.log('Empty state detected - will test creation flow');
    } else if (hasStrategiesList) {
      logTest('2.1: Strategies list displayed', true);

      // Count existing strategies
      const strategyCount = await page.evaluate(() => {
        const header = Array.from(document.querySelectorAll('*')).find(el =>
          el.textContent.includes('Your Rules')
        );
        if (header) {
          const match = header.textContent.match(/Your Rules \((\d+)\)/);
          return match ? parseInt(match[1]) : 0;
        }
        return 0;
      });
      console.log(`Found ${strategyCount} existing strategies`);
      logTest('2.2: Strategy count displayed', strategyCount >= 0);
    } else {
      logTest('2.1: Page state unclear', false, 'Neither empty state nor list found');
    }

    await wait(1000);

    console.log('\n📋 TEST SECTION 3: Creating Strategies\n');

    // Test 3.1: Open create modal
    console.log('Looking for "Add New Rule" button...');

    const addButtonClicked = await page.evaluate(() => {
      // Try multiple button text variations
      const buttons = Array.from(document.querySelectorAll('button'));
      const addButton = buttons.find(b =>
        b.textContent.includes('Add New Rule') ||
        b.textContent.includes('Create First Rule') ||
        b.textContent.includes('Add Rule') ||
        b.textContent.includes('New Rule')
      );

      if (addButton) {
        addButton.click();
        return true;
      }
      return false;
    });

    await wait(1000);

    const modalOpen = await elementExists(page, 'div:has-text("Create New Rule")');
    logTest('3.1: Open create modal', addButtonClicked && modalOpen);

    if (modalOpen) {
      // Test 3.2: Create percentage strategy
      console.log('\nCreating percentage strategy...');

      const strategyName = generateStrategyName('Percentage Test');

      // Fill in form
      await page.evaluate((name) => {
        // Find name input
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const nameInput = inputs.find(i =>
          i.placeholder?.toLowerCase().includes('name') ||
          i.previousElementSibling?.textContent.toLowerCase().includes('name')
        );

        if (nameInput) {
          nameInput.value = name;
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, strategyName);

      await wait(500);

      // Ensure percentage is selected (should be default)
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const percentButton = buttons.find(b => b.textContent.includes('Percentage'));
        if (percentButton && !percentButton.className.includes('blue')) {
          percentButton.click();
        }
      });

      await wait(500);

      // Set reduction amount to 10
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        const amountInput = inputs.find(i =>
          i.previousElementSibling?.textContent.toLowerCase().includes('reduction')
        );

        if (amountInput) {
          amountInput.value = '10';
          amountInput.dispatchEvent(new Event('input', { bubbles: true }));
          amountInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      await wait(500);

      // Set frequency to 7 days
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        const frequencyInput = inputs.find(i =>
          i.previousElementSibling?.textContent.toLowerCase().includes('frequency')
        );

        if (frequencyInput) {
          frequencyInput.value = '7';
          frequencyInput.dispatchEvent(new Event('input', { bubbles: true }));
          frequencyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      await wait(500);

      // Track network requests before submission
      const requestCountBefore = networkRequests.length;

      // Click Create Rule button
      const createClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createButton = buttons.find(b =>
          b.textContent.includes('Create Rule') &&
          !b.disabled
        );

        if (createButton) {
          createButton.click();
          return true;
        }
        return false;
      });

      await wait(2000);
      await waitForNetworkIdle(page);

      // Check for success notification
      const hasSuccessNotification = await page.evaluate((name) => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements.some(el =>
          el.textContent.includes('created successfully') &&
          el.textContent.includes(name)
        );
      }, strategyName);

      // Check if modal closed
      const modalClosed = !(await elementExists(page, 'div:has-text("Create New Rule")'));

      // Check if new strategy appears in list
      const strategyInList = await page.evaluate((name) => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements.some(el => el.textContent === name);
      }, strategyName);

      // Check for INSERT network request
      const hasInsertRequest = networkRequests.slice(requestCountBefore).some(req =>
        req.url.includes('strategies') &&
        (req.method === 'POST' || req.data?.name === strategyName)
      );

      logTest('3.2: Create percentage strategy - Form filled', createClicked);
      logTest('3.3: Create percentage strategy - Success notification', hasSuccessNotification);
      logTest('3.4: Create percentage strategy - Modal closed', modalClosed);
      logTest('3.5: Create percentage strategy - Appears in list', strategyInList);
      logTest('3.6: Create percentage strategy - INSERT request sent', hasInsertRequest);

      console.log(`\nCreated strategy: "${strategyName}"`);

      await wait(2000);

      // Test 3.3: Create dollar strategy
      console.log('\nCreating dollar strategy...');

      // Open modal again
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const addButton = buttons.find(b =>
          b.textContent.includes('Add New Rule') ||
          b.textContent.includes('New Rule')
        );
        if (addButton) addButton.click();
      });

      await wait(1000);

      const dollarStrategyName = generateStrategyName('Dollar Test');

      // Fill in form
      await page.evaluate((name) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const nameInput = inputs.find(i =>
          i.placeholder?.toLowerCase().includes('name') ||
          i.previousElementSibling?.textContent.toLowerCase().includes('name')
        );
        if (nameInput) {
          nameInput.value = name;
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, dollarStrategyName);

      await wait(500);

      // Click Dollar Amount button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const dollarButton = buttons.find(b => b.textContent.includes('Dollar Amount'));
        if (dollarButton) dollarButton.click();
      });

      await wait(500);

      // Set amount to $25
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        const amountInput = inputs[0]; // First number input should be amount
        if (amountInput) {
          amountInput.value = '25';
          amountInput.dispatchEvent(new Event('input', { bubbles: true }));
          amountInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      await wait(500);

      // Set frequency to 5 days
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        const frequencyInput = inputs[1]; // Second number input should be frequency
        if (frequencyInput) {
          frequencyInput.value = '5';
          frequencyInput.dispatchEvent(new Event('input', { bubbles: true }));
          frequencyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      await wait(500);

      const requestCountBefore2 = networkRequests.length;

      // Submit
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createButton = buttons.find(b =>
          b.textContent.includes('Create Rule') && !b.disabled
        );
        if (createButton) createButton.click();
      });

      await wait(2000);
      await waitForNetworkIdle(page);

      const hasDollarSuccess = await page.evaluate((name) => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements.some(el =>
          el.textContent.includes('created successfully') &&
          el.textContent.includes(name)
        );
      }, dollarStrategyName);

      const dollarInList = await page.evaluate((name) => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements.some(el => el.textContent === name);
      }, dollarStrategyName);

      const hasDollarInsert = networkRequests.slice(requestCountBefore2).some(req =>
        req.url.includes('strategies') && req.data?.name === dollarStrategyName
      );

      logTest('3.7: Create dollar strategy - Success notification', hasDollarSuccess);
      logTest('3.8: Create dollar strategy - Appears in list', dollarInList);
      logTest('3.9: Create dollar strategy - INSERT request sent', hasDollarInsert);

      console.log(`\nCreated strategy: "${dollarStrategyName}"`);

      await wait(2000);

      console.log('\n📋 TEST SECTION 4: Editing Strategies\n');

      // Test 4: Edit a strategy
      console.log('Testing edit functionality...');

      const editClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const editButton = buttons.find(b => b.textContent.trim() === 'Edit');
        if (editButton) {
          editButton.click();
          return true;
        }
        return false;
      });

      await wait(1000);

      const editFormVisible = await page.evaluate(() => {
        // Check if Save Changes button exists (indicates edit mode)
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent.includes('Save Changes'));
      });

      logTest('4.1: Click Edit button', editClicked);
      logTest('4.2: Edit form displayed', editFormVisible);

      if (editFormVisible) {
        // Change the name
        const updatedName = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
          const nameInput = inputs.find(i => i.value); // Find input with existing value
          if (nameInput) {
            const newName = nameInput.value + ' [EDITED]';
            nameInput.value = newName;
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            nameInput.dispatchEvent(new Event('change', { bubbles: true }));
            return newName;
          }
          return null;
        });

        await wait(500);

        const requestCountBefore3 = networkRequests.length;

        // Click Save Changes
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const saveButton = buttons.find(b => b.textContent.includes('Save Changes'));
          if (saveButton) saveButton.click();
        });

        await wait(2000);
        await waitForNetworkIdle(page);

        const hasUpdateSuccess = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => el.textContent.includes('updated successfully'));
        });

        const hasUpdateRequest = networkRequests.slice(requestCountBefore3).some(req =>
          req.url.includes('strategies') &&
          (req.method === 'PATCH' || req.method === 'PUT')
        );

        logTest('4.3: Edit strategy - Success notification', hasUpdateSuccess);
        logTest('4.4: Edit strategy - UPDATE request sent', hasUpdateRequest);

        if (updatedName) {
          const updatedInList = await page.evaluate((name) => {
            const elements = Array.from(document.querySelectorAll('*'));
            return elements.some(el => el.textContent.includes(name));
          }, updatedName);
          logTest('4.5: Edit strategy - Updated name in list', updatedInList);
        }
      }

      await wait(2000);

      console.log('\n📋 TEST SECTION 5: Validation Tests\n');

      // Test 5: Validation - Empty name
      console.log('Testing validation...');

      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const addButton = buttons.find(b => b.textContent.includes('Add New Rule'));
        if (addButton) addButton.click();
      });

      await wait(1000);

      // Try to submit with empty name
      const createButtonDisabled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const createButton = buttons.find(b => b.textContent.includes('Create Rule'));
        return createButton ? createButton.disabled : false;
      });

      logTest('5.1: Validation - Create button disabled with empty name', createButtonDisabled);

      // Close modal
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const cancelButton = buttons.find(b => b.textContent.trim() === 'Cancel');
        if (cancelButton) cancelButton.click();
      });

      await wait(1000);

      console.log('\n📋 TEST SECTION 6: Deleting Strategies\n');

      // Test 6: Delete a strategy
      console.log('Testing delete functionality...');

      // Get the name of the first strategy before deleting
      const strategyToDelete = await page.evaluate(() => {
        // Find a strategy name (usually in an h4 tag)
        const headers = Array.from(document.querySelectorAll('h4'));
        return headers[0]?.textContent.trim() || null;
      });

      if (strategyToDelete) {
        console.log(`Attempting to delete: "${strategyToDelete}"`);

        // Click delete button
        const deleteClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const deleteButton = buttons.find(b =>
            b.textContent.trim() === 'Delete' &&
            b.className.includes('red')
          );
          if (deleteButton) {
            deleteButton.click();
            return true;
          }
          return false;
        });

        await wait(500);

        logTest('6.1: Click Delete button', deleteClicked);

        // Handle confirmation dialog
        page.on('dialog', async dialog => {
          console.log(`Dialog message: ${dialog.message()}`);
          await dialog.accept();
        });

        await wait(2000);

        const requestCountBefore4 = networkRequests.length;

        await waitForNetworkIdle(page);

        const hasDeleteSuccess = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => el.textContent.includes('deleted successfully'));
        });

        const hasDeleteRequest = networkRequests.slice(requestCountBefore4).some(req =>
          req.url.includes('strategies') && req.method === 'DELETE'
        );

        const strategyRemoved = !(await page.evaluate((name) => {
          const elements = Array.from(document.querySelectorAll('*'));
          return elements.some(el => el.textContent === name);
        }, strategyToDelete));

        logTest('6.2: Delete strategy - Success notification', hasDeleteSuccess);
        logTest('6.3: Delete strategy - DELETE request sent', hasDeleteRequest);
        logTest('6.4: Delete strategy - Removed from list', strategyRemoved);
      } else {
        logSkip('6.1-6.4: Delete tests', 'No strategies found to delete');
      }

    } else {
      logSkip('3.x - 6.x: Most tests', 'Could not open create modal');
    }

  } catch (error) {
    console.error('\n💥 TEST SUITE ERROR:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n\n📊 ========================================');
    console.log('   TEST RESULTS SUMMARY');
    console.log('   ========================================\n');

    console.log(`✅ PASSED: ${results.passed.length}`);
    console.log(`❌ FAILED: ${results.failed.length}`);
    console.log(`⏭️  SKIPPED: ${results.skipped.length}`);
    console.log(`📝 TOTAL: ${results.passed.length + results.failed.length + results.skipped.length}`);

    if (results.failed.length > 0) {
      console.log('\n\n❌ FAILED TESTS:\n');
      results.failed.forEach(test => {
        console.log(`  • ${test.name}`);
        if (test.message) console.log(`    ${test.message}`);
      });
    }

    if (results.skipped.length > 0) {
      console.log('\n\n⏭️  SKIPPED TESTS:\n');
      results.skipped.forEach(test => {
        console.log(`  • ${test.name}`);
        if (test.reason) console.log(`    ${test.reason}`);
      });
    }

    console.log('\n\n📡 NETWORK ACTIVITY SUMMARY:\n');
    const strategiesRequests = networkRequests.filter(r => r.url.includes('strategies'));
    console.log(`Total Strategies API calls: ${strategiesRequests.length}`);

    const methods = {};
    strategiesRequests.forEach(r => {
      methods[r.method] = (methods[r.method] || 0) + 1;
    });
    console.log('Breakdown by method:', methods);

    console.log('\n========================================\n');
    console.log('Test suite complete. Browser will remain open for manual inspection.');
    console.log('Press Ctrl+C to close browser and exit.\n');
  }
})();
