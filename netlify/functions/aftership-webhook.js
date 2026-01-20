/**
 * AfterShip Webhook Handler
 * Receives tracking updates and updates product status accordingly
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Status mapping from AfterShip to our CRM
const STATUS_MAP = {
  'Pending': null, // Keep current status
  'InfoReceived': null, // Keep current status
  'InTransit': 'In Transit',
  'OutForDelivery': 'In Transit', 
  'AttemptFail': null, // Keep current status
  'AvailableForPickup': null, // Keep current status
  'Delivered': 'Delivered',
  'Exception': null, // Keep but flag
  'Expired': null // Keep but flag
};

exports.handler = async (event, context) => {
  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Verify webhook signature if secret is provided
    const webhookSecret = process.env.AFTERSHIP_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = event.headers['aftership-hmac-sha256'];
      const body = event.body;
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('base64');
      
      if (signature !== hmac) {
        console.error('Invalid webhook signature');
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid signature' })
        };
      }
    }

    // Parse webhook payload
    const data = JSON.parse(event.body);
    console.log('AfterShip webhook received:', data.msg?.tag || 'unknown event');

    // Extract tracking info
    const tracking = data.msg;
    if (!tracking) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No tracking data in webhook' })
      };
    }

    const {
      tracking_number,
      tag, // Status like "Delivered", "InTransit", etc.
      slug, // Carrier slug
      expected_delivery,
      shipment_delivery_date,
      origin_info,
      destination_info
    } = tracking;

    // Find products with this tracking number
    const { data: products, error: fetchError } = await supabase
      .from('sourced_products')
      .select('id, status_id, user_id')
      .eq('tracking_number', tracking_number);

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database error' })
      };
    }

    if (!products || products.length === 0) {
      console.log('No products found with tracking number:', tracking_number);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No products to update' })
      };
    }

    // Determine new status
    const newStatusName = STATUS_MAP[tag];
    
    if (newStatusName) {
      // Get or create the status
      let { data: status, error: statusError } = await supabase
        .from('crm_statuses')
        .select('id')
        .eq('name', newStatusName)
        .single();

      if (statusError || !status) {
        // Create the status if it doesn't exist
        const { data: newStatus, error: createError } = await supabase
          .from('crm_statuses')
          .insert({
            name: newStatusName,
            color: newStatusName === 'Delivered' ? '#10B981' : '#F59E0B',
            user_id: products[0].user_id,
            sort_order: 999
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating status:', createError);
        } else {
          status = newStatus;
        }
      }

      // Update all products with this tracking number
      if (status) {
        for (const product of products) {
          const updates = {
            status_id: status.id,
            tracking_status: tag,
            tracking_updated_at: new Date().toISOString(),
            carrier: slug,
            aftership_tracking_id: tracking.id || tracking._id
          };

          // Add delivery date if available
          if (shipment_delivery_date || expected_delivery) {
            updates.delivery_date = shipment_delivery_date || expected_delivery;
          }

          const { error: updateError } = await supabase
            .from('sourced_products')
            .update(updates)
            .eq('id', product.id);

          if (updateError) {
            console.error('Error updating product:', updateError);
          } else {
            console.log(`Updated product ${product.id} to status ${newStatusName}`);
          }
        }
      }
    } else {
      // Just update tracking info without changing status
      for (const product of products) {
        const { error: updateError } = await supabase
          .from('sourced_products')
          .update({
            tracking_status: tag,
            tracking_updated_at: new Date().toISOString(),
            carrier: slug,
            aftership_tracking_id: tracking.id || tracking._id
          })
          .eq('id', product.id);

        if (updateError) {
          console.error('Error updating tracking info:', updateError);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Webhook processed successfully',
        productsUpdated: products.length
      })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};