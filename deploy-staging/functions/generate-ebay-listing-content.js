/**
 * Story 5: AI Title & Description Generation
 * 
 * Uses Claude AI to generate optimized eBay listing titles and descriptions
 * from Keepa product data.
 * 
 * Acceptance Criteria:
 * 1. Title ≤80 characters (hard requirement with safety trim)
 * 2. Title includes brand if available
 * 3. Title includes key identifiers (model, size, color)
 * 4. Description is valid HTML
 * 5. Description has features as <ul><li> items
 * 6. No Amazon/Prime references
 * 7. Handles missing data without crash
 * 8. Response time < 5 seconds
 */

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Safety trim title to max length, cutting at last complete word
 */
function safeTrimTitle(title, maxLength = 80) {
  if (!title) return '';
  
  // Remove any leading/trailing whitespace
  title = title.trim();
  
  if (title.length <= maxLength) return title;
  
  // Truncate at last space before limit
  const trimmed = title.substring(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(' ');
  
  // If there's a space, cut there; otherwise just truncate
  return lastSpace > 0 ? trimmed.substring(0, lastSpace) : trimmed;
}

/**
 * Remove Amazon/competitor references from text
 */
function sanitizeContent(text) {
  if (!text) return '';
  
  // Remove Amazon-specific references
  const patterns = [
    /\bAmazon\b/gi,
    /\bPrime\b/gi,
    /\bFBA\b/gi,
    /\bFulfilled by Amazon\b/gi,
    /\bAmazon's Choice\b/gi,
    /\bBest Seller\b/gi,
    /\bA\+\s*Content\b/gi,
    /\bAmazon\.com\b/gi
  ];
  
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, '');
  }
  
  // Clean up extra whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Generate optimized eBay listing content using Claude AI
 */
async function generateListingContent(productData) {
  const {
    title: originalTitle = '',
    description: originalDescription = '',
    features = [],
    brand = '',
    model = '',
    color = '',
    size = '',
    category = ''
  } = productData;

  // Build context for AI
  const productContext = {
    originalTitle: sanitizeContent(originalTitle),
    brand,
    model,
    color,
    size,
    category,
    features: features.map(f => sanitizeContent(f)).filter(Boolean),
    hasDescription: !!originalDescription
  };

  const prompt = `You are an eBay listing optimization expert. Generate an optimized title and description for this product.

PRODUCT DATA:
- Original Title: ${productContext.originalTitle}
- Brand: ${productContext.brand || 'Not specified'}
- Model: ${productContext.model || 'Not specified'}
- Color: ${productContext.color || 'Not specified'}
- Size: ${productContext.size || 'Not specified'}
- Category: ${productContext.category || 'General'}
- Features: ${productContext.features.length > 0 ? productContext.features.join('; ') : 'None provided'}

REQUIREMENTS FOR TITLE:
1. MUST be 75 characters or less (leave buffer for safety)
2. Include brand name first if available
3. Include model number/name if available
4. Include key attributes (color, size) if they fit
5. Use common search terms buyers would use
6. NO special characters except hyphens and commas
7. NO words like "Amazon", "Prime", "Best Seller"

REQUIREMENTS FOR DESCRIPTION:
1. Valid HTML format
2. Start with <h3>Product Description</h3>
3. List features as <ul><li> bullet points
4. Be concise but informative
5. NO mentions of Amazon, Prime, or competitor platforms
6. Professional tone suitable for eBay

Respond in this exact JSON format:
{
  "title": "Your optimized title here",
  "description": "<h3>Product Description</h3><p>Brief intro</p><ul><li>Feature 1</li><li>Feature 2</li></ul>"
}

Only respond with the JSON, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const content = response.content[0].text;
    
    // Parse JSON response
    let parsed;
    try {
      // Try to extract JSON if wrapped in markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid AI response format');
    }

    // Apply safety measures
    const safeTitle = safeTrimTitle(sanitizeContent(parsed.title));
    const safeDescription = sanitizeContent(parsed.description);

    return {
      title: safeTitle,
      description: safeDescription,
      originalTitleLength: originalTitle.length,
      generatedTitleLength: safeTitle.length,
      aiModel: 'claude-3-haiku-20240307'
    };

  } catch (error) {
    console.error('AI generation error:', error);
    
    // Fallback: use simplified version of original data
    return generateFallbackContent(productContext);
  }
}

/**
 * Fallback content generation if AI fails
 */
function generateFallbackContent(productContext) {
  // Build title from available data
  const titleParts = [];
  
  if (productContext.brand) titleParts.push(productContext.brand);
  if (productContext.model) titleParts.push(productContext.model);
  if (productContext.color) titleParts.push(productContext.color);
  if (productContext.size) titleParts.push(productContext.size);
  
  // If we have parts, join them; otherwise use sanitized original
  let title = titleParts.length > 0 
    ? titleParts.join(' ') 
    : productContext.originalTitle;
  
  title = safeTrimTitle(title);

  // Build description
  let description = '<h3>Product Description</h3>';
  
  if (productContext.features.length > 0) {
    description += '<ul>';
    productContext.features.slice(0, 10).forEach(feature => {
      description += `<li>${feature}</li>`;
    });
    description += '</ul>';
  } else {
    description += '<p>Quality product. Please see photos for details.</p>';
  }

  return {
    title,
    description,
    originalTitleLength: productContext.originalTitle.length,
    generatedTitleLength: title.length,
    aiModel: 'fallback'
  };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const productData = JSON.parse(event.body || '{}');

    if (!productData.title && !productData.features?.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Product title or features required' })
      };
    }

    const startTime = Date.now();
    const result = await generateListingContent(productData);
    const elapsed = Date.now() - startTime;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...result,
        responseTimeMs: elapsed
      })
    };

  } catch (error) {
    console.error('Error generating listing content:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Export for direct use
module.exports.generateListingContent = generateListingContent;
module.exports.safeTrimTitle = safeTrimTitle;
module.exports.sanitizeContent = sanitizeContent;
