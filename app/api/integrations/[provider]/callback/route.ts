import { getServiceSupabase } from "../../../../../lib/supabase/server";

const tokenUrl = { google_calendar: "https://oauth2.googleapis.com/token", quickbooks: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer" } as const;
const idEnv = { google_calendar: "GOOGLE_CALENDAR_CLIENT_ID", quickbooks: "QUICKBOOKS_CLIENT_ID" } as const;
const secretEnv = { google_calendar: "GOOGLE_CALENDAR_CLIENT_SECRET", quickbooks: "QUICKBOOKS_CLIENT_SECRET" } as const;

async function encrypt(value: string) {
  const encodedKey = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("Token encryption is not configured.");
  const keyBytes = Uint8Array.from(atob(encodedKey), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  const result = new Uint8Array(iv.length + cipher.length); result.set(iv); result.set(cipher, iv.length);
  return result;
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const { provider } = await context.params;
  if (!(provider in tokenUrl) || !code || !state) return Response.redirect(new URL("/?integration=invalid", request.url), 302);
  const db = getServiceSupabase();
  const { data: authState } = await db.from("integration_oauth_states").select("id, workspace_id, expires_at").eq("provider", provider).eq("nonce", state).maybeSingle();
  if (!authState || new Date(authState.expires_at) < new Date()) return Response.redirect(new URL("/?integration=expired", request.url), 302);
  const clientId = process.env[idEnv[provider as keyof typeof idEnv]]; const clientSecret = process.env[secretEnv[provider as keyof typeof secretEnv]];
  if (!clientId || !clientSecret) return Response.redirect(new URL("/?integration=not-configured", request.url), 302);
  const redirectUri = new URL(`/api/integrations/${provider}/callback`, request.url).toString();
  const headers: HeadersInit = provider === "quickbooks" ? { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "content-type": "application/x-www-form-urlencoded" } : { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, ...(provider === "google_calendar" ? { client_id: clientId, client_secret: clientSecret } : {}) });
  const exchange = await fetch(tokenUrl[provider as keyof typeof tokenUrl], { method: "POST", headers, body });
  const tokens = await exchange.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!exchange.ok || !tokens.access_token || !tokens.refresh_token) return Response.redirect(new URL("/?integration=failed", request.url), 302);
  await db.from("integration_connections").upsert({ workspace_id: authState.workspace_id, provider, status: "connected", encrypted_access_token: await encrypt(tokens.access_token), encrypted_refresh_token: await encrypt(tokens.refresh_token), token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(), last_error: null }, { onConflict: "workspace_id,provider" });
  await db.from("integration_oauth_states").delete().eq("id", authState.id);
  return Response.redirect(new URL("/?integration=connected", request.url), 302);
}
