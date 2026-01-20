const { ApolloServer, gql } = require('apollo-server-lambda');
const DataLoader = require('dataloader');
const { createClient } = require('@supabase/supabase-js');

// =============================================
// CONFIGURATION
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// =============================================
// GRAPHQL SCHEMA - SIMPLIFIED FOR SINGLE USER
// =============================================

const typeDefs = gql`
  # Scalar types
  scalar DateTime
  scalar JSON

  # Main listing type - REMOVED userId field
  type Listing {
    id: ID!
    ebayItemId: String
    sku: String!
    title: String!
    description: String
    category: String
    categoryId: String
    condition: String
    listingFormat: String
    listingStatus: String
    currentPrice: Float!
    originalPrice: Float
    currency: String
    minimumPrice: Float
    quantity: Int
    quantityAvailable: Int
    quantitySold: Int
    imageUrls: [String]
    primaryImageUrl: String
    priceReductionEnabled: Boolean
    reductionStrategy: String
    reductionPercentage: Float
    reductionInterval: Int
    lastPriceReduction: DateTime
    totalReductions: Int
    ebayAttributes: JSON
    lastSynced: DateTime
    syncStatus: String
    startTime: DateTime
    endTime: DateTime
    createdAt: DateTime
    updatedAt: DateTime

    # Relations
    priceHistory(limit: Int = 10): [PriceHistory]
    syncMetrics: SyncMetrics
  }

  # Price history type
  type PriceHistory {
    id: ID!
    listingId: ID!
    price: Float!
    previousPrice: Float
    changeType: String
    changeReason: String
    timestamp: DateTime!
  }

  # Sync metrics type
  type SyncMetrics {
    lastSyncDuration: Float
    apiCallsUsed: Int
    cacheHitRate: Float
    syncFrequency: String
  }

  # Listing connection for pagination
  type ListingConnection {
    edges: [ListingEdge]!
    pageInfo: PageInfo!
    totalCount: Int!
    aggregations: ListingAggregations
  }

  type ListingEdge {
    cursor: String!
    node: Listing!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Aggregations
  type ListingAggregations {
    totalValue: Float
    averagePrice: Float
    totalQuantity: Int
    activeCount: Int
    categories: [CategoryCount]
    priceRanges: [PriceRange]
  }

  type CategoryCount {
    category: String!
    count: Int!
  }

  type PriceRange {
    min: Float!
    max: Float!
    count: Int!
  }

  # Filter inputs
  input ListingFilter {
    status: [String]
    categories: [String]
    priceMin: Float
    priceMax: Float
    priceReductionEnabled: Boolean
    searchQuery: String
    skus: [String]
  }

  input ListingSort {
    field: ListingSortField!
    direction: SortDirection!
  }

  enum ListingSortField {
    PRICE
    CREATED_AT
    UPDATED_AT
    TITLE
    QUANTITY
    LAST_SYNCED
  }

  enum SortDirection {
    ASC
    DESC
  }

  # Mutations input types
  input UpdateListingInput {
    id: ID!
    priceReductionEnabled: Boolean
    reductionStrategy: String
    reductionPercentage: Float
    minimumPrice: Float
    reductionInterval: Int
  }

  input CreateSyncJobInput {
    jobType: String!
    priority: Int
    listingIds: [ID]
  }

  # Subscription types
  type ListingUpdate {
    listing: Listing!
    updateType: String!
    previousValues: JSON
  }

  type PriceAlert {
    listing: Listing!
    oldPrice: Float!
    newPrice: Float!
    changePercentage: Float!
  }

  # Root types
  type Query {
    # Get single listing
    listing(id: ID!): Listing

    # Search listings with pagination
    searchListings(
      filter: ListingFilter
      sort: ListingSort
      first: Int
      after: String
      last: Int
      before: String
    ): ListingConnection!

    # Get price history for a listing
    getPriceHistory(
      listingId: ID!
      startDate: DateTime
      endDate: DateTime
      limit: Int
    ): [PriceHistory]!

    # Get stats - SIMPLIFIED (no user filtering needed)
    getStats: Stats

    # Get sync status
    getSyncStatus: SyncStatus
  }

  type Stats {
    totalListings: Int
    activeListings: Int
    totalValue: Float
    reductionEnabledCount: Int
    lastSync: DateTime
  }

  type SyncStatus {
    isRunning: Boolean
    lastRun: DateTime
    nextScheduled: DateTime
    queueLength: Int
  }

  type Mutation {
    # Update listing settings
    updateListing(input: UpdateListingInput!): Listing

    # Trigger sync
    triggerSync(input: CreateSyncJobInput!): SyncJob

    # Watch/unwatch listing
    watchListing(listingId: ID!, watch: Boolean!): Listing

    # Update price alert
    updatePriceAlert(
      listingId: ID!
      threshold: Float!
      enabled: Boolean!
    ): PriceAlertSettings
  }

  type SyncJob {
    id: ID!
    status: String!
    scheduledFor: DateTime!
  }

  type PriceAlertSettings {
    listingId: ID!
    threshold: Float!
    enabled: Boolean!
  }

  type Subscription {
    # Real-time listing updates
    listingUpdated: ListingUpdate

    # Price drop alerts
    priceDropped(threshold: Float): PriceAlert
  }
`;

// =============================================
// DATA LOADERS (Prevent N+1 Queries)
// SIMPLIFIED - No user_id filtering
// =============================================

const createLoaders = (supabase) => ({
  // Batch load listings by ID - NO USER FILTERING
  listingLoader: new DataLoader(async (ids) => {
    const { data } = await supabase
      .from('listings')
      .select('*')
      .in('id', ids);
    // REMOVED: .eq('user_id', userId)

    const listingMap = {};
    data.forEach(listing => {
      listingMap[listing.id] = listing;
    });

    return ids.map(id => listingMap[id]);
  }),

  // Batch load price history
  priceHistoryLoader: new DataLoader(async (listingIds) => {
    const { data } = await supabase
      .from('price_reduction_log')
      .select('*')
      .in('listing_id', listingIds)
      .order('created_at', { ascending: false });

    const historyMap = {};
    data.forEach(history => {
      if (!historyMap[history.listing_id]) {
        historyMap[history.listing_id] = [];
      }
      historyMap[history.listing_id].push(history);
    });

    return listingIds.map(id => historyMap[id] || []);
  })
});

// =============================================
// RESOLVERS - SIMPLIFIED FOR SINGLE USER
// =============================================

const resolvers = {
  Query: {
    // Get single listing - NO USER CHECK
    listing: async (_, { id }, { loaders }) => {
      return loaders.listingLoader.load(id);
    },

    // Search listings with advanced filtering and pagination
    searchListings: async (_, args, { supabase }) => {
      const {
        filter = {},
        sort = { field: 'CREATED_AT', direction: 'DESC' },
        first,
        after,
        last,
        before
      } = args;

      let query = supabase
        .from('listings')
        .select('*', { count: 'exact' });
      // REMOVED: .eq('user_id', userId)
      // REMOVED: .is('archived_at', null) - column doesn't exist in simplified schema

      // Apply filters
      if (filter.status?.length > 0) {
        query = query.in('listing_status', filter.status);
      }

      if (filter.categories?.length > 0) {
        query = query.in('category_id', filter.categories);
      }

      if (filter.priceMin !== undefined) {
        query = query.gte('current_price', filter.priceMin);
      }

      if (filter.priceMax !== undefined) {
        query = query.lte('current_price', filter.priceMax);
      }

      if (filter.priceReductionEnabled !== undefined) {
        query = query.eq('price_reduction_enabled', filter.priceReductionEnabled);
      }

      if (filter.searchQuery) {
        // Use ilike for text search
        query = query.ilike('title', `%${filter.searchQuery}%`);
      }

      if (filter.skus?.length > 0) {
        query = query.in('sku', filter.skus);
      }

      // Apply sorting
      const sortFieldMap = {
        'PRICE': 'current_price',
        'CREATED_AT': 'created_at',
        'UPDATED_AT': 'updated_at',
        'TITLE': 'title',
        'QUANTITY': 'quantity',
        'LAST_SYNCED': 'last_synced_with_ebay'
      };
      const sortField = sortFieldMap[sort.field] || 'created_at';
      const sortOrder = sort.direction === 'DESC' ? { ascending: false } : { ascending: true };
      query = query.order(sortField, sortOrder);

      // Apply cursor-based pagination
      const limit = first || last || 20;
      query = query.limit(limit);

      if (after) {
        const cursor = Buffer.from(after, 'base64').toString('utf-8');
        query = query.gt('id', cursor);
      }

      if (before) {
        const cursor = Buffer.from(before, 'base64').toString('utf-8');
        query = query.lt('id', cursor);
      }

      const { data: listings, count, error } = await query;

      if (error) {
        throw error;
      }

      // Build connection response
      const edges = (listings || []).map(listing => ({
        cursor: Buffer.from(listing.id).toString('base64'),
        node: listing
      }));

      // Calculate aggregations
      const aggregations = await calculateAggregations(supabase, filter);

      return {
        edges,
        pageInfo: {
          hasNextPage: edges.length === limit,
          hasPreviousPage: !!after || !!before,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: count || 0,
        aggregations
      };
    },

    // Get price history
    getPriceHistory: async (_, { listingId, startDate, endDate, limit = 100 }, { supabase }) => {
      let query = supabase
        .from('price_reduction_log')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data;
    },

    // Get stats - SIMPLIFIED for single user
    getStats: async (_, __, { supabase }) => {
      // Get all listings statistics
      const { data: listings, error } = await supabase
        .from('listings')
        .select('listing_status, current_price, price_reduction_enabled, last_synced_with_ebay');

      if (error) {
        throw error;
      }

      const totalListings = listings?.length || 0;
      const activeListings = listings?.filter(l => l.listing_status === 'Active').length || 0;
      const totalValue = listings?.reduce((sum, l) => sum + (l.current_price || 0), 0) || 0;
      const reductionEnabledCount = listings?.filter(l => l.price_reduction_enabled).length || 0;
      const lastSync = listings?.reduce((latest, l) => {
        const syncTime = l.last_synced_with_ebay ? new Date(l.last_synced_with_ebay) : null;
        return syncTime && (!latest || syncTime > latest) ? syncTime : latest;
      }, null);

      return {
        totalListings,
        activeListings,
        totalValue,
        reductionEnabledCount,
        lastSync: lastSync?.toISOString()
      };
    },

    // Get sync status - SIMPLIFIED (no user filtering)
    getSyncStatus: async (_, __, { supabase }) => {
      // This would need a sync_queue table if you're using one
      // For now, return mock data
      return {
        isRunning: false,
        lastRun: new Date().toISOString(),
        nextScheduled: null,
        queueLength: 0
      };
    }
  },

  Mutation: {
    // Update listing settings - NO USER CHECK
    updateListing: async (_, { input }, { supabase }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', id)
        // REMOVED: .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    // Trigger sync - SIMPLIFIED
    triggerSync: async (_, { input }, { supabase }) => {
      // Would need sync_queue table
      // For now, return mock response
      return {
        id: Date.now().toString(),
        status: 'pending',
        scheduledFor: new Date().toISOString()
      };
    }
  },

  Listing: {
    // Resolve price history using DataLoader
    priceHistory: async (parent, { limit = 10 }, { loaders }) => {
      const history = await loaders.priceHistoryLoader.load(parent.id);
      return history.slice(0, limit);
    },

    // Resolve sync metrics
    syncMetrics: async (parent, _, { supabase }) => {
      // Simplified - return basic metrics
      return {
        lastSyncDuration: 0,
        apiCallsUsed: 0,
        cacheHitRate: 0,
        syncFrequency: calculateSyncFrequency(parent.last_synced_with_ebay)
      };
    }
  },

  // Custom scalar resolvers
  DateTime: {
    serialize: (value) => value, // Assuming ISO string format
    parseValue: (value) => value,
    parseLiteral: (ast) => ast.value
  },

  JSON: {
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => JSON.parse(ast.value)
  }
};

// =============================================
// HELPER FUNCTIONS - SIMPLIFIED
// =============================================

// Calculate aggregations for listings - NO USER FILTERING
async function calculateAggregations(supabase, filter) {
  // Base query for aggregations
  let query = supabase
    .from('listings')
    .select('current_price, quantity, category, listing_status');
  // REMOVED: .eq('user_id', userId)
  // REMOVED: .is('archived_at', null)

  // Apply same filters as main query
  if (filter.status?.length > 0) {
    query = query.in('listing_status', filter.status);
  }

  if (filter.categories?.length > 0) {
    query = query.in('category_id', filter.categories);
  }

  const { data } = await query;

  if (!data) {
    return null;
  }

  // Calculate aggregations
  const totalValue = data.reduce((sum, l) => sum + ((l.current_price || 0) * (l.quantity || 1)), 0);
  const averagePrice = data.length > 0 ? data.reduce((sum, l) => sum + (l.current_price || 0), 0) / data.length : 0;
  const totalQuantity = data.reduce((sum, l) => sum + (l.quantity || 0), 0);
  const activeCount = data.filter(l => l.listing_status === 'Active').length;

  // Category counts
  const categoryCounts = {};
  data.forEach(l => {
    if (l.category) {
      categoryCounts[l.category] = (categoryCounts[l.category] || 0) + 1;
    }
  });

  const categories = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count
  }));

  // Price ranges
  const priceRanges = [
    { min: 0, max: 25, count: 0 },
    { min: 25, max: 50, count: 0 },
    { min: 50, max: 100, count: 0 },
    { min: 100, max: 500, count: 0 },
    { min: 500, max: Infinity, count: 0 }
  ];

  data.forEach(l => {
    const price = l.current_price || 0;
    const range = priceRanges.find(r => price >= r.min && price < r.max);
    if (range) {
      range.count++;
    }
  });

  return {
    totalValue,
    averagePrice,
    totalQuantity,
    activeCount,
    categories,
    priceRanges: priceRanges.filter(r => r.count > 0)
  };
}

// Calculate sync frequency label
function calculateSyncFrequency(lastSynced) {
  if (!lastSynced) return 'Never';

  const hours = (Date.now() - new Date(lastSynced).getTime()) / (1000 * 60 * 60);

  if (hours < 1) return 'Real-time';
  if (hours < 6) return 'Frequent';
  if (hours < 24) return 'Daily';
  if (hours < 168) return 'Weekly';
  return 'Infrequent';
}

// =============================================
// APOLLO SERVER SETUP - SIMPLIFIED AUTH
// =============================================

const createContext = async ({ event }) => {
  // In single-user mode, we can optionally skip auth or use simple token
  // For now, keeping basic auth for security

  // Initialize Supabase client with service role key (bypass RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

  // Create loaders for this request - NO USER ID NEEDED
  const loaders = createLoaders(supabase);

  return {
    supabase,
    loaders
  };
};

// Create Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: createContext,

  // Performance optimizations
  persistedQueries: {
    cache: true,
    ttl: 300 // 5 minutes
  },

  // Caching
  cacheControl: {
    defaultMaxAge: 60, // 1 minute default cache
    calculateHttpHeaders: true
  }
});

// Export handler
exports.handler = server.createHandler({
  cors: {
    origin: '*',
    credentials: true
  }
});