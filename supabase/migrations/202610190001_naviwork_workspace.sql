-- Fresh Naviwork workspace schema. Apply in the Supabase SQL editor or via `supabase db push`.
create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner', 'dispatcher');
create type public.membership_status as enum ('pending', 'active', 'revoked');
create type public.integration_status as enum ('disconnected', 'connected', 'syncing', 'stale', 'error');
create type public.dispatch_status as enum ('open', 'assigned', 'in_progress', 'complete', 'cancelled');
create type public.outreach_status as enum ('draft', 'approved', 'sent', 'delivered', 'failed', 'blocked');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text not null,
  role public.workspace_role not null,
  status public.membership_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (workspace_id, invited_email),
  unique (workspace_id, user_id)
);

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null,
  title text not null,
  neighborhood text,
  priority text not null default 'P2',
  status public.dispatch_status not null default 'open',
  eta_minutes integer,
  assigned_crew_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dispatch_id uuid not null references public.dispatches(id) on delete cascade,
  crew_id uuid,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now()
);

create table public.crew_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crew_name text not null,
  vehicle text,
  status text not null,
  neighborhood text,
  assignment text,
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid references auth.users(id),
  channel text not null default 'dispatch',
  body text not null,
  priority boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  full_name text not null,
  phone_e164 text,
  sms_opt_in_at timestamptz,
  sms_opt_in_source text,
  created_at timestamptz not null default now()
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'quickbooks')),
  status public.integration_status not null default 'disconnected',
  encrypted_access_token bytea,
  encrypted_refresh_token bytea,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  status public.integration_status not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create table public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  nonce text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.owner_priorities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('cash', 'capacity', 'risk')),
  title text not null,
  detail text not null,
  action text not null,
  severity integer not null default 1,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.outreach_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_contact_id uuid not null references public.customer_contacts(id),
  body text not null,
  status public.outreach_status not null default 'draft',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sms_delivery_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  outreach_approval_id uuid not null references public.outreach_approvals(id),
  twilio_sid text unique,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- A dispatcher invitation becomes active as soon as the same email signs in.
create or replace function public.activate_membership_for_authenticated_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do update set email = excluded.email, full_name = coalesce(excluded.full_name, public.profiles.full_name);
  update public.workspace_memberships
  set user_id = new.id, status = 'active'
  where lower(invited_email) = lower(new.email) and status = 'pending';
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.activate_membership_for_authenticated_email();

create or replace function public.current_workspace_role(target_workspace uuid)
returns public.workspace_role language sql stable security definer set search_path = public as $$
  select role from public.workspace_memberships
  where workspace_id = target_workspace and user_id = auth.uid() and status = 'active' limit 1;
$$;
create or replace function public.can_access_workspace(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.workspace_memberships where workspace_id = target_workspace and user_id = auth.uid() and status = 'active');
$$;
create or replace function public.is_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_workspace_role(target_workspace) = 'owner';
$$;

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.dispatches enable row level security;
alter table public.assignments enable row level security;
alter table public.crew_activity enable row level security;
alter table public.messages enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.integration_oauth_states enable row level security;
alter table public.owner_priorities enable row level security;
alter table public.outreach_approvals enable row level security;
alter table public.sms_delivery_events enable row level security;

create policy "members view their workspace" on public.workspaces for select using (public.can_access_workspace(id));
create policy "owners manage workspace" on public.workspaces for update using (public.is_owner(id));
create policy "users view own profile" on public.profiles for select using (id = auth.uid());
create policy "members view memberships" on public.workspace_memberships for select using (public.can_access_workspace(workspace_id));
create policy "owners manage memberships" on public.workspace_memberships for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));

create policy "members read dispatches" on public.dispatches for select using (public.can_access_workspace(workspace_id));
create policy "members create dispatches" on public.dispatches for insert with check (public.can_access_workspace(workspace_id));
create policy "members update dispatches" on public.dispatches for update using (public.can_access_workspace(workspace_id));
create policy "members read assignments" on public.assignments for select using (public.can_access_workspace(workspace_id));
create policy "members manage assignments" on public.assignments for all using (public.can_access_workspace(workspace_id)) with check (public.can_access_workspace(workspace_id));
create policy "members read crew activity" on public.crew_activity for select using (public.can_access_workspace(workspace_id));
create policy "members update crew activity" on public.crew_activity for all using (public.can_access_workspace(workspace_id)) with check (public.can_access_workspace(workspace_id));
create policy "members read messages" on public.messages for select using (public.can_access_workspace(workspace_id));
create policy "members create messages" on public.messages for insert with check (public.can_access_workspace(workspace_id) and author_id = auth.uid());
create policy "members read contacts" on public.customer_contacts for select using (public.can_access_workspace(workspace_id));
create policy "owners manage contacts" on public.customer_contacts for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy "owners manage integrations" on public.integration_connections for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy "owners view sync history" on public.integration_sync_runs for select using (public.is_owner(workspace_id));
create policy "owners manage OAuth state" on public.integration_oauth_states for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy "owners view priorities" on public.owner_priorities for select using (public.is_owner(workspace_id));
create policy "owners manage priorities" on public.owner_priorities for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy "members view outreach" on public.outreach_approvals for select using (public.can_access_workspace(workspace_id));
create policy "owners approve outreach" on public.outreach_approvals for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));
create policy "members view delivery history" on public.sms_delivery_events for select using (public.can_access_workspace(workspace_id));

create index dispatches_workspace_status_idx on public.dispatches (workspace_id, status, created_at desc);
create index messages_workspace_created_idx on public.messages (workspace_id, created_at desc);
create index priorities_workspace_open_idx on public.owner_priorities (workspace_id, resolved, severity desc);
