import { createClient } from "npm:@supabase/supabase-js@2";
import { boundedText, corsHeaders, json } from "../_shared/http.ts";
import { syncOrderToSheets } from "../_shared/sheetSync.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const contentLength = Number(req.headers.get("Content-Length") || 0);
    if (contentLength > 16_384) return json(req, { error: "Payload terlalu besar." }, 413);
    const body = await req.json();
    const requestId = boundedText(body.requestId, 36, true);
    if (!UUID_RE.test(requestId)) return json(req, { error: "Request id tidak valid." }, 400);

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length < 1 || rawItems.length > 20) return json(req, { error: "Pesanan harus berisi 1 sampai 20 item." }, 400);
    const items = rawItems.map((item: any) => {
      const kind = item?.kind === "package" ? "package" : item?.kind === "product" ? "product" : "";
      const id = boundedText(item?.id, 36, true);
      if (!kind || !UUID_RE.test(id)) throw new Error("Item checkout tidak valid.");
      return { kind, id };
    });
    const customer = {
      name: boundedText(body.customer?.name, 120, true),
      phone: boundedText(body.customer?.phone, 24, true),
      address: boundedText(body.customer?.address, 500, true),
      city: boundedText(body.customer?.city, 100, true),
      province: boundedText(body.customer?.province, 100, true),
      instagram: boundedText(body.customer?.instagram, 80),
      pickup_date: boundedText(body.customer?.pickup_date, 10),
      pickup_time: boundedText(body.customer?.pickup_time, 5),
    };
    const shippingMethod = boundedText(body.shippingMethod, 16, true);
    const paymentMethod = boundedText(body.paymentMethod, 16, true);
    const couponCode = boundedText(body.couponCode, 40);
    const notes = boundedText(body.notes, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Server configuration is incomplete");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const ip = (req.headers.get("X-Forwarded-For") || req.headers.get("CF-Connecting-IP") || "unknown").split(",")[0].trim();
    const rateKey = await sha256(`${Deno.env.get("RATE_LIMIT_SALT") || serviceRoleKey.slice(0, 16)}:${ip}`);
    const { data: allowed, error: rateError } = await supabase.rpc("consume_checkout_rate_limit", {
      p_key_hash: rateKey, p_limit: 10, p_window_seconds: 600,
    });
    if (rateError) throw new Error(rateError.message);
    if (!allowed) return json(req, { error: "Terlalu banyak percobaan checkout. Coba lagi beberapa menit." }, 429);

    const { data: order, error } = await supabase.rpc("create_checkout_order_internal", {
      p_request_id: requestId,
      p_customer: customer,
      p_shipping_method: shippingMethod,
      p_payment_method: paymentMethod,
      p_coupon_code: couponCode || null,
      p_notes: notes || null,
      p_items: items,
    });
    if (error) {
      const lower = error.message.toLowerCase();
      const message = lower.includes("available") || lower.includes("overlap")
        ? "Salah satu item baru saja dipesan orang lain. Perbarui keranjang Anda."
        : lower.includes("coupon")
          ? "Kupon tidak valid atau sudah tidak berlaku."
          : lower.includes("pending orders")
            ? "Nomor ini sudah memiliki terlalu banyak pesanan pending."
            : lower.includes("customer") || lower.includes("shipping") || lower.includes("payment") || lower.includes("item")
              ? "Data checkout tidak valid. Periksa kembali formulir Anda."
              : "Checkout belum dapat diproses. Silakan coba lagi.";
      return json(req, { error: message }, 409);
    }

    try { await syncOrderToSheets(supabase, String(order.id)); } catch { /* retry remains in outbox */ }
    return json(req, { order }, 201);
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Checkout gagal." }, 400);
  }
});
