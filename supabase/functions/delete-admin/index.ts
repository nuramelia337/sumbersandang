import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);
    const requester = requesterData.user;
    if (requesterError || !requester) return json({ error: "Unauthorized" }, 401);

    const { data: requesterProfile } = await supabase
      .from("admin_profiles")
      .select("id, role, is_active")
      .eq("id", requester.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!requesterProfile || requesterProfile.role !== "owner") {
      return json({ error: "Hanya owner yang bisa menghapus admin." }, 403);
    }

    const { admin_id: adminId } = await req.json();
    if (!adminId || typeof adminId !== "string") return json({ error: "admin_id wajib diisi." }, 400);
    if (adminId === requester.id) return json({ error: "Akun sendiri tidak bisa dihapus dari sini." }, 400);

    const { data: targetProfile } = await supabase
      .from("admin_profiles")
      .select("id, email, role")
      .eq("id", adminId)
      .maybeSingle();

    if (!targetProfile) return json({ error: "Admin tidak ditemukan." }, 404);
    if (targetProfile.role === "owner") return json({ error: "Akun owner tidak bisa dihapus dari panel ini." }, 400);

    await supabase.from("activity_logs").insert({
      admin_id: requester.id,
      action: "admin_user_deleted",
      entity_type: "admin_profile",
      entity_id: adminId,
      description: `Deleted admin user: ${targetProfile.email}`,
      metadata: { email: targetProfile.email },
    });

    const { error: profileError } = await supabase.from("admin_profiles").delete().eq("id", adminId);
    if (profileError) return json({ error: profileError.message }, 400);

    const { error: authError } = await supabase.auth.admin.deleteUser(adminId);
    if (authError) return json({ error: authError.message }, 400);

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
