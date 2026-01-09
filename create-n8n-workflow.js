const fs = require('fs');

const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_URL = 'https://pcn13.app.n8n.cloud';

async function createWorkflow() {
  console.log('📤 Creating n8n workflow...\n');

  // First get existing credentials to reference
  console.log('Getting credentials...');
  const credsResp = await fetch(`${N8N_URL}/api/v1/credentials`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY }
  });
  const creds = await credsResp.json();
  
  // Find Postgres and OpenAI credentials
  let postgresCredId = null;
  let openaiCredId = null;
  
  for (const c of creds.data || []) {
    if (c.type === 'postgres' && c.name.toLowerCase().includes('supa')) {
      postgresCredId = c.id;
      console.log(`  Found Postgres: ${c.name} (${c.id})`);
    }
    if (c.type === 'openAiApi') {
      openaiCredId = c.id;
      console.log(`  Found OpenAI: ${c.name} (${c.id})`);
    }
  }

  if (!postgresCredId) {
    console.log('⚠️ No Supabase Postgres credential found - will need manual setup');
  }
  if (!openaiCredId) {
    console.log('⚠️ No OpenAI credential found - will need manual setup');
  }

  // Build the workflow
  const workflow = {
    name: "eBay Aspect Keyword Review",
    nodes: [
      {
        parameters: {
          rule: {
            interval: [{ field: "minutes", minutesInterval: 5 }]
          }
        },
        id: "trigger",
        name: "Every 5 Minutes",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [250, 300]
      },
      {
        parameters: {
          operation: "executeQuery",
          query: "SELECT * FROM ebay_aspect_misses WHERE status = 'pending' LIMIT 10",
          options: {}
        },
        id: "get-pending",
        name: "Get Pending Misses",
        type: "n8n-nodes-base.postgres",
        typeVersion: 2.5,
        position: [450, 300],
        credentials: postgresCredId ? { postgres: { id: postgresCredId, name: "Supabase" } } : {}
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: "" },
            conditions: [
              { leftValue: "={{ $json.id }}", rightValue: "", operator: { type: "number", operation: "exists" } }
            ],
            combinator: "and"
          },
          options: {}
        },
        id: "has-records",
        name: "Has Records?",
        type: "n8n-nodes-base.if",
        typeVersion: 2,
        position: [650, 300]
      },
      {
        parameters: {
          resource: "chat",
          model: "gpt-4o-mini",
          messages: {
            values: [
              {
                type: "system",
                message: "You analyze product titles and extract keyword patterns for eBay listing aspects.\n\nYou will receive:\n- aspect_name: The eBay aspect that needs a value\n- product_title: The product title from Amazon/Keepa\n- category_name: The eBay category\n\nRespond with JSON only:\n{\n  \"aspect_value\": \"The exact value to use for eBay\",\n  \"keyword_pattern\": \"A regex pattern to match similar products (lowercase)\",\n  \"confidence\": \"high|medium|low\"\n}"
              },
              {
                type: "user",
                message: "=Aspect: {{ $json.aspect_name }}\nCategory: {{ $json.category_name }}\nProduct Title: {{ $json.product_title }}\n\nWhat value should this aspect have, and what keyword pattern would match similar products?"
              }
            ]
          },
          options: { temperature: 0.3 }
        },
        id: "ai-infer",
        name: "AI Infer Pattern",
        type: "@n8n/n8n-nodes-langchain.openAi",
        typeVersion: 1.8,
        position: [900, 200],
        credentials: openaiCredId ? { openAiApi: { id: openaiCredId, name: "OpenAI" } } : {}
      },
      {
        parameters: {
          jsCode: `const response = $input.first().json.message?.content || $input.first().json.text;
const original = $('Get Pending Misses').first().json;

try {
  const parsed = JSON.parse(response);
  return [{
    json: {
      ...original,
      suggested_value: parsed.aspect_value,
      suggested_pattern: parsed.keyword_pattern,
      confidence: parsed.confidence || 'medium'
    }
  }];
} catch (e) {
  return [{ json: { ...original, error: 'Failed to parse AI response', raw: response } }];
}`
        },
        id: "parse-response",
        name: "Parse AI Response",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1100, 200]
      },
      {
        parameters: {
          conditions: {
            options: { caseSensitive: false },
            conditions: [
              { leftValue: "={{ $json.confidence }}", rightValue: "high", operator: { type: "string", operation: "equals" } }
            ],
            combinator: "and"
          },
          options: {}
        },
        id: "high-confidence",
        name: "High Confidence?",
        type: "n8n-nodes-base.if",
        typeVersion: 2,
        position: [1300, 200]
      },
      {
        parameters: {
          operation: "executeQuery",
          query: "INSERT INTO ebay_aspect_keywords (aspect_name, keyword_pattern, aspect_value, category_id) VALUES ('{{ $json.aspect_name }}', '{{ $json.suggested_pattern }}', '{{ $json.suggested_value }}', '{{ $json.category_id }}') ON CONFLICT DO NOTHING",
          options: {}
        },
        id: "insert-keyword",
        name: "Insert Keyword",
        type: "n8n-nodes-base.postgres",
        typeVersion: 2.5,
        position: [1500, 100],
        credentials: postgresCredId ? { postgres: { id: postgresCredId, name: "Supabase" } } : {}
      },
      {
        parameters: {
          operation: "executeQuery",
          query: "UPDATE ebay_aspect_misses SET status = 'processed', suggested_value = '{{ $json.suggested_value }}', suggested_pattern = '{{ $json.suggested_pattern }}', reviewed_at = NOW() WHERE id = {{ $json.id }}",
          options: {}
        },
        id: "mark-processed",
        name: "Mark Processed",
        type: "n8n-nodes-base.postgres",
        typeVersion: 2.5,
        position: [1700, 100],
        credentials: postgresCredId ? { postgres: { id: postgresCredId, name: "Supabase" } } : {}
      },
      {
        parameters: {
          operation: "executeQuery",
          query: "UPDATE ebay_aspect_misses SET status = 'review_needed', suggested_value = '{{ $json.suggested_value }}', suggested_pattern = '{{ $json.suggested_pattern }}', notes = 'Low confidence - needs manual review' WHERE id = {{ $json.id }}",
          options: {}
        },
        id: "flag-review",
        name: "Flag for Review",
        type: "n8n-nodes-base.postgres",
        typeVersion: 2.5,
        position: [1500, 350],
        credentials: postgresCredId ? { postgres: { id: postgresCredId, name: "Supabase" } } : {}
      }
    ],
    connections: {
      "Every 5 Minutes": { main: [[{ node: "Get Pending Misses", type: "main", index: 0 }]] },
      "Get Pending Misses": { main: [[{ node: "Has Records?", type: "main", index: 0 }]] },
      "Has Records?": { main: [[{ node: "AI Infer Pattern", type: "main", index: 0 }], []] },
      "AI Infer Pattern": { main: [[{ node: "Parse AI Response", type: "main", index: 0 }]] },
      "Parse AI Response": { main: [[{ node: "High Confidence?", type: "main", index: 0 }]] },
      "High Confidence?": { main: [[{ node: "Insert Keyword", type: "main", index: 0 }], [{ node: "Flag for Review", type: "main", index: 0 }]] },
      "Insert Keyword": { main: [[{ node: "Mark Processed", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };

  // Create the workflow
  console.log('\n📤 Creating workflow...');
  const createResp = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(workflow)
  });

  const result = await createResp.json();
  
  if (result.id) {
    console.log(`✅ Workflow created: ${result.name} (id: ${result.id})`);
    console.log(`\n🔗 Open in n8n: ${N8N_URL}/workflow/${result.id}`);
    
    // Note about credentials
    if (!postgresCredId || !openaiCredId) {
      console.log('\n⚠️ You need to manually add credentials in n8n:');
      if (!postgresCredId) console.log('   - Add Postgres credential for Supabase');
      if (!openaiCredId) console.log('   - Add OpenAI API credential');
    }
  } else {
    console.log('❌ Failed to create workflow:', JSON.stringify(result, null, 2));
  }
}

createWorkflow().catch(console.error);
