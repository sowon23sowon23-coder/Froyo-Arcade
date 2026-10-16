-- Froyo Arcade rewards: one coupon per account per promotion, earned by
-- completing any one game's mission, shown once in store as the shared QR.
--
-- Every table has RLS on and no policies: only the server (service role key)
-- reads or writes them. Browsers never talk to these tables directly.

create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  game text not null check (game in ('catch', 'crush', 'wordle', 'slice')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb
);

create index play_sessions_anon_idx on public.play_sessions (anon_id, started_at desc);

-- A mission the player achieved, before (or after) it is exchanged for a coupon.
-- It is tied to the browser that played (anon_id) so the result survives sign-in.
create table public.mission_claims (
  id uuid primary key default gen_random_uuid(),
  promotion_id text not null,
  anon_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  game text not null check (game in ('catch', 'crush', 'wordle', 'slice')),
  play_session_id uuid references public.play_sessions (id) on delete set null,
  result jsonb not null default '{}',
  achieved_at timestamptz not null default now(),
  -- Set when the claim was exchanged for a coupon, or found the account already had one.
  redeemed_at timestamptz
);

create index mission_claims_anon_idx on public.mission_claims (anon_id, achieved_at desc);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  promotion_id text not null,
  -- Short code shown next to the QR so staff can tell a live screen from a screenshot.
  code text not null unique,
  source_game text not null check (source_game in ('catch', 'crush', 'wordle', 'slice')),
  mission_claim_id uuid references public.mission_claims (id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  -- When the customer opened the in-store QR. This is a use *attempt*: the POS
  -- does not report back, so it does not mean the discount was applied.
  qr_executed_at timestamptz,
  -- The rule that matters: one coupon per account per promotion, whichever game earned it.
  unique (user_id, promotion_id)
);

create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  anon_id text,
  user_id uuid,
  promotion_id text,
  game text,
  type text not null,
  meta jsonb not null default '{}'
);

create index events_type_idx on public.events (type, created_at desc);

alter table public.play_sessions enable row level security;
alter table public.mission_claims enable row level security;
alter table public.coupons enable row level security;
alter table public.events enable row level security;

-- Opens the in-store QR exactly once, on the database clock.
-- Concurrent calls serialize on the row lock: the first sets qr_executed_at,
-- the rest see it already set and get the original time back (newly_executed = false).
-- Nothing is written when the coupon is expired or already executed.
create or replace function public.execute_coupon_qr(p_coupon_id uuid, p_user_id uuid)
returns table (qr_executed_at timestamptz, newly_executed boolean, db_now timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_executed timestamptz;
begin
  update public.coupons c
     set qr_executed_at = v_now
   where c.id = p_coupon_id
     and c.user_id = p_user_id
     and c.qr_executed_at is null
     and (c.expires_at is null or c.expires_at > v_now)
  returning c.qr_executed_at into v_executed;

  if found then
    return query select v_executed, true, v_now;
    return;
  end if;

  return query
    select c.qr_executed_at, false, v_now
      from public.coupons c
     where c.id = p_coupon_id and c.user_id = p_user_id;
end;
$$;

revoke all on function public.execute_coupon_qr(uuid, uuid) from public, anon, authenticated;

-- Which games lead to in-store use attempts. store_click and qr_execute are
-- attributed to the game that earned the coupon.
create or replace view public.reward_funnel_by_game
with (security_invoker = true)
as
select
  game,
  count(*) filter (where type = 'game_start') as game_starts,
  count(*) filter (where type = 'game_complete') as game_completes,
  count(*) filter (where type = 'mission_achieved') as missions_achieved,
  count(*) filter (where type = 'coupon_issued') as coupons_issued,
  count(*) filter (where type = 'store_click') as store_clicks,
  count(*) filter (where type = 'qr_execute') as qr_executions
from public.events
group by game;
