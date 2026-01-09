const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  
  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshToken = decrypt(user.ebay_refresh_token);
  
  async function getToken() {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope' })
    });
    return (await resp.json()).access_token;
  }

  let accessToken = await getToken();
  let tokenTime = Date.now();

  // 1. Get category tree
  console.log('📥 Fetching eBay category tree...');
  const treeResp = await fetch('https://api.ebay.com/commerce/taxonomy/v1/category_tree/0', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const tree = await treeResp.json();

  // 2. Extract leaf categories
  function getLeaves(node, leaves = []) {
    if (!node.childCategoryTreeNodes || node.childCategoryTreeNodes.length === 0) {
      leaves.push({ id: node.category.categoryId, name: node.category.categoryName });
    } else {
      for (const child of node.childCategoryTreeNodes) getLeaves(child, leaves);
    }
    return leaves;
  }

  const leaves = getLeaves(tree.rootCategoryNode);
  console.log(`📊 Found ${leaves.length} leaf categories\n`);

  // 3. Fetch aspects for each category
  let processed = 0, errors = 0, batch = [];
  const BATCH_SIZE = 100;
  const startTime = Date.now();

  for (let i = 0; i < leaves.length; i++) {
    const cat = leaves[i];
    
    // Refresh token every 30 min
    if (Date.now() - tokenTime > 25 * 60 * 1000) {
      accessToken = await getToken();
      tokenTime = Date.now();
      console.log('🔄 Refreshed token');
    }

    try {
      const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${cat.id}`;
      const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      
      if (resp.status === 429) {
        console.log('⏳ Rate limited, waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
        i--; // Retry
        continue;
      }
      
      const data = await resp.json();
      const requiredAspects = (data.aspects || [])
        .filter(a => a.aspectConstraint?.aspectRequired === true)
        .map(a => a.localizedAspectName);

      batch.push({
        category_id: cat.id,
        category_name: cat.name,
        required_aspects: requiredAspects,
        fetched_at: new Date().toISOString()
      });

      processed++;
    } catch (e) {
      errors++;
    }

    // Insert batch
    if (batch.length >= BATCH_SIZE || i === leaves.length - 1) {
      const { error } = await supabase.from('ebay_category_aspects').upsert(batch, { onConflict: 'category_id' });
      if (error) console.log(`❌ DB error: ${error.message}`);
      batch = [];
    }

    // Progress every 500
    if (processed % 500 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (leaves.length - processed) / rate;
      console.log(`📊 ${processed}/${leaves.length} (${Math.round(rate)}/sec, ~${Math.round(remaining/60)}min remaining)`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n✅ Done! Processed ${processed} categories (${errors} errors)`);
}

run().catch(console.error);
