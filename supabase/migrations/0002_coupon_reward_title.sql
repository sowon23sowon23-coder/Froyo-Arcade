-- Rewards can differ per coupon (Froyo Catch pays by score), and coupons become
-- usable some time after they are issued. Each coupon keeps its own values, so
-- later config changes don't alter it. Coupons issued before these columns
-- existed stay null: they show the default reward and are usable immediately.
-- Safe to run more than once.
alter table public.coupons add column if not exists reward_title text;
alter table public.coupons add column if not exists reward_percent integer;
alter table public.coupons add column if not exists valid_from timestamptz;

-- Same one-time rule as 0001, and now the coupon must also have reached valid_from.
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
     and (c.valid_from is null or c.valid_from <= v_now)
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

-- Raises a coupon's reward after a better result. Only ever goes up, and never
-- once the QR has been opened or the coupon has expired. The dates stay as they
-- were: upgrading doesn't restart the waiting period or extend the coupon.
create or replace function public.upgrade_coupon(
  p_coupon_id uuid,
  p_user_id uuid,
  p_title text,
  p_percent integer,
  p_game text,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coupons c
     set reward_title = p_title,
         reward_percent = p_percent,
         source_game = p_game,
         mission_claim_id = p_claim_id
   where c.id = p_coupon_id
     and c.user_id = p_user_id
     and c.qr_executed_at is null
     and (c.expires_at is null or c.expires_at > now())
     and coalesce(c.reward_percent, 0) < p_percent;
  return found;
end;
$$;

revoke all on function public.upgrade_coupon(uuid, uuid, text, integer, text, uuid) from public, anon, authenticated;
