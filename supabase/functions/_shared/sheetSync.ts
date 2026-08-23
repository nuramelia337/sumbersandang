type SupabaseClient = any;

function retryDelayMinutes(attempt: number): number {
  return Math.min(24 * 60, Math.max(5, 5 * (2 ** Math.min(attempt, 8))));
}

export async function syncOrderToSheets(supabase: SupabaseClient, orderId: string): Promise<{ skipped?: boolean }> {
  const webhookUrl = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL");
  if (!webhookUrl) return { skipped: true };
  const { data: outbox, error: outboxError } = await supabase.from("sheet_sync_outbox").select("id,order_id,status,attempts").eq("order_id", orderId).maybeSingle();
  if (outboxError) throw new Error(outboxError.message);
  if (!outbox || outbox.status === "succeeded") return { skipped: true };

  await supabase.from("sheet_sync_outbox").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", outbox.id).neq("status", "succeeded");
  try {
    const [orderResult, itemsResult] = await Promise.all([
      supabase.from("orders").select("id,order_number,invoice_number,customer_name,customer_phone,customer_address,customer_city,customer_province,shipping_method,shipping_cost,subtotal,discount_amount,total_amount,payment_method,payment_status,order_status,coupon_code,notes,created_at").eq("id", orderId).single(),
      supabase.from("order_items").select("id,item_type,product_id,package_id,product_code,product_name,quantity,unit_price,purchase_price,subtotal,package_items_snapshot,product:products(product_code,name,availability_status,storage_location,stock),package:business_packages(package_code,name,availability_status)").eq("order_id", orderId).order("created_at"),
    ]);
    if (orderResult.error || !orderResult.data) throw new Error(orderResult.error?.message || "Order not found");
    if (itemsResult.error) throw new Error(itemsResult.error.message);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Deno.env.get("GOOGLE_SHEETS_WEBHOOK_SECRET") ? { "X-Webhook-Secret": Deno.env.get("GOOGLE_SHEETS_WEBHOOK_SECRET")! } : {}),
      },
      body: JSON.stringify({
        event: "order.upsert",
        idempotency_key: orderId,
        webhook_secret: Deno.env.get("GOOGLE_SHEETS_WEBHOOK_SECRET") || undefined,
        order: orderResult.data,
        items: itemsResult.data || [],
      }),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Sheets webhook returned ${response.status}`);
    let acknowledgement: any;
    try { acknowledgement = JSON.parse(responseText); } catch { throw new Error('Sheets webhook returned an invalid response'); }
    if (acknowledgement?.success !== true) throw new Error(`Sheets webhook rejected payload: ${String(acknowledgement?.error || 'unknown error')}`);
    await supabase.from("sheet_sync_outbox").update({
      status: "succeeded", attempts: Number(outbox.attempts || 0) + 1, last_error: null,
      processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", outbox.id);
    return {};
  } catch (error) {
    const attempts = Number(outbox.attempts || 0) + 1;
    await supabase.from("sheet_sync_outbox").update({
      status: "failed", attempts,
      last_error: error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error",
      next_attempt_at: new Date(Date.now() + retryDelayMinutes(attempts) * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", outbox.id);
    throw error;
  }
}
