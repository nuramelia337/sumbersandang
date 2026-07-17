import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SHEETS_WEBHOOK_URL = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { orderId } = await req.json();
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    // Extract Instagram from notes
    const igMatch = (order.notes || "").match(/IG: @?([^\s|]+)/);
    const instagram = igMatch ? igMatch[1] : "";

    // Extract pickup date/time from notes
    const pickupMatch = (order.notes || "").match(/Ambil: (\S+) (\S+)/);
    const pickupDate = pickupMatch ? pickupMatch[1] : "";
    const pickupTime = pickupMatch ? pickupMatch[2] : "";

    const { data: product } = await supabase
      .from("products")
      .select("stock")
      .eq("id", items?.[0]?.product_id)
      .maybeSingle();

    const paymentLabel = order.payment_method === "transfer" ? "Transfer Bank" : "Cash";

    // Send to multiple sheets
    const sheets = ["Barang Keluar", "Dashboard Global", "Dashboard Terfilter", "Stok Barang", "Invoice", "Purchase Order"];

    for (const sheet of sheets) {
      const rowData = {
        sheet,
        date: new Date().toISOString(),
        invoiceNumber: order.invoice_number,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        whatsapp: order.customer_phone,
        instagram: instagram,
        productCode: items?.[0]?.product_code || "",
        productName: items?.[0]?.product_name || "",
        quantity: items?.[0]?.quantity || 0,
        sellingPrice: items?.[0]?.unit_price || 0,
        purchasePrice: items?.[0]?.purchase_price || 0,
        profit: (items?.[0]?.unit_price || 0) - (items?.[0]?.purchase_price || 0),
        paymentMethod: paymentLabel,
        shippingMethod: order.shipping_method === "pickup" ? "Ambil di Toko" : "Dikirim",
        pickupDate: pickupDate,
        pickupTime: pickupTime,
        status: order.order_status,
        admin: "System",
        remainingStock: product?.stock ?? 0,
      };

      if (SHEETS_WEBHOOK_URL) {
        await fetch(SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rowData),
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ success: true, instagram, pickupDate, pickupTime }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
