import { getServiceSupabase, resolveMembership } from "../../../../../lib/supabase/server";

const providerConfig = {
  google_calendar: { id: "GOOGLE_CALENDAR_CLIENT_ID", authorization: "https://accounts.google.com/o/oauth2/v2/auth", scope: "https://www.googleapis.com/auth/calendar.readonly" },
  quickbooks: { id: "QUICKBOOKS_CLIENT_ID", authorization: "https://appcenter.intuit.com/connect/oauth2", scope: "com.intuit.quickbooks.accounting" },
} as const;

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const membership = await resolveMembership(request);
  if (!membership) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (membership.role !== "owner") return Response.json({ error: "Only owners can connect integrations." }, { status: 403 });
  const { provider } = await context.params;
  if (!(provider in providerConfig)) return Response.json({ error: "Unsupported integration." }, { status: 400 });
  const config = providerConfig[provider as keyof typeof providerConfig];
  const clientId = process.env[config.id];
  if (!clientId) return Response.json({ error: `${provider === "google_calendar" ? "Google Calendar" : "QuickBooks"} OAuth is not configured.` }, { status: 503 });
  const state = crypto.randomUUID();
  const db = getServiceSupabase();
  await db.from("integration_oauth_states").insert({ workspace_id: membership.workspaceId, provider, nonce: state, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  const redirectUri = new URL(`/api/integrations/${provider}/callback`, request.url).toString();
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: config.scope, state });
  if (provider === "google_calendar") { query.set("access_type", "offline"); query.set("prompt", "consent"); }
  return Response.json({ authorizationUrl: `${config.authorization}?${query}` });
}
