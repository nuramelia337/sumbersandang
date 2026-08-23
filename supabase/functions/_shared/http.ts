const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = configuredOrigins.length === 0
    ? "*"
    : configuredOrigins.includes(origin) ? origin : configuredOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Worker-Secret",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function boundedText(value: unknown, maxLength: number, required = false): string {
  const output = String(value ?? "").trim();
  if (required && output.length === 0) throw new Error("Kolom wajib belum diisi.");
  if (output.length > maxLength) throw new Error(`Teks melebihi batas ${maxLength} karakter.`);
  return output;
}

export async function requireAdminOrWorker(req: Request, supabase: any): Promise<boolean> {
  const workerSecret = Deno.env.get("INTERNAL_WORKER_SECRET");
  if (workerSecret && req.headers.get("X-Worker-Secret") === workerSecret) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile } = await supabase.from("admin_profiles").select("id").eq("id", data.user.id).eq("is_active", true).maybeSingle();
  return Boolean(profile);
}
