import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireAdminOrWorker } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (!await requireAdminOrWorker(req, supabase)) return json(req, { error: "Unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 50), 1), 100);
    const { data: rows, error } = await supabase.from("media_cleanup_queue").select("id,bucket_id,object_path,attempts")
      .in("status", ["pending", "failed"]).lte("eligible_after", new Date().toISOString()).order("eligible_after").limit(limit);
    if (error) throw new Error(error.message);
    let deleted = 0;
    let referenced = 0;
    let failed = 0;
    for (const row of rows || []) {
      await supabase.from("media_cleanup_queue").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", row.id);
      const { data: isReferenced, error: referenceError } = await supabase.rpc("media_path_is_referenced", { p_path: row.object_path });
      if (referenceError) {
        failed += 1;
        await supabase.from("media_cleanup_queue").update({ status: "failed", attempts: row.attempts + 1, last_error: referenceError.message, updated_at: new Date().toISOString() }).eq("id", row.id);
        continue;
      }
      if (isReferenced) {
        referenced += 1;
        await supabase.from("media_cleanup_queue").update({ status: "referenced", processed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
        continue;
      }
      const { error: removeError } = await supabase.storage.from(row.bucket_id).remove([row.object_path]);
      if (removeError) {
        failed += 1;
        await supabase.from("media_cleanup_queue").update({ status: "failed", attempts: row.attempts + 1, last_error: removeError.message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", row.id);
      } else {
        deleted += 1;
        await supabase.from("media_cleanup_queue").update({ status: "deleted", attempts: row.attempts + 1, processed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
      }
    }
    return json(req, { processed: (rows || []).length, deleted, referenced, failed });
  } catch (error) {
    return json(req, { error: error instanceof Error ? error.message : "Cleanup failed" }, 500);
  }
});
