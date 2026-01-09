const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_URL = 'https://pcn13.app.n8n.cloud';
const WORKFLOW_ID = '9oVqaY93PJwWn3FA';

// Credentials found from existing workflows
const POSTGRES_CRED = { id: 'YxtUSihbqdQS39kv', name: 'Postgres account 2' };
const ANTHROPIC_CRED = { id: '0UUutAYJmtFDUlIS', name: 'Anthropic account' };

async function updateWorkflow() {
  console.log('📤 Updating workflow with correct credentials and Claude...\n');

  const workflow = {
    name: "eBay Aspect Keyword Review",
    nodes: [
      {
        parameters: {
          rule: { interval: [{ field: "minutes", minutesInterval: 5 }] }
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
        credentials: { postgres: POSTGRES_CRED }
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
          modelId: { __rl: true, value: "claude-3-5-sonnet-20241022", mode: "list" },
          messages: {
            values: [
              {
                type: "system",
                message: "You analyze product titles and extract keyword patterns for eBay listing aspects.\n\nYou will receive:\n- aspect_name: The eBay aspect that needs a value\n- product_title: The product title from Amazon/Keepa\n- category_name: The eBay category\n\nRespond with JSON only (no markdown):\n{\"aspect_value\": \"exact value for eBay\", \"keyword_pattern\": \"regex pattern lowercase\", \"confidence\": \"high|medium|low\"}"
              },
              {
                type: "human",
                message: "=Aspect: {{ $json.aspect_name }}\nCategory: {{ $json.category_name }}\nProduct Title: {{ $json.product_title }}\n\nWhat value and keyword pattern?"
              }
            ]
          },
          options: { maxTokensToSample: 500, temperature: 0.3 }
        },
        id: "ai-infer",
        name: "Claude Infer Pattern",
        type: "@n8n/n8n-nodes-langchain.lmChatAnthropic",
        typeVersion: 1.2,
        position: [900, 200],
        credentials: { anthropicApi: ANTHROPIC_CRED }
      },
      {
        parameters: {
          jsCode: `const aiOutput = $input.first().json;
const original = $('Get Pending Misses').first().json;
const response = aiOutput.text || aiOutput.message?.content || JSON.stringify(aiOutput);

try {
  // Try to extract JSON from response
  const jsonMatch = response.match(/\\{[^}]+\\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return [{
      json: {
        ...original,
        suggested_value: parsed.aspect_value,
        suggested_pattern: parsed.keyword_pattern,
        confidence: parsed.confidence || 'medium'
      }
    }];
  }
  throw new Error('No JSON found');
} catch (e) {
  return [{ json: { ...original, error: e.message, raw: response.substring(0, 200) } }];
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
        credentials: { postgres: POSTGRES_CRED }
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
        credentials: { postgres: POSTGRES_CRED }
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
        credentials: { postgres: POSTGRES_CRED }
      }
    ],
    connections: {
      "Every 5 Minutes": { main: [[{ node: "Get Pending Misses", type: "main", index: 0 }]] },
      "Get Pending Misses": { main: [[{ node: "Has Records?", type: "main", index: 0 }]] },
      "Has Records?": { main: [[{ node: "Claude Infer Pattern", type: "main", index: 0 }], []] },
      "Claude Infer Pattern": { main: [[{ node: "Parse AI Response", type: "main", index: 0 }]] },
      "Parse AI Response": { main: [[{ node: "High Confidence?", type: "main", index: 0 }]] },
      "High Confidence?": { main: [[{ node: "Insert Keyword", type: "main", index: 0 }], [{ node: "Flag for Review", type: "main", index: 0 }]] },
      "Insert Keyword": { main: [[{ node: "Mark Processed", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };

  // Update the workflow
  const updateResp = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(workflow)
  });

  const result = await updateResp.json();
  
  if (result.id) {
    console.log(`✅ Workflow updated with Claude + Postgres credentials`);
    
    // Now activate the workflow
    console.log('\n🔌 Activating workflow...');
    const activateResp = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });
    const activateResult = await activateResp.json();
    
    if (activateResult.active) {
      console.log('✅ Workflow is now ACTIVE!');
    } else {
      console.log('⚠️ Activation result:', JSON.stringify(activateResult));
    }
    
    console.log(`\n🔗 View: ${N8N_URL}/workflow/${WORKFLOW_ID}`);
  } else {
    console.log('❌ Failed:', JSON.stringify(result, null, 2));
  }
}

updateWorkflow().catch(console.error);
