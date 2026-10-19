import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isSupabaseServerConfigured() {
  return Boolean(url && anonKey);
}

export function getServiceSupabase() {
  if (!url || !serviceKey) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  if (!url || !anonKey) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

export function getMemberSupabase(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) throw new Error("An authenticated Supabase session is required.");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export type WorkspaceRole = "owner" | "dispatcher";

export async function resolveMembership(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !url || !anonKey) return null;
  // This lookup intentionally uses the member's token. It proves that the
  // workspace RLS policy grants this signed-in user access before any
  // privileged server-side work is attempted.
  const db = getMemberSupabase(request);
  const { data, error } = await db
    .from("workspace_memberships")
    .select("workspace_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const { data: workspace } = await db
    .from("workspaces")
    .select("name")
    .eq("id", data.workspace_id)
    .maybeSingle();
  return { user, workspaceId: data.workspace_id as string, role: data.role as WorkspaceRole, workspaceName: workspace?.name ?? "Naviwork workspace" };
}
