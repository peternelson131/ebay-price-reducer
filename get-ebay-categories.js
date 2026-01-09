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
  
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokens = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope' })
  }).then(r => r.json());

  console.log('🔍 Getting eBay category tree (US)\n');

  // Get the full category tree
  const url = 'https://api.ebay.com/commerce/taxonomy/v1/category_tree/0';
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
  const data = await resp.json();
  
  console.log(`Category Tree ID: ${data.categoryTreeId}`);
  console.log(`Version: ${data.categoryTreeVersion}`);
  console.log(`Root: ${data.rootCategoryNode?.category?.categoryName}`);
  
  // Count categories recursively
  function countCategories(node) {
    let count = 1;
    if (node.childCategoryTreeNodes) {
      for (const child of node.childCategoryTreeNodes) {
        count += countCategories(child);
      }
    }
    return count;
  }
  
  // Get leaf categories (no children)
  function getLeafCategories(node, leaves = []) {
    if (!node.childCategoryTreeNodes || node.childCategoryTreeNodes.length === 0) {
      leaves.push({
        id: node.category.categoryId,
        name: node.category.categoryName
      });
    } else {
      for (const child of node.childCategoryTreeNodes) {
        getLeafCategories(child, leaves);
      }
    }
    return leaves;
  }
  
  const totalCount = countCategories(data.rootCategoryNode);
  const leaves = getLeafCategories(data.rootCategoryNode);
  
  console.log(`\nTotal categories: ${totalCount}`);
  console.log(`Leaf categories: ${leaves.length}`);
  console.log(`\nSample leaf categories:`);
  leaves.slice(0, 20).forEach(l => console.log(`  ${l.id}: ${l.name}`));
}

run().catch(console.error);
