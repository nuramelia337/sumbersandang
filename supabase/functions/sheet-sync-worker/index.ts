import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireAdminOrWorker } from "../_shared/http.ts";
import { syncOrderToSheets } from "../_shared/sheetSync.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (!await requireAdminOrWorker(req, supabase)) return json(req, { error: "Unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 50), 1), 50);
    let query = supabase.from("sheet_sync_outbox").select("order_id").in("status", ["pending", "failed"])
      .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
    if (body.orderId) query = query.eq("order_id", String(body.orderId));
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    let succeeded = 0;
    let failed = 0;
    for (const row of data || []) {
      try { await syncOrderToSheets(supabase, row.order_id); succeeded += 1; } catch { failed += 1; }
    }
    return json(req, { processed: (data || []).length, succeeded, failed });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Worker failed" }, 500);
  }
});
