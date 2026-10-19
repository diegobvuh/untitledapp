import { getServiceSupabase, isSupabaseServerConfigured, resolveMembership } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  if (!isSupabaseServerConfigured()) return Response.json({ configured: false, error: "Supabase is not configured." }, { status: 503 });
  const membership = await resolveMembership(request);
  if (!membership) return Response.json({ error: "Sign in and an active workspace membership are required." }, { status: 401 });
  const db = getServiceSupabase();
  const [dispatches, crews, messages, integrations, priorities, workspace] = await Promise.all([
    db.from("dispatches").select("id, code, title, priority, status, neighborhood, eta_minutes, assigned_crew_id, created_at").eq("workspace_id", membership.workspaceId).order("created_at", { ascending: false }).limit(30),
    db.from("crew_activity").select("id, crew_name, vehicle, status, neighborhood, assignment, updated_at").eq("workspace_id", membership.workspaceId).order("updated_at", { ascending: false }).limit(30),
    db.from("messages").select("id, channel, body, priority, created_at, profiles(full_name, email)").eq("workspace_id", membership.workspaceId).order("created_at", { ascending: false }).limit(100),
    db.from("integration_connections").select("provider, status, last_synced_at, last_error").eq("workspace_id", membership.workspaceId),
    membership.role === "owner" ? db.from("owner_priorities").select("id, kind, title, detail, action, severity, created_at").eq("workspace_id", membership.workspaceId).eq("resolved", false).order("severity", { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null }),
    db.from("workspaces").select("settings").eq("id", membership.workspaceId).maybeSingle(),
  ]);
  const failures = [dispatches, crews, messages, integrations, priorities, workspace].find((result) => result.error);
  if (failures?.error) return Response.json({ error: failures.error.message }, { status: 500 });
  return Response.json({ configured: true, user: { email: membership.user.email, displayName: membership.user.user_metadata.full_name ?? membership.user.email }, membership: { role: membership.role, workspaceId: membership.workspaceId, workspaceName: membership.workspaceName }, settings: workspace.data?.settings ?? {}, dispatches: dispatches.data, crews: crews.data, messages: messages.data, integrations: integrations.data, priorities: priorities.data });
}

export async function POST(request: Request) {
  if (!isSupabaseServerConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const membership = await resolveMembership(request);
  if (!membership) return Response.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json() as { action?: string; dispatchId?: string; crewId?: string; title?: string; neighborhood?: string };
  const db = getServiceSupabase();
  if (body.action === "assign" && body.dispatchId && body.crewId) {
    const { error } = await db.from("dispatches").update({ assigned_crew_id: body.crewId, status: "assigned", updated_at: new Date().toISOString() }).eq("workspace_id", membership.workspaceId).eq("id", body.dispatchId);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ ok: true });
  }
  if (body.action === "create" && body.title?.trim()) {
    const { data, error } = await db.from("dispatches").insert({ workspace_id: membership.workspaceId, code: `D-${Date.now().toString().slice(-5)}`, title: body.title.trim(), neighborhood: body.neighborhood?.trim() || "Hayward", priority: "P2", status: "open", created_by: membership.user.id }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ ok: true, dispatch: data });
  }
  if (body.action === "settings") {
    if (membership.role !== "owner") return Response.json({ error: "Only owners can update workspace administration settings." }, { status: 403 });
    const settings = (body as { settings?: unknown }).settings ?? {};
    const { error } = await db.from("workspaces").update({ settings }).eq("id", membership.workspaceId);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unsupported workspace action." }, { status: 400 });
}
