import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SHEETS_WEBHOOK_URL = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") || "";

function paymentLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    saldo: "Saldo",
    transfer: "Transfer Bank",
    qris: "QRIS",
    cod: "COD",
  };
  return labels[method] || method;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
      .select("*, product:products(product_code, name, availability_status, storage_location, stock), package:business_packages(package_code, name, availability_status)")
      .eq("order_id", orderId);

    const igMatch = (order.notes || "").match(/IG: @?([^\s|]+)/);
    const instagram = igMatch ? igMatch[1] : "";
    const pickupMatch = (order.notes || "").match(/Ambil: (\S+) (\S+)/);
    const pickupDate = pickupMatch ? pickupMatch[1] : "";
    const pickupTime = pickupMatch ? pickupMatch[2] : "";
    const sheets = ["Barang Keluar", "Dashboard Global", "Dashboard Terfilter", "Stok Barang", "Invoice", "Purchase Order"];

    let sentRows = 0;
    for (const item of items || []) {
      const product = item.product;
      const pkg = item.package;
      const profit = (Number(item.unit_price || 0) - Number(item.purchase_price || 0)) * Number(item.quantity || 0);

      for (const sheet of sheets) {
        const rowData = {
          sheet,
          date: new Date().toISOString(),
          invoiceNumber: order.invoice_number,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          whatsapp: order.customer_phone,
          instagram,
          itemType: item.item_type || "product",
          productCode: item.product_code || product?.product_code || pkg?.package_code || "",
          productName: item.product_name || product?.name || pkg?.name || "",
          quantity: item.quantity || 0,
          sellingPrice: item.unit_price || 0,
          purchasePrice: item.purchase_price || 0,
          subtotal: item.subtotal || 0,
          profit,
          paymentMethod: paymentLabel(order.payment_method),
          shippingMethod: order.shipping_method === "pickup" ? "Ambil di Toko" : "Dikirim",
          pickupDate,
          pickupTime,
          status: order.order_status,
          availabilityStatus: item.item_type === "package" ? pkg?.availability_status : product?.availability_status,
          storageLocation: product?.storage_location || "",
          admin: "System",
          remainingStock: product?.stock ?? 0,
          packageItems: item.package_items_snapshot || [],
        };

        if (SHEETS_WEBHOOK_URL) {
          await fetch(SHEETS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rowData),
          }).catch(() => {});
        }
        sentRows += 1;
      }
    }

    return new Response(JSON.stringify({ success: true, instagram, pickupDate, pickupTime, sentRows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
