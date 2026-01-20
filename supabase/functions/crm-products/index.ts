/**
 * CRM Products Edge Function
 * 
 * Supabase Edge Function (Deno) for Product CRUD operations
 * 
 * Endpoints:
 * - GET /crm-products?action=list - List products with filters
 * - GET /crm-products?action=get&id=<id> - Get single product
 * - POST /crm-products?action=create - Create product
 * - POST /crm-products?action=update&id=<id> - Update product
 * - POST /crm-products?action=delete&id=<id> - Delete product
 * - POST /crm-products?action=add-owner&id=<id> - Add owner
 * - POST /crm-products?action=remove-owner&id=<id>&ownerId=<ownerId> - Remove owner
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Response helpers
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status)
}

// Auth helper - get user from request
async function getUser(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) return null
  return user
}

// ==================== LIST PRODUCTS ====================
async function listProducts(
  supabase: SupabaseClient,
  userId: string,
  params: URLSearchParams
) {
  const limit = parseInt(params.get('limit') || '50')
  const offset = parseInt(params.get('offset') || '0')
  const statusId = params.get('status_id')
  const search = params.get('search')
  const ownerId = params.get('owner_id')
  
  console.log(`📋 Listing products: limit=${limit}, offset=${offset}, status=${statusId}, search=${search}`)
  
  // Build query with related data (excluding direct auth.users join)
  let query = supabase
    .from('sourced_products')
    .select(`
      *,
      status:crm_statuses(id, name, color),
      collaboration_type:crm_collaboration_types(id, name),
      contact_source:crm_contact_sources(id, name),
      owners:product_owners(owner_id, is_primary)
    `, { count: 'exact' })
  
  // Filter by owner - either creator or in product_owners
  if (ownerId) {
    // Filter to products where this owner is assigned
    const { data: ownerProducts } = await supabase
      .from('product_owners')
      .select('product_id')
      .eq('owner_id', ownerId)
    
    const ownerProductIds = (ownerProducts || []).map(p => p.product_id)
    
    if (ownerProductIds.length > 0) {
      query = query.or(`user_id.eq.${ownerId},id.in.(${ownerProductIds.join(',')})`)
    } else {
      query = query.eq('user_id', ownerId)
    }
  }
  
  // Status filter
  if (statusId) {
    query = query.eq('status_id', statusId)
  }
  
  // Search filter (ASIN or title)
  if (search) {
    query = query.or(`asin.ilike.%${search}%,title.ilike.%${search}%`)
  }
  
  // Pagination & ordering
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  
  const { data: products, error, count } = await query
  
  if (error) {
    console.error('❌ List error:', error)
    throw error
  }
  
  // Fetch owner details from public users table if products have owners
  const enrichedProducts = await enrichProductsWithOwnerInfo(supabase, products || [])
  
  console.log(`✅ Found ${enrichedProducts.length} products (total: ${count})`)
  
  return {
    products: enrichedProducts,
    pagination: {
      total: count || 0,
      limit,
      offset,
      hasMore: (offset + limit) < (count || 0)
    }
  }
}

// Helper to enrich products with owner details from public users table
async function enrichProductsWithOwnerInfo(
  supabase: SupabaseClient,
  products: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  if (products.length === 0) return products
  
  // Collect all unique owner IDs
  const ownerIds = new Set<string>()
  for (const product of products) {
    const owners = product.owners as Array<{ owner_id: string }> || []
    for (const owner of owners) {
      ownerIds.add(owner.owner_id)
    }
  }
  
  if (ownerIds.size === 0) return products
  
  // Fetch user info from public users table
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email')
    .in('id', Array.from(ownerIds))
  
  if (error) {
    console.warn('⚠️ Could not fetch owner details:', error.message)
    return products
  }
  
  // Create lookup map
  const userMap = new Map((users || []).map(u => [u.id, u]))
  
  // Enrich products
  return products.map(product => {
    const owners = product.owners as Array<{ owner_id: string; is_primary: boolean }> || []
    return {
      ...product,
      owners: owners.map(o => ({
        ...o,
        email: userMap.get(o.owner_id)?.email || null
      }))
    }
  })
}

// ==================== GET SINGLE PRODUCT ====================
async function getProduct(
  supabase: SupabaseClient,
  productId: string
) {
  console.log(`📦 Getting product: ${productId}`)
  
  const { data: product, error } = await supabase
    .from('sourced_products')
    .select(`
      *,
      status:crm_statuses(id, name, color),
      collaboration_type:crm_collaboration_types(id, name),
      contact_source:crm_contact_sources(id, name),
      owners:product_owners(owner_id, is_primary)
    `)
    .eq('id', productId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null // Not found
    }
    console.error('❌ Get error:', error)
    throw error
  }
  
  // Enrich with owner details
  const enriched = await enrichProductsWithOwnerInfo(supabase, [product])
  
  console.log(`✅ Got product: ${enriched[0]?.asin}`)
  return enriched[0]
}

// ==================== CREATE PRODUCT ====================
interface CreateProductInput {
  asin: string
  title?: string
  image_url?: string
  keepa_graph_url?: string
  status_id?: string
  decision?: 'sell' | 'keep' | null
  collaboration_type_id?: string
  contact_source_id?: string
  requirements?: string
  commitment_date?: string
  target_marketplace_ids?: string[]
  tracking_number?: string
  carrier?: string
  initial_owner_id?: string  // Optional additional owner
}

async function createProduct(
  supabase: SupabaseClient,
  userId: string,
  input: CreateProductInput
) {
  console.log(`➕ Creating product: ${input.asin}`)
  
  // Validate ASIN
  if (!input.asin || input.asin.length !== 10) {
    throw new Error('Valid 10-character ASIN required')
  }
  
  const normalizedAsin = input.asin.toUpperCase()
  
  // Build product record
  const productData = {
    user_id: userId,
    asin: normalizedAsin,
    title: input.title,
    image_url: input.image_url,
    keepa_graph_url: input.keepa_graph_url,
    status_id: input.status_id,
    decision: input.decision,
    collaboration_type_id: input.collaboration_type_id,
    contact_source_id: input.contact_source_id,
    requirements: input.requirements,
    commitment_date: input.commitment_date,
    target_marketplace_ids: input.target_marketplace_ids || [],
    tracking_number: input.tracking_number,
    carrier: input.carrier,
  }
  
  // Insert product
  const { data: product, error } = await supabase
    .from('sourced_products')
    .insert(productData)
    .select(`
      *,
      status:crm_statuses(id, name, color)
    `)
    .single()
  
  if (error) {
    console.error('❌ Create error:', error)
    throw error
  }
  
  // Add creator as primary owner
  const { error: ownerError } = await supabase
    .from('product_owners')
    .insert({
      product_id: product.id,
      owner_id: userId,
      is_primary: true
    })
  
  if (ownerError) {
    console.error('⚠️ Failed to add creator as owner:', ownerError)
  }
  
  // Add additional owner if specified
  if (input.initial_owner_id && input.initial_owner_id !== userId) {
    const { error: additionalOwnerError } = await supabase
      .from('product_owners')
      .insert({
        product_id: product.id,
        owner_id: input.initial_owner_id,
        is_primary: false
      })
    
    if (additionalOwnerError) {
      console.error('⚠️ Failed to add additional owner:', additionalOwnerError)
    }
  }
  
  console.log(`✅ Created product: ${product.id}`)
  return product
}

// ==================== UPDATE PRODUCT ====================
interface UpdateProductInput {
  title?: string
  image_url?: string
  keepa_graph_url?: string
  status_id?: string
  decision?: 'sell' | 'keep' | null
  collaboration_type_id?: string
  contact_source_id?: string
  requirements?: string
  commitment_date?: string
  target_marketplace_ids?: string[]
  ebay_listing_id?: string
  tracking_number?: string
  carrier?: string
  shipping_status?: string
  shipping_eta?: string
  shipping_events?: unknown[]
  shipping_last_checked?: string
  aftership_tracking_id?: string
}

async function updateProduct(
  supabase: SupabaseClient,
  productId: string,
  input: UpdateProductInput
) {
  console.log(`✏️ Updating product: ${productId}`)
  
  // Add updated_at timestamp
  const updateData = {
    ...input,
    updated_at: new Date().toISOString()
  }
  
  const { data: product, error } = await supabase
    .from('sourced_products')
    .update(updateData)
    .eq('id', productId)
    .select(`
      *,
      status:crm_statuses(id, name, color),
      collaboration_type:crm_collaboration_types(id, name),
      contact_source:crm_contact_sources(id, name)
    `)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null // Not found
    }
    console.error('❌ Update error:', error)
    throw error
  }
  
  console.log(`✅ Updated product: ${product.asin}`)
  return product
}

// ==================== DELETE PRODUCT ====================
async function deleteProduct(
  supabase: SupabaseClient,
  productId: string,
  userId: string
) {
  console.log(`🗑️ Deleting product: ${productId}`)
  
  // Only allow deletion by the creator (user_id)
  const { data: product, error: checkError } = await supabase
    .from('sourced_products')
    .select('id, user_id')
    .eq('id', productId)
    .single()
  
  if (checkError || !product) {
    return { deleted: false, reason: 'not_found' }
  }
  
  if (product.user_id !== userId) {
    return { deleted: false, reason: 'not_owner' }
  }
  
  // Delete (cascade will handle product_owners)
  const { error } = await supabase
    .from('sourced_products')
    .delete()
    .eq('id', productId)
  
  if (error) {
    console.error('❌ Delete error:', error)
    throw error
  }
  
  console.log(`✅ Deleted product: ${productId}`)
  return { deleted: true }
}

// ==================== ADD OWNER ====================
async function addOwner(
  supabase: SupabaseClient,
  productId: string,
  ownerId: string,
  isPrimary = false
) {
  console.log(`👤 Adding owner ${ownerId} to product ${productId}`)
  
  // Check product exists
  const { data: product, error: checkError } = await supabase
    .from('sourced_products')
    .select('id')
    .eq('id', productId)
    .single()
  
  if (checkError || !product) {
    return { added: false, reason: 'product_not_found' }
  }
  
  // Check if already an owner
  const { data: existing } = await supabase
    .from('product_owners')
    .select('product_id')
    .eq('product_id', productId)
    .eq('owner_id', ownerId)
    .single()
  
  if (existing) {
    return { added: false, reason: 'already_owner' }
  }
  
  // Add owner
  const { error } = await supabase
    .from('product_owners')
    .insert({
      product_id: productId,
      owner_id: ownerId,
      is_primary: isPrimary
    })
  
  if (error) {
    console.error('❌ Add owner error:', error)
    throw error
  }
  
  console.log(`✅ Added owner: ${ownerId}`)
  return { added: true }
}

// ==================== REMOVE OWNER ====================
async function removeOwner(
  supabase: SupabaseClient,
  productId: string,
  ownerId: string
) {
  console.log(`👤 Removing owner ${ownerId} from product ${productId}`)
  
  // Check if they're the only owner
  const { data: owners } = await supabase
    .from('product_owners')
    .select('owner_id')
    .eq('product_id', productId)
  
  if (!owners || owners.length <= 1) {
    return { removed: false, reason: 'cannot_remove_last_owner' }
  }
  
  const { error, count } = await supabase
    .from('product_owners')
    .delete()
    .eq('product_id', productId)
    .eq('owner_id', ownerId)
  
  if (error) {
    console.error('❌ Remove owner error:', error)
    throw error
  }
  
  if (count === 0) {
    return { removed: false, reason: 'not_an_owner' }
  }
  
  console.log(`✅ Removed owner: ${ownerId}`)
  return { removed: true }
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Create client for auth check (uses anon key + user token)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
    
    // Authenticate user
    const user = await getUser(req, supabaseAuth)
    if (!user) {
      return errorResponse('Unauthorized - valid auth token required', 401)
    }
    
    console.log(`👤 Authenticated: ${user.email}`)
    
    // Create service role client for operations (bypasses RLS for reads, respects for writes)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse URL params and body
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list'
    const id = url.searchParams.get('id')
    const ownerId = url.searchParams.get('ownerId')
    
    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        // Empty body is OK for some actions
      }
    }
    
    console.log(`🎯 Action: ${action}, ID: ${id}, Method: ${req.method}`)
    
    // Route to handlers
    switch (action) {
      case 'list': {
        const result = await listProducts(supabase, user.id, url.searchParams)
        return jsonResponse(result)
      }
      
      case 'get': {
        if (!id) return errorResponse('id parameter required')
        const product = await getProduct(supabase, id)
        if (!product) return errorResponse('Product not found', 404)
        return jsonResponse({ product })
      }
      
      case 'create': {
        if (req.method !== 'POST') return errorResponse('POST required for create')
        const product = await createProduct(supabase, user.id, body as CreateProductInput)
        return jsonResponse({ product }, 201)
      }
      
      case 'update': {
        if (req.method !== 'POST') return errorResponse('POST required for update')
        if (!id) return errorResponse('id parameter required')
        const product = await updateProduct(supabase, id, body as UpdateProductInput)
        if (!product) return errorResponse('Product not found', 404)
        return jsonResponse({ product })
      }
      
      case 'delete': {
        if (req.method !== 'POST') return errorResponse('POST required for delete')
        if (!id) return errorResponse('id parameter required')
        const result = await deleteProduct(supabase, id, user.id)
        if (!result.deleted) {
          if (result.reason === 'not_found') return errorResponse('Product not found', 404)
          if (result.reason === 'not_owner') return errorResponse('Only product creator can delete', 403)
        }
        return jsonResponse({ deleted: true })
      }
      
      case 'add-owner': {
        if (req.method !== 'POST') return errorResponse('POST required for add-owner')
        if (!id) return errorResponse('id parameter required')
        const newOwnerId = body.owner_id as string
        if (!newOwnerId) return errorResponse('owner_id required in body')
        const isPrimary = body.is_primary as boolean || false
        const result = await addOwner(supabase, id, newOwnerId, isPrimary)
        if (!result.added) {
          if (result.reason === 'product_not_found') return errorResponse('Product not found', 404)
          if (result.reason === 'already_owner') return errorResponse('User is already an owner', 400)
        }
        return jsonResponse({ added: true })
      }
      
      case 'remove-owner': {
        if (req.method !== 'POST') return errorResponse('POST required for remove-owner')
        if (!id) return errorResponse('id parameter required')
        const removeOwnerId = ownerId || body.owner_id as string
        if (!removeOwnerId) return errorResponse('ownerId parameter or owner_id in body required')
        const result = await removeOwner(supabase, id, removeOwnerId)
        if (!result.removed) {
          if (result.reason === 'cannot_remove_last_owner') return errorResponse('Cannot remove last owner', 400)
          if (result.reason === 'not_an_owner') return errorResponse('User is not an owner of this product', 404)
        }
        return jsonResponse({ removed: true })
      }
      
      default:
        return errorResponse(`Unknown action: ${action}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Processing failed',
      500
    )
  }
})
