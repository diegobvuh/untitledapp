import { getServiceSupabase } from "../../../../lib/supabase/server";

function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!signature || !authToken) return Response.json({ error: "Invalid webhook." }, { status: 401 });
  const form = await request.formData();
  const url = request.url;
  const sorted = [...form.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}${value}`).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const expected = base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${url}${sorted}`)));
  if (expected !== signature) return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  const sid = String(form.get("MessageSid") ?? "");
  const status = String(form.get("MessageStatus") ?? "unknown");
  if (!sid) return Response.json({ error: "Missing message SID." }, { status: 400 });
  const db = getServiceSupabase();
  const { data: existing } = await db.from("sms_delivery_events").select("id, outreach_approval_id, workspace_id").eq("twilio_sid", sid).maybeSingle();
  if (existing) await db.from("sms_delivery_events").update({ status, payload: Object.fromEntries(form.entries()) }).eq("id", existing.id);
  return Response.json({ ok: true });
}
