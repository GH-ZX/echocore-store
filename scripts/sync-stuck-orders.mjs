import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const G2BULK_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/g2bulk`;

async function main() {
  console.log('Starting sync for stuck fulfilling orders...');
  
  // Find orders that are 'completed' (paid) but 'fulfilling' for more than 15 minutes
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, g2bulk_order_id, g2bulk_metadata, fulfillment_status, created_at, updated_at')
    .eq('status', 'completed')
    .eq('fulfillment_status', 'fulfilling')
    .lte('updated_at', fifteenMinsAgo);
    
  if (error) {
    console.error('Error fetching stuck orders:', error);
    process.exit(1);
  }
  
  console.log(`Found ${orders.length} stuck orders.`);
  
  for (const order of orders) {
    const g2bulkOrderId = order.g2bulk_order_id || order.g2bulk_metadata?.g2bulk_order_id || order.g2bulk_metadata?.g2bulkOrderId;
    
    if (!g2bulkOrderId) {
      console.log(`Order ${order.id} has no G2Bulk order ID. Skipping.`);
      continue;
    }
    
    console.log(`Triggering check for Order ${order.id} (G2Bulk ID: ${g2bulkOrderId})...`);
    
    try {
      const res = await fetch(G2BULK_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          action: 'syncOrder',
          orderId: order.id
        })
      });
      
      const data = await res.json();
      console.log(`Result for ${order.id}:`, data);
    } catch (err) {
      console.error(`Failed to sync order ${order.id}:`, err);
    }
  }
  
  console.log('Done.');
}

main();
