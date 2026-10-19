import { getServiceSupabase, resolveMembership } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  const membership = await resolveMembership(request);
  if (!membership) return Response.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json() as { channel?: string; body?: string; priority?: boolean };
  if (!body.body?.trim()) return Response.json({ error: "Message body is required." }, { status: 400 });
  const db = getServiceSupabase();
  const { data, error } = await db.from("messages").insert({ workspace_id: membership.workspaceId, author_id: membership.user.id, channel: body.channel ?? "dispatch", body: body.body.trim(), priority: Boolean(body.priority) }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ message: data }, { status: 201 });
}
