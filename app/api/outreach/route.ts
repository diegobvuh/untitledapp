import { getServiceSupabase, resolveMembership } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  const membership = await resolveMembership(request);
  if (!membership) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { outreachId, action } = await request.json() as { outreachId?: string; action?: "approve" | "send" };
  if (!outreachId || !action) return Response.json({ error: "An outreach record and action are required." }, { status: 400 });
  const db = getServiceSupabase();
  const { data: outreach, error } = await db.from("outreach_approvals").select("id, workspace_id, status, body, customer_contacts(phone_e164, sms_opt_in_at)").eq("id", outreachId).eq("workspace_id", membership.workspaceId).maybeSingle();
  if (error || !outreach) return Response.json({ error: "Outreach record not found." }, { status: 404 });
  if (action === "approve") {
    if (membership.role !== "owner") return Response.json({ error: "Only owners can approve outreach." }, { status: 403 });
    await db.from("outreach_approvals").update({ status: "approved", approved_by: membership.user.id, approved_at: new Date().toISOString() }).eq("id", outreach.id);
    return Response.json({ ok: true, status: "approved" });
  }
  const contact = outreach.customer_contacts as { phone_e164?: string | null; sms_opt_in_at?: string | null } | null;
  if (outreach.status !== "approved") return Response.json({ error: "An owner must approve this message before it can be sent." }, { status: 409 });
  if (!contact?.phone_e164 || !contact.sms_opt_in_at) return Response.json({ error: "Sending is blocked: this customer needs a valid phone number and recorded SMS consent." }, { status: 409 });
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) return Response.json({ error: "Twilio is not configured for this workspace." }, { status: 503 });
  const callback = new URL("/api/sms/delivery", request.url).toString();
  const payload = new URLSearchParams({ To: contact.phone_e164, From: process.env.TWILIO_FROM_NUMBER, Body: outreach.body, StatusCallback: callback });
  const auth = btoa(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`);
  const twilio = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" }, body: payload });
  const result = await twilio.json() as { sid?: string; message?: string };
  if (!twilio.ok || !result.sid) return Response.json({ error: result.message ?? "Twilio rejected the send." }, { status: 502 });
  await db.from("outreach_approvals").update({ status: "sent" }).eq("id", outreach.id);
  await db.from("sms_delivery_events").insert({ workspace_id: membership.workspaceId, outreach_approval_id: outreach.id, twilio_sid: result.sid, status: "queued" });
  return Response.json({ ok: true, status: "queued", sid: result.sid });
}
