const { Handler } = require('@netlify/functions');
const EbayClient = require('./utils/ebay-client');

const handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Only GET requests are supported'
      })
    };
  }

  try {
    // Initialize eBay client
    const ebayClient = new EbayClient();

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const pageNumber = parseInt(queryParams.page) || 1;
    const entriesPerPage = parseInt(queryParams.limit) || 100;

    // Get seller's active listings
    const response = await ebayClient.getMyeBaySelling(pageNumber, entriesPerPage);

    // Extract useful listing data
    const listings = [];
    if (response && response.ActiveList && response.ActiveList.ItemArray && response.ActiveList.ItemArray.Item) {
      const items = Array.isArray(response.ActiveList.ItemArray.Item)
        ? response.ActiveList.ItemArray.Item
        : [response.ActiveList.ItemArray.Item];

      items.forEach(item => {
        listings.push({
          itemId: item.ItemID,
          title: item.Title,
          currentPrice: item.SellingStatus ? item.SellingStatus.CurrentPrice : null,
          quantity: item.Quantity,
          listingType: item.ListingType,
          endTime: item.EndTime,
          watchCount: item.WatchCount || 0,
          hitCount: item.HitCount || 0,
          timeLeft: item.TimeLeft,
          categoryId: item.PrimaryCategory ? item.PrimaryCategory.CategoryID : null,
          categoryName: item.PrimaryCategory ? item.PrimaryCategory.CategoryName : null,
          listingUrl: item.ListingDetails ? item.ListingDetails.ViewItemURL : null
        });
      });
    }

    // Get pagination info
    const paginationResult = response && response.ActiveList && response.ActiveList.PaginationResult;
    const pagination = {
      totalPages: paginationResult ? parseInt(paginationResult.TotalNumberOfPages) : 1,
      totalEntries: paginationResult ? parseInt(paginationResult.TotalNumberOfEntries) : listings.length,
      currentPage: pageNumber,
      entriesPerPage: entriesPerPage
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        listings: listings,
        pagination: pagination,
        environment: ebayClient.isSandbox() ? 'sandbox' : 'production',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to fetch eBay listings:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to fetch eBay listings',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };