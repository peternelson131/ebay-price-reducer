const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--window-size=1920,1080']
  });

  const page = await browser.newPage();

  // Capture console messages
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.type(), msg.text());
  });

  // Capture network requests - focus on API calls
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('strategies') || url.includes('supabase')) {
      console.log('\n=== NETWORK REQUEST ===');
      console.log('URL:', url);
      console.log('Status:', response.status());
      try {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log('Response Data:', JSON.stringify(data, null, 2).substring(0, 2000));
        }
      } catch (e) {
        // Not JSON or already consumed
      }
    }
  });

  // Capture network errors
  page.on('requestfailed', request => {
    console.log('\n=== REQUEST FAILED ===');
    console.log('URL:', request.url());
    console.log('Error:', request.failure().errorText);
  });

  await page.goto('https://dainty-horse-49c336.netlify.app/', {
    waitUntil: 'networkidle2'
  });

  console.log('\n=== Browser opened with DevTools ===');
  console.log('Ready for testing! Please log in and navigate to the Strategies page.');
  console.log('Press Ctrl+C to exit');
})();
