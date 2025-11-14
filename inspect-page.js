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
  
  // Capture network requests
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('listings') || url.includes('supabase')) {
      console.log('\n=== NETWORK REQUEST ===');
      console.log('URL:', url);
      console.log('Status:', response.status());
      try {
        const data = await response.json();
        console.log('Response Data:', JSON.stringify(data, null, 2).substring(0, 1000));
      } catch (e) {
        // Not JSON
      }
    }
  });
  
  await page.goto('https://dainty-horse-49c336.netlify.app/', {
    waitUntil: 'networkidle2'
  });
  
  console.log('\n=== Browser opened with DevTools. Press Ctrl+C to exit ===');
})();
