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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);
    const requester = requesterData.user;
    if (requesterError || !requester) return json({ error: "Unauthorized" }, 401);

    const { data: requesterProfile } = await supabase
      .from("admin_profiles")
      .select("id, role, is_active")
      .eq("id", requester.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!requesterProfile) return json({ error: "Akun Anda tidak memiliki akses admin aktif." }, 403);

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const role = "admin";

    if (!email || !email.includes("@")) return json({ error: "Email admin tidak valid." }, 400);
    if (password.length < 6) return json({ error: "Password minimal 6 karakter." }, 400);

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : {},
    });

    if (createError || !created.user) {
      return json({ error: createError?.message || "Gagal membuat akun admin." }, 400);
    }

    const { error: profileError } = await supabase.from("admin_profiles").upsert({
      id: created.user.id,
      email,
      full_name: fullName || null,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    if (profileError) return json({ error: profileError.message }, 400);

    await supabase.from("activity_logs").insert({
      admin_id: requester.id,
      action: "admin_user_created",
      entity_type: "admin_profile",
      entity_id: created.user.id,
      description: `Created admin user: ${email}`,
      metadata: { role },
    });

    return json({ success: true, user_id: created.user.id });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
