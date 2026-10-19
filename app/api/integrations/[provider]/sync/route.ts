import { getServiceSupabase, resolveMembership } from "../../../../../lib/supabase/server";

const providers = new Set(["google_calendar", "quickbooks"]);

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const membership = await resolveMembership(request);
  if (!membership) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (membership.role !== "owner") return Response.json({ error: "Only owners can sync integrations." }, { status: 403 });
  const { provider } = await context.params;
  if (!providers.has(provider)) return Response.json({ error: "Unsupported integration." }, { status: 400 });
  const db = getServiceSupabase();
  const { data: connection } = await db.from("integration_connections").select("id, encrypted_refresh_token").eq("workspace_id", membership.workspaceId).eq("provider", provider).maybeSingle();
  if (!connection?.encrypted_refresh_token) return Response.json({ error: `${provider === "google_calendar" ? "Google Calendar" : "QuickBooks"} is not connected. Connect it from workspace administration first.` }, { status: 409 });
  await db.from("integration_connections").update({ status: "syncing", last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
  await db.from("integration_sync_runs").insert({ workspace_id: membership.workspaceId, provider, status: "syncing" });
  // Provider token exchange and sync are performed by the deployment worker using server-only secrets.
  return Response.json({ ok: true, status: "syncing" });
}
