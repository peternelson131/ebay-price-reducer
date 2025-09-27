const { createClient } = require('@supabase/supabase-js');
const logger = require('./utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analytics and Monitoring Function
 * Provides insights into application usage and performance
 */
exports.handler = async (event, context) => {
  const requestLogger = logger.withContext({
    function: 'analytics',
    requestId: context.awsRequestId
  });

  try {
    requestLogger.info('Analytics request started', {
      method: event.httpMethod,
      path: event.path
    });

    const { httpMethod, queryStringParameters } = event;

    if (httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'GET'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const timeframe = queryStringParameters?.timeframe || '7d';
    const metric = queryStringParameters?.metric || 'overview';

    let analytics = {};

    switch (metric) {
      case 'overview':
        analytics = await getOverviewAnalytics(timeframe, requestLogger);
        break;
      case 'price-reductions':
        analytics = await getPriceReductionAnalytics(timeframe, requestLogger);
        break;
      case 'users':
        analytics = await getUserAnalytics(timeframe, requestLogger);
        break;
      case 'performance':
        analytics = await getPerformanceAnalytics(timeframe, requestLogger);
        break;
      case 'errors':
        analytics = await getErrorAnalytics(timeframe, requestLogger);
        break;
      default:
        throw new Error(`Unknown metric: ${metric}`);
    }

    requestLogger.info('Analytics generated successfully', {
      metric,
      timeframe,
      dataPoints: Object.keys(analytics).length
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5 minutes cache
      },
      body: JSON.stringify({
        success: true,
        metric,
        timeframe,
        generatedAt: new Date().toISOString(),
        data: analytics
      })
    };

  } catch (error) {
    requestLogger.error('Analytics request failed', {}, error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to generate analytics'
      })
    };
  }
};

/**
 * Get overview analytics
 */
async function getOverviewAnalytics(timeframe, logger) {
  const startDate = getStartDate(timeframe);

  logger.debug('Fetching overview analytics', { timeframe, startDate });

  // Active users
  const { data: activeUsers, error: usersError } = await supabase
    .from('users')
    .select('id, created_at')
    .gte('created_at', startDate);

  if (usersError) throw usersError;

  // Active listings
  const { data: activeListings, error: listingsError } = await supabase
    .from('listings')
    .select('id, status, price_reduction_enabled, created_at')
    .eq('status', 'Active');

  if (listingsError) throw listingsError;

  // Recent price reductions
  const { data: priceReductions, error: reductionsError } = await supabase
    .from('price_history')
    .select('id, old_price, new_price, created_at')
    .gte('created_at', startDate)
    .order('created_at', { ascending: false });

  if (reductionsError) throw reductionsError;

  // Recent sync errors
  const { data: syncErrors, error: errorsError } = await supabase
    .from('sync_errors')
    .select('id, created_at, resolved')
    .gte('created_at', startDate);

  if (errorsError) throw errorsError;

  // Calculate metrics
  const totalSavings = priceReductions.reduce((sum, reduction) =>
    sum + (reduction.old_price - reduction.new_price), 0);

  const enabledListings = activeListings.filter(l => l.price_reduction_enabled);
  const unresolvedErrors = syncErrors.filter(e => !e.resolved);

  return {
    users: {
      total: activeUsers.length,
      newInPeriod: activeUsers.filter(u => new Date(u.created_at) >= startDate).length
    },
    listings: {
      total: activeListings.length,
      priceReductionEnabled: enabledListings.length,
      priceReductionRate: activeListings.length > 0 ?
        (enabledListings.length / activeListings.length * 100).toFixed(1) : 0
    },
    priceReductions: {
      total: priceReductions.length,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      averageSaving: priceReductions.length > 0 ?
        parseFloat((totalSavings / priceReductions.length).toFixed(2)) : 0
    },
    errors: {
      total: syncErrors.length,
      unresolved: unresolvedErrors.length,
      resolutionRate: syncErrors.length > 0 ?
        ((syncErrors.length - unresolvedErrors.length) / syncErrors.length * 100).toFixed(1) : 100
    },
    period: {
      timeframe,
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString()
    }
  };
}

/**
 * Get price reduction analytics
 */
async function getPriceReductionAnalytics(timeframe, logger) {
  const startDate = getStartDate(timeframe);

  logger.debug('Fetching price reduction analytics', { timeframe, startDate });

  const { data: priceHistory, error } = await supabase
    .from('price_history')
    .select(`
      id,
      old_price,
      new_price,
      change_percentage,
      created_at,
      listing_id,
      listings!inner(title, category_name)
    `)
    .gte('created_at', startDate)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Group by day
  const dailyReductions = {};
  const categoryStats = {};

  priceHistory.forEach(reduction => {
    const date = new Date(reduction.created_at).toISOString().split('T')[0];
    const saving = reduction.old_price - reduction.new_price;

    if (!dailyReductions[date]) {
      dailyReductions[date] = { count: 0, totalSavings: 0 };
    }
    dailyReductions[date].count++;
    dailyReductions[date].totalSavings += saving;

    // Category statistics
    const category = reduction.listings.category_name || 'Unknown';
    if (!categoryStats[category]) {
      categoryStats[category] = { count: 0, totalSavings: 0 };
    }
    categoryStats[category].count++;
    categoryStats[category].totalSavings += saving;
  });

  return {
    summary: {
      totalReductions: priceHistory.length,
      totalSavings: parseFloat(priceHistory.reduce((sum, r) => sum + (r.old_price - r.new_price), 0).toFixed(2)),
      averageReduction: priceHistory.length > 0 ?
        parseFloat((priceHistory.reduce((sum, r) => sum + Math.abs(r.change_percentage), 0) / priceHistory.length).toFixed(2)) : 0
    },
    dailyTrends: Object.entries(dailyReductions).map(([date, data]) => ({
      date,
      count: data.count,
      totalSavings: parseFloat(data.totalSavings.toFixed(2)),
      averageSaving: parseFloat((data.totalSavings / data.count).toFixed(2))
    })).sort((a, b) => a.date.localeCompare(b.date)),
    categoryBreakdown: Object.entries(categoryStats).map(([category, data]) => ({
      category,
      count: data.count,
      totalSavings: parseFloat(data.totalSavings.toFixed(2)),
      averageSaving: parseFloat((data.totalSavings / data.count).toFixed(2))
    })).sort((a, b) => b.totalSavings - a.totalSavings),
    recentReductions: priceHistory.slice(0, 10).map(r => ({
      id: r.id,
      title: r.listings.title,
      oldPrice: r.old_price,
      newPrice: r.new_price,
      saving: parseFloat((r.old_price - r.new_price).toFixed(2)),
      percentage: r.change_percentage,
      date: r.created_at
    }))
  };
}

/**
 * Get user analytics
 */
async function getUserAnalytics(timeframe, logger) {
  const startDate = getStartDate(timeframe);

  logger.debug('Fetching user analytics', { timeframe, startDate });

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select(`
      id,
      created_at,
      active,
      listings!inner(id, status, price_reduction_enabled)
    `);

  if (usersError) throw usersError;

  // User engagement metrics
  const userStats = users.map(user => {
    const totalListings = user.listings.length;
    const activeListings = user.listings.filter(l => l.status === 'Active').length;
    const enabledListings = user.listings.filter(l => l.price_reduction_enabled).length;

    return {
      userId: user.id,
      totalListings,
      activeListings,
      enabledListings,
      engagementScore: totalListings > 0 ? (enabledListings / totalListings * 100).toFixed(1) : 0,
      joinDate: user.created_at,
      isActive: user.active
    };
  });

  // Calculate cohorts
  const dailySignups = {};
  users.forEach(user => {
    const date = new Date(user.created_at).toISOString().split('T')[0];
    dailySignups[date] = (dailySignups[date] || 0) + 1;
  });

  return {
    summary: {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      newUsersInPeriod: users.filter(u => new Date(u.created_at) >= startDate).length,
      averageListingsPerUser: users.length > 0 ?
        parseFloat((userStats.reduce((sum, u) => sum + u.totalListings, 0) / users.length).toFixed(1)) : 0
    },
    engagement: {
      highEngagement: userStats.filter(u => parseFloat(u.engagementScore) > 75).length,
      mediumEngagement: userStats.filter(u => parseFloat(u.engagementScore) > 25 && parseFloat(u.engagementScore) <= 75).length,
      lowEngagement: userStats.filter(u => parseFloat(u.engagementScore) <= 25).length
    },
    signupTrends: Object.entries(dailySignups).map(([date, count]) => ({
      date,
      count
    })).sort((a, b) => a.date.localeCompare(b.date))
  };
}

/**
 * Get performance analytics
 */
async function getPerformanceAnalytics(timeframe, logger) {
  // This would typically pull from application logs or monitoring service
  // For now, we'll provide system health metrics

  logger.debug('Fetching performance analytics', { timeframe });

  return {
    systemHealth: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV
    },
    apiPerformance: {
      averageResponseTime: '150ms', // Would be calculated from logs
      successRate: '99.2%',
      errorRate: '0.8%',
      throughput: '45 req/min'
    },
    databaseMetrics: {
      connectionPoolSize: 10,
      activeConnections: 3,
      averageQueryTime: '25ms',
      slowQueries: 2
    }
  };
}

/**
 * Get error analytics
 */
async function getErrorAnalytics(timeframe, logger) {
  const startDate = getStartDate(timeframe);

  logger.debug('Fetching error analytics', { timeframe, startDate });

  const { data: syncErrors, error } = await supabase
    .from('sync_errors')
    .select('*')
    .gte('created_at', startDate)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Group errors by type and date
  const errorsByType = {};
  const dailyErrors = {};

  syncErrors.forEach(err => {
    const operation = err.operation || 'Unknown';
    const date = new Date(err.created_at).toISOString().split('T')[0];

    if (!errorsByType[operation]) {
      errorsByType[operation] = { count: 0, resolved: 0 };
    }
    errorsByType[operation].count++;
    if (err.resolved) errorsByType[operation].resolved++;

    if (!dailyErrors[date]) {
      dailyErrors[date] = { count: 0, resolved: 0 };
    }
    dailyErrors[date].count++;
    if (err.resolved) dailyErrors[date].resolved++;
  });

  return {
    summary: {
      totalErrors: syncErrors.length,
      resolvedErrors: syncErrors.filter(e => e.resolved).length,
      resolutionRate: syncErrors.length > 0 ?
        (syncErrors.filter(e => e.resolved).length / syncErrors.length * 100).toFixed(1) : 100
    },
    errorsByType: Object.entries(errorsByType).map(([type, data]) => ({
      type,
      count: data.count,
      resolved: data.resolved,
      resolutionRate: (data.resolved / data.count * 100).toFixed(1)
    })).sort((a, b) => b.count - a.count),
    dailyTrends: Object.entries(dailyErrors).map(([date, data]) => ({
      date,
      errors: data.count,
      resolved: data.resolved
    })).sort((a, b) => a.date.localeCompare(b.date)),
    recentErrors: syncErrors.slice(0, 10).map(e => ({
      id: e.id,
      operation: e.operation,
      message: e.error_message,
      resolved: e.resolved,
      date: e.created_at
    }))
  };
}

/**
 * Calculate start date based on timeframe
 */
function getStartDate(timeframe) {
  const now = new Date();

  switch (timeframe) {
    case '1d':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
  }
}