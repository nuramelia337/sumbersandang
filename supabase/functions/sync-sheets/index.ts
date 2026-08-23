import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireAdminOrWorker } from "../_shared/http.ts";
import { syncOrderToSheets } from "../_shared/sheetSync.ts";

// Compatibility endpoint for administrators only. Public checkout no longer calls it.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (!await requireAdminOrWorker(req, supabase)) return json(req, { error: "Unauthorized" }, 401);
  try {
    const { orderId } = await req.json();
    if (!orderId) return json(req, { error: "orderId is required" }, 400);
    await syncOrderToSheets(supabase, String(orderId));
    return json(req, { success: true });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Sync failed" }, 500);
  }
});
