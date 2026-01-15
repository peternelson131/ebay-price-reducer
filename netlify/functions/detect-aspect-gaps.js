/**
 * Aspect Gap Detector
 * 
 * Tests ASINs without publishing to detect missing category aspects.
 * Logs gaps to help improve our aspect mapping.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Y2RrYW5jY2JkZXFlYm5hYmdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTAwNDA3MCwiZXhwIjoyMDc0NTgwMDcwfQ.r44KVS4730gbXbpkaW10wm4xJTX9imGi8sxOC64u2PU';
const KEEPA_KEY = process.env.KEEPA_API_KEY || '1o56h544hgl404gh3a1kdns4n5jvju2resncf4i0fhlkfa8cuhgl44dkdooa78ls';
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// Track gaps
const gaps = {};
const results = [];

async function getAuthToken() {
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  return verifyData.session.access_token;
}

async function getKeepaProduct(asin) {
  const response = await fetch(`https://api.keepa.com/product?key=${KEEPA_KEY}&domain=1&asin=${asin}`);
  const data = await response.json();
  return data.products?.[0] || null;
}

async function getCategorySuggestion(title) {
  const response = await fetch(`${API_BASE}/get-ebay-category-suggestion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  return response.json();
}

async function getCategoryAspects(categoryId) {
  // Check our database first
  const { data: cached } = await supabase
    .from('ebay_category_aspects')
    .select('*')
    .eq('category_id', categoryId)
    .single();
  
  if (cached) {
    return cached.required_aspects || [];
  }
  
  // Fetch from eBay API
  const response = await fetch(`${API_BASE}/get-ebay-category-aspects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId })
  });
  const data = await response.json();
  return data.aspects?.filter(a => a.required)?.map(a => a.name) || [];
}

function getKeepaAspects(product) {
  const aspects = {};
  if (product.brand) aspects['Brand'] = product.brand;
  if (product.model) aspects['Model'] = product.model;
  if (product.partNumber) aspects['MPN'] = product.partNumber;
  if (product.manufacturer) aspects['Manufacturer'] = product.manufacturer;
  if (product.color) aspects['Color'] = product.color;
  if (product.size) aspects['Size'] = product.size;
  if (product.upcList?.length) aspects['UPC'] = product.upcList[0];
  if (product.eanList?.length) aspects['EAN'] = product.eanList[0];
  return aspects;
}

function recordGap(categoryId, categoryName, aspectName, asin) {
  const key = `${categoryId}:${aspectName}`;
  if (!gaps[key]) {
    gaps[key] = {
      categoryId,
      categoryName,
      aspectName,
      count: 0,
      sampleAsins: []
    };
  }
  gaps[key].count++;
  if (gaps[key].sampleAsins.length < 5 && !gaps[key].sampleAsins.includes(asin)) {
    gaps[key].sampleAsins.push(asin);
  }
}

async function analyzeAsin(asin, num, total) {
  process.stdout.write(`[${String(num).padStart(2)}/${total}] ${asin} `);
  
  try {
    // Get product from Keepa
    const product = await getKeepaProduct(asin);
    if (!product || !product.title) {
      console.log('❌ No Keepa data');
      results.push({ asin, status: 'no_keepa_data' });
      return;
    }
    
    // Get eBay category
    const catResult = await getCategorySuggestion(product.title);
    if (!catResult.categoryId) {
      console.log('❌ No category');
      results.push({ asin, status: 'no_category' });
      return;
    }
    
    const categoryId = catResult.categoryId;
    const categoryName = catResult.categoryName;
    
    // Get required aspects for this category
    const requiredAspects = await getCategoryAspects(categoryId);
    
    // Get what we have from Keepa
    const keepaAspects = getKeepaAspects(product);
    const keepaKeys = Object.keys(keepaAspects).map(k => k.toLowerCase());
    
    // Find gaps
    const missingAspects = [];
    for (const required of requiredAspects) {
      const reqLower = required.toLowerCase();
      const hasMatch = keepaKeys.some(k => 
        k === reqLower || 
        k.includes(reqLower) || 
        reqLower.includes(k)
      );
      if (!hasMatch) {
        missingAspects.push(required);
        recordGap(categoryId, categoryName, required, asin);
      }
    }
    
    if (missingAspects.length > 0) {
      console.log(`⚠️  ${categoryName} - Missing: ${missingAspects.join(', ')}`);
      results.push({ 
        asin, 
        status: 'gaps_found', 
        categoryId, 
        categoryName, 
        required: requiredAspects.length,
        missing: missingAspects 
      });
    } else {
      console.log(`✅ ${categoryName} - All aspects covered`);
      results.push({ 
        asin, 
        status: 'complete', 
        categoryId, 
        categoryName,
        required: requiredAspects.length
      });
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    results.push({ asin, status: 'error', error: error.message });
  }
}

async function run(asins) {
  console.log('═'.repeat(70));
  console.log('   ASPECT GAP DETECTOR');
  console.log('═'.repeat(70));
  console.log(`\nAnalyzing ${asins.length} ASINs for missing category aspects...\n`);
  
  for (let i = 0; i < asins.length; i++) {
    await analyzeAsin(asins[i], i + 1, asins.length);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
  
  // Summary
  const complete = results.filter(r => r.status === 'complete').length;
  const withGaps = results.filter(r => r.status === 'gaps_found').length;
  const errors = results.filter(r => r.status === 'error' || r.status === 'no_keepa_data' || r.status === 'no_category').length;
  
  console.log('\n' + '═'.repeat(70));
  console.log('   RESULTS');
  console.log('═'.repeat(70));
  console.log(`\n✅ Complete (no gaps): ${complete}`);
  console.log(`⚠️  With gaps: ${withGaps}`);
  console.log(`❌ Errors: ${errors}`);
  
  // Gap summary by category
  const gapList = Object.values(gaps).sort((a, b) => b.count - a.count);
  
  if (gapList.length > 0) {
    console.log('\n📊 ASPECT GAPS BY FREQUENCY:');
    console.log('─'.repeat(70));
    
    // Group by category
    const byCategory = {};
    for (const gap of gapList) {
      if (!byCategory[gap.categoryId]) {
        byCategory[gap.categoryId] = {
          categoryName: gap.categoryName,
          aspects: []
        };
      }
      byCategory[gap.categoryId].aspects.push({
        name: gap.aspectName,
        count: gap.count,
        samples: gap.sampleAsins
      });
    }
    
    for (const [catId, cat] of Object.entries(byCategory)) {
      console.log(`\n📁 ${cat.categoryName} (${catId}):`);
      for (const asp of cat.aspects) {
        console.log(`   - ${asp.name}: ${asp.count}x (samples: ${asp.samples.join(', ')})`);
      }
    }
  }
  
  // Save to file
  const report = {
    timestamp: new Date().toISOString(),
    totalAsins: asins.length,
    complete,
    withGaps,
    errors,
    gapsByCategory: Object.values(gaps).reduce((acc, g) => {
      if (!acc[g.categoryId]) acc[g.categoryId] = { name: g.categoryName, gaps: [] };
      acc[g.categoryId].gaps.push({ aspect: g.aspectName, count: g.count, samples: g.sampleAsins });
      return acc;
    }, {}),
    results
  };
  
  const reportPath = __dirname + '/../../aspect-gaps-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: aspect-gaps-report.json`);
  
  return report;
}

// Export for use as module
module.exports = { run, analyzeAsin };

// Run if called directly
if (require.main === module) {
  const testAsins = process.argv.slice(2);
  if (testAsins.length === 0) {
    console.log('Usage: node detect-aspect-gaps.js ASIN1 ASIN2 ...');
    console.log('Or import and call run([asins])');
    process.exit(1);
  }
  run(testAsins).catch(console.error);
}
