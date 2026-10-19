import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/202610190001_naviwork_workspace.sql", import.meta.url), "utf8");
const workspaceApi = await readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8");
const outreachApi = await readFile(new URL("../app/api/outreach/route.ts", import.meta.url), "utf8");
const webhookApi = await readFile(new URL("../app/api/sms/delivery/route.ts", import.meta.url), "utf8");

test("workspace schema enforces roles and row level security", () => {
  for (const table of ["workspaces", "workspace_memberships", "dispatches", "messages", "integration_connections", "outreach_approvals"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /create type public\.workspace_role as enum \('owner', 'dispatcher'\)/i);
  assert.match(migration, /activate_membership_for_authenticated_email/i);
  assert.match(migration, /owners approve outreach/i);
});

test("server APIs validate membership and consent-sensitive actions", () => {
  assert.match(workspaceApi, /resolveMembership\(request\)/);
  assert.match(workspaceApi, /membership\.role !== "owner"/);
  assert.match(outreachApi, /sms_opt_in_at/);
  assert.match(outreachApi, /TWILIO_AUTH_TOKEN/);
  assert.match(webhookApi, /x-twilio-signature/);
  assert.match(webhookApi, /HMAC/);
});
