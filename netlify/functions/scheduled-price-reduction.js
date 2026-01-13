/**
 * Scheduled Price Reduction - F-BG001
 * Minimal implementation for debugging
 */

exports.handler = async (event, context) => {
  console.log('⏰ Scheduled function invoked');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      message: 'Scheduled function works!',
      timestamp: new Date().toISOString()
    })
  };
};
