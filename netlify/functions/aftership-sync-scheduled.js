/**
 * AfterShip Sync - Scheduled Function
 * Runs every 4 hours to check tracking status updates
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const AFTERSHIP_API_URL = 'https://api.aftership.com/tracking/2024-10';

// Status mapping from AfterShip to our CRM
const STATUS_MAP = {
  'Pending': 'In Transit',
  'InfoReceived': 'In Transit',
  'InTransit': 'In Transit',
  'OutForDelivery': 'In Transit',
  'AttemptFail': 'In Transit',
  'AvailableForPickup': 'In Transit',
  'Delivered': 'Delivered',
  'Exception': 'In Transit',
  'Expired': 'In Transit'
};

exports.handler = async (event, context) => {
  console.log('AfterShip sync started at:', new Date().toISOString());
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'NOT SET');
  console.log('AFTERSHIP_API_KEY:', process.env.AFTERSHIP_API_KEY ? 'set' : 'NOT SET');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.AFTERSHIP_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing environment variables' })
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const AFTERSHIP_API_KEY = process.env.AFTERSHIP_API_KEY || 'asat_4b7e17c41aa44c4ba2ae410f82e7b347';

  try {
    // Get ALL trackings from AfterShip at once
    const aftershipResponse = await axios.get(
      `${AFTERSHIP_API_URL}/trackings`,
      {
        headers: {
          'as-api-key': AFTERSHIP_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const trackings = aftershipResponse.data?.data?.trackings || [];
    console.log(`Found ${trackings.length} trackings in AfterShip`);

    if (trackings.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No trackings in AfterShip', updated: 0 })
      };
    }

    // Create a map of tracking number -> tracking data
    const trackingMap = {};
    trackings.forEach(t => {
      trackingMap[t.tracking_number] = t;
    });

    // Get all products with tracking numbers
    const { data: products, error: fetchError } = await supabase
      .from('sourced_products')
      .select('id, tracking_number, user_id, status_id, tracking_status, carrier')
      .not('tracking_number', 'is', null);

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Database error' }) };
    }

    console.log(`Found ${products?.length || 0} products with tracking`);

    let updated = 0;
    let errors = 0;

    for (const product of products) {
      const tracking = trackingMap[product.tracking_number];
      
      if (!tracking) {
        console.log(`No AfterShip data for tracking: ${product.tracking_number}`);
        continue;
      }

      const newTag = tracking.tag;

      // Skip if status hasn't changed
      if (newTag === product.tracking_status) {
        continue;
      }

      console.log(`Product ${product.id}: ${product.tracking_status} -> ${newTag}`);

      // Determine if we should update CRM status
      const newStatusName = STATUS_MAP[newTag];
      let updates = {
        tracking_status: newTag,
        tracking_updated_at: new Date().toISOString(),
        carrier: tracking.slug,
        aftership_tracking_id: tracking.id
      };

      // Update CRM status if needed
      if (newStatusName) {
        // Find the status - prefer global status (user_id is null)
        let { data: statuses } = await supabase
          .from('crm_statuses')
          .select('id, user_id')
          .eq('name', newStatusName);

        if (statuses && statuses.length > 0) {
          // Prefer global status (user_id is null), otherwise use user's status
          const globalStatus = statuses.find(s => s.user_id === null);
          const userStatus = statuses.find(s => s.user_id === product.user_id);
          const statusToUse = globalStatus || userStatus || statuses[0];
          updates.status_id = statusToUse.id;
        }
      }

      // Update the product
      const { error: updateError } = await supabase
        .from('sourced_products')
        .update(updates)
        .eq('id', product.id);

      if (updateError) {
        console.error(`Error updating product ${product.id}:`, updateError);
        errors++;
      } else {
        updated++;
      }
    }

    console.log(`Sync complete: ${updated} updated, ${errors} errors`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Sync complete',
        checked: products?.length || 0,
        updated,
        errors
      })
    };

  } catch (error) {
    console.error('Sync error:', error.message);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Sync failed', details: error.message }) 
    };
  }
};
