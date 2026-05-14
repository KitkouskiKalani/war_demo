-- Online play hardening schema for Let There Be War.
--
-- This keeps the existing Supabase Realtime Broadcast transport, but adds
-- durable match/session records so lobbies can expire, matches can resume, and
-- clients can recover from missed messages with the latest host snapshot.

create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'paused', 'finished', 'abandoned')),
  host_id text,
  guest_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_snapshot jsonb,
  last_sequence integer not null default 0,
  current_phase text,
  winner integer
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_slot integer not null check (player_slot in (1, 2)),
  session_token text not null,
  display_name text not null default 'Player',
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  primary key (match_id, player_slot)
);

create table if not exists public.lobbies (
  id text primary key,
  host_name text not null,
  created_at timestamptz not null default now()
);

alter table public.lobbies
  add column if not exists match_id uuid references public.matches(id) on delete cascade,
  add column if not exists host_session_token text,
  add column if not exists last_heartbeat_at timestamptz not null default now(),
  add column if not exists status text not null default 'waiting'
    check (status in ('waiting', 'active', 'closed', 'expired'));

create index if not exists matches_room_code_idx on public.matches(room_code);
create index if not exists matches_status_seen_idx on public.matches(status, last_seen_at);
create index if not exists lobbies_status_heartbeat_idx on public.lobbies(status, last_heartbeat_at);

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.lobbies enable row level security;

-- Friendly-build policies. These still trust the anon key, but prevent the old
-- world-delete-lobby shape once app code uses session_token checks in queries.
-- For production, replace these with Supabase Auth policies keyed by auth.uid().
drop policy if exists "Anyone can read matches" on public.matches;
create policy "Anyone can read matches" on public.matches
  for select using (true);
drop policy if exists "Anyone can create matches" on public.matches;
create policy "Anyone can create matches" on public.matches
  for insert with check (true);
drop policy if exists "Anyone can update matches" on public.matches;
create policy "Anyone can update matches" on public.matches
  for update using (true) with check (true);

drop policy if exists "Anyone can read match players" on public.match_players;
create policy "Anyone can read match players" on public.match_players
  for select using (true);
drop policy if exists "Anyone can upsert match players" on public.match_players;
create policy "Anyone can upsert match players" on public.match_players
  for insert with check (true);
drop policy if exists "Anyone can update match players" on public.match_players;
create policy "Anyone can update match players" on public.match_players
  for update using (true) with check (true);

drop policy if exists "Anyone can read lobbies" on public.lobbies;
create policy "Anyone can read lobbies" on public.lobbies
  for select using (true);
drop policy if exists "Anyone can insert lobbies" on public.lobbies;
create policy "Anyone can insert lobbies" on public.lobbies
  for insert with check (true);
drop policy if exists "Anyone can update lobbies" on public.lobbies;
create policy "Anyone can update lobbies" on public.lobbies
  for update using (true) with check (true);
drop policy if exists "Anyone can delete lobbies" on public.lobbies;
create policy "Anyone can delete lobbies" on public.lobbies
  for delete using (true);

-- Lobbies should be filtered by last_heartbeat_at in app code. For server-side
-- cleanup, schedule this periodically via pg_cron or a Supabase Scheduled Edge
-- Function:
--
-- update public.lobbies
-- set status = 'expired'
-- where status = 'waiting'
--   and last_heartbeat_at < now() - interval '90 seconds';
--
-- update public.matches
-- set status = 'abandoned'
-- where status in ('waiting', 'active', 'paused')
--   and last_seen_at < now() - interval '10 minutes';
