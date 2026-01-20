/**
 * CRM Lookups Edge Function
 * 
 * Manage user-customizable lookup values (statuses, collaboration types, 
 * contact sources, marketplaces)
 * 
 * Endpoints:
 * - GET /crm-lookups?type=statuses - Get all statuses (system + user's)
 * - POST /crm-lookups?type=statuses&action=create - Create custom status
 * - POST /crm-lookups?type=statuses&action=delete&id=<id> - Delete custom status
 * 
 * Types: statuses, collaboration_types, contact_sources, marketplaces
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid lookup types
const LOOKUP_TABLES: Record<string, string> = {
  'statuses': 'crm_statuses',
  'collaboration_types': 'crm_collaboration_types',
  'contact_sources': 'crm_contact_sources',
  'marketplaces': 'crm_marketplaces'
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

// Auth helper
async function getUser(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) return null
  return user
}

// ==================== GET LOOKUPS ====================
async function getLookups(
  supabase: SupabaseClient,
  userId: string,
  type: string
) {
  const tableName = LOOKUP_TABLES[type]
  if (!tableName) {
    throw new Error(`Invalid lookup type: ${type}`)
  }
  
  console.log(`📋 Getting ${type} for user ${userId}`)
  
  // Get system defaults (user_id IS NULL) + user's custom values
  let query = supabase
    .from(tableName)
    .select('*')
    .or(`user_id.is.null,user_id.eq.${userId}`)
  
  // Add ordering
  if (type === 'statuses') {
    query = query.order('sort_order', { ascending: true })
  } else {
    query = query.order('name', { ascending: true })
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error(`❌ Error fetching ${type}:`, error)
    throw error
  }
  
  // Mark which ones are user-created (deletable)
  const items = (data || []).map(item => ({
    ...item,
    is_system: item.user_id === null,
    is_deletable: item.user_id !== null
  }))
  
  console.log(`✅ Found ${items.length} ${type}`)
  return { [type]: items }
}

// ==================== CREATE LOOKUP ====================
interface CreateLookupInput {
  name: string
  color?: string
  sort_order?: number
  auto_set_on_delivery?: boolean
  has_quick_list?: boolean
}

async function createLookup(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  input: CreateLookupInput
) {
  const tableName = LOOKUP_TABLES[type]
  if (!tableName) {
    throw new Error(`Invalid lookup type: ${type}`)
  }
  
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Name is required')
  }
  
  console.log(`➕ Creating ${type}: ${input.name}`)
  
  // Build record based on type
  const record: Record<string, unknown> = {
    user_id: userId,
    name: input.name.trim()
  }
  
  // Type-specific fields
  if (type === 'statuses') {
    record.color = input.color || '#6B7280'
    record.sort_order = input.sort_order || 100
    record.auto_set_on_delivery = input.auto_set_on_delivery || false
  } else if (type === 'marketplaces') {
    record.has_quick_list = input.has_quick_list || false
  }
  
  const { data, error } = await supabase
    .from(tableName)
    .insert(record)
    .select()
    .single()
  
  if (error) {
    if (error.code === '23505') { // Unique violation
      throw new Error(`${input.name} already exists`)
    }
    console.error(`❌ Error creating ${type}:`, error)
    throw error
  }
  
  console.log(`✅ Created ${type}: ${data.id}`)
  return { item: { ...data, is_system: false, is_deletable: true } }
}

// ==================== DELETE LOOKUP ====================
async function deleteLookup(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  id: string
) {
  const tableName = LOOKUP_TABLES[type]
  if (!tableName) {
    throw new Error(`Invalid lookup type: ${type}`)
  }
  
  console.log(`🗑️ Deleting ${type}: ${id}`)
  
  // Check if it exists and is user-owned
  const { data: existing, error: checkError } = await supabase
    .from(tableName)
    .select('id, user_id, name')
    .eq('id', id)
    .single()
  
  if (checkError || !existing) {
    return { deleted: false, reason: 'not_found' }
  }
  
  if (existing.user_id === null) {
    return { deleted: false, reason: 'cannot_delete_system' }
  }
  
  if (existing.user_id !== userId) {
    return { deleted: false, reason: 'not_owner' }
  }
  
  // Delete
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error(`❌ Error deleting ${type}:`, error)
    throw error
  }
  
  console.log(`✅ Deleted ${type}: ${existing.name}`)
  return { deleted: true }
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
    
    // Auth check
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
    const user = await getUser(req, supabaseAuth)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }
    
    console.log(`👤 Authenticated: ${user.email}`)
    
    // Service client for operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Parse params
    const url = new URL(req.url)
    const type = url.searchParams.get('type')
    const action = url.searchParams.get('action') || 'list'
    const id = url.searchParams.get('id')
    
    if (!type || !LOOKUP_TABLES[type]) {
      return errorResponse(`type parameter required. Valid types: ${Object.keys(LOOKUP_TABLES).join(', ')}`)
    }
    
    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        // Empty body OK for some actions
      }
    }
    
    console.log(`🎯 Type: ${type}, Action: ${action}`)
    
    switch (action) {
      case 'list': {
        const result = await getLookups(supabase, user.id, type)
        return jsonResponse(result)
      }
      
      case 'create': {
        if (req.method !== 'POST') return errorResponse('POST required')
        const result = await createLookup(supabase, user.id, type, body as CreateLookupInput)
        return jsonResponse(result, 201)
      }
      
      case 'delete': {
        if (req.method !== 'POST') return errorResponse('POST required')
        if (!id) return errorResponse('id parameter required')
        const result = await deleteLookup(supabase, user.id, type, id)
        if (!result.deleted) {
          if (result.reason === 'not_found') return errorResponse('Not found', 404)
          if (result.reason === 'cannot_delete_system') return errorResponse('Cannot delete system default', 403)
          if (result.reason === 'not_owner') return errorResponse('Cannot delete another user\'s item', 403)
        }
        return jsonResponse({ deleted: true })
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
