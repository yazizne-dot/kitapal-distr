-- Run the whole file in the PRODUCTION Supabase SQL Editor as postgres.
-- Existing rows are preserved. The script runs in one transaction and can be rerun.
-- Requires the existing Kitapal tables/views and private role/access helpers.
-- pg_cron is required; enable it in Database > Extensions if CREATE EXTENSION is denied.
-- This script does not deploy Edge Functions or change Auth accounts.

begin;
alter table public.distributors add column if not exists debt_adjustment numeric(14,2) not null default 0;

-- Ensure live debt and credit checks include submitted orders and manual adjustments.
-- Submitted orders reserve credit immediately. Drafts and cancelled orders do not.
-- Recompute from totals so confirmation never charges twice, and edits, deletions,
-- payments and existing pending orders are reflected automatically.
create or replace view public.distributor_stats
  with (security_invoker = true) as
  select d.id as distributor_id, d.company, d.city, d.credit_limit, d.discount,
         coalesce(ach.achieved, 0) as achieved,
         coalesce(t.amount, 0)     as target,
         coalesce(dbt.debt, 0) + d.debt_adjustment as debt,
         greatest(0, d.credit_limit - (coalesce(dbt.debt, 0) + d.debt_adjustment)) as remaining_limit
  from public.distributors d
  left join public.targets t
    on t.distributor_id = d.id and t.period = public.current_half_year()
  left join lateral (
    select coalesce(sum(ot.total), 0) as achieved
    from public.order_totals ot
    where ot.distributor_id = d.id
      and ot.status = 'delivered'
      and public.half_year_of(ot.created_at::date) = public.current_half_year()
  ) ach on true
  left join lateral (
    select coalesce(sum(ot.total), 0)
           - coalesce((select sum(p.amount) from public.payments p where p.distributor_id = d.id), 0)
           as debt
    from public.order_totals ot
    where ot.distributor_id = d.id
      and ot.status in ('pending', 'confirmed', 'shipped', 'delivered')
  ) dbt on true;


-- Idempotent setup of the existing monthly opening system.
create table if not exists public.monthly_opening_debts (
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  month_start date not null,
  amount numeric(14,2) not null,
  captured_at timestamptz not null default now(),
  primary key(distributor_id,month_start)
);
alter table public.monthly_opening_debts enable row level security;
drop policy if exists monthly_opening_debts_read on public.monthly_opening_debts;
create policy monthly_opening_debts_read on public.monthly_opening_debts for select to authenticated
using (private.can_access_distributor(distributor_id));
revoke all on public.monthly_opening_debts from anon,authenticated;
grant select on public.monthly_opening_debts to authenticated;

create or replace function private.capture_monthly_opening_debts() returns void
language plpgsql security definer set search_path='' as $$
declare month_date date := date_trunc('month',now() at time zone 'Asia/Almaty')::date;
begin
  perform pg_advisory_xact_lock(9242026,1);
  insert into public.monthly_opening_debts(distributor_id,month_start,amount)
  select d.id,month_date,d.debt_adjustment
    + coalesce((select sum(o.total) from public.order_totals o
        where o.distributor_id=d.id and o.status in ('pending','confirmed','shipped','delivered')
          and o.created_at < (month_date::timestamp at time zone 'Asia/Almaty')),0)
    - coalesce((select sum(p.amount) from public.payments p
        where p.distributor_id=d.id and p.paid_at < month_date),0)
  from public.distributors d
  where not exists(select 1 from public.monthly_opening_debts m where m.distributor_id=d.id and m.month_start=month_date)
  on conflict do nothing;
end $$;
revoke all on function private.capture_monthly_opening_debts() from public,anon,authenticated;

create or replace function private.capture_opening_before_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.capture_monthly_opening_debts();
  return null;
end $$;
revoke all on function private.capture_opening_before_change() from public,anon,authenticated;
drop trigger if exists capture_opening_before_orders on public.orders;
create trigger capture_opening_before_orders before insert or update or delete on public.orders
for each statement execute function private.capture_opening_before_change();
drop trigger if exists capture_opening_before_items on public.order_items;
create trigger capture_opening_before_items before insert or update or delete on public.order_items
for each statement execute function private.capture_opening_before_change();
drop trigger if exists capture_opening_before_payments on public.payments;
create trigger capture_opening_before_payments before insert or update or delete on public.payments
for each statement execute function private.capture_opening_before_change();
drop trigger if exists capture_opening_before_distributors on public.distributors;
create trigger capture_opening_before_distributors before update or delete on public.distributors
for each statement execute function private.capture_opening_before_change();

create or replace function public.current_month_opening_debts()
returns table(distributor_id bigint,month_start date,amount numeric)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform private.capture_monthly_opening_debts();
  return query select m.distributor_id,m.month_start,m.amount from public.monthly_opening_debts m
    where m.month_start=date_trunc('month',now() at time zone 'Asia/Almaty')::date
      and private.can_access_distributor(m.distributor_id);
end $$;
revoke all on function public.current_month_opening_debts() from public,anon;
grant execute on function public.current_month_opening_debts() to authenticated;

-- 20261014090000_repair_payment_id_generation.sql
-- Repair installations where payments.id lost its identity/default generator.
-- Run this migration in Supabase SQL Editor; existing payments are preserved.

lock table public.payments in access exclusive mode;

do $$
declare
  identity_kind text;
  default_expression text;
  sequence_name text;
  next_id bigint;
begin
  select a.attidentity, pg_get_expr(d.adbin, d.adrelid)
    into identity_kind, default_expression
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.payments'::regclass
    and a.attname = 'id' and not a.attisdropped;

  if identity_kind is null then
    raise exception 'public.payments.id does not exist';
  end if;

  -- Leave working identity/serial generators untouched on subsequent runs.
  if identity_kind = '' and default_expression is null then
    alter table public.payments alter column id add generated always as identity;
    sequence_name := pg_get_serial_sequence('public.payments', 'id');
    select greatest(coalesce(max(id), 0) + 1, 1) into next_id from public.payments;
    perform setval(sequence_name::regclass, next_id, false);
    execute format('grant usage, select on sequence %s to authenticated, service_role', sequence_name);
  end if;
end;
$$;

-- Restore the other defaults declared by the transaction-table schema.
alter table public.payments
  alter column created_at set default now(),
  alter column paid_at set default current_date,
  alter column note set default '';

notify pgrst, 'reload schema';

-- 20261020090000_restore_payment_defaults.sql
-- Also repair databases that already applied the payment-ID migration.

alter table public.payments
  alter column created_at set default now(),
  alter column paid_at set default current_date,
  alter column note set default '';

notify pgrst, 'reload schema';

-- 20261020100000_monthly_debt_reports.sql
-- The limit belongs to the monthly record too; closed reports retain that limit.
alter table public.monthly_opening_debts add column if not exists credit_limit numeric(14,2);
alter table public.monthly_opening_debts add column if not exists closed_paid numeric(14,2);

create or replace function private.capture_monthly_opening_debts() returns void
language plpgsql security definer set search_path='' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'Asia/Almaty')::date;
begin
  perform pg_advisory_xact_lock(9242026,1);
  -- Fill missed months after the last stored opening. Never invent earlier history.
  insert into public.monthly_opening_debts(distributor_id,month_start,amount,credit_limit)
  select d.id, boundary.month_start::date,
    d.debt_adjustment
      + coalesce((select sum(o.total) from public.order_totals o
          where o.distributor_id=d.id and o.status in ('pending','confirmed','shipped','delivered')
            and o.created_at < (boundary.month_start::timestamp at time zone 'Asia/Almaty')),0)
      - coalesce((select sum(p.amount) from public.payments p
          where p.distributor_id=d.id and p.paid_at < boundary.month_start::date),0),
    d.credit_limit
  from public.distributors d
  cross join lateral generate_series(
    coalesce((select max(m.month_start) + interval '1 month'
              from public.monthly_opening_debts m where m.distributor_id=d.id), current_month::timestamp),
    current_month::timestamp, interval '1 month'
  ) as boundary(month_start)
  on conflict do nothing;

  -- Freeze payment totals once the following month is opened.
  update public.monthly_opening_debts m set closed_paid=coalesce((
    select sum(p.amount) from public.payments p where p.distributor_id=m.distributor_id
      and p.paid_at >= m.month_start and p.paid_at < (m.month_start + interval '1 month')::date
  ),0)
  where m.month_start < current_month and m.closed_paid is null;
end $$;

select private.capture_monthly_opening_debts();
update public.monthly_opening_debts m set credit_limit=d.credit_limit
from public.distributors d where d.id=m.distributor_id and m.credit_limit is null;

create or replace function public.monthly_debt_report(requested_month date)
returns table(distributor_id bigint,opening_debt numeric,paid numeric,debt numeric,credit_limit numeric)
language plpgsql security definer set search_path='' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'Asia/Almaty')::date;
  next_month date := (requested_month + interval '1 month')::date;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if requested_month is null or extract(day from requested_month) <> 1 or requested_month > current_month then
    raise exception 'Invalid report month';
  end if;
  perform private.capture_monthly_opening_debts();
  return query
    select m.distributor_id, m.amount,
      coalesce(m.closed_paid,(select sum(p.amount) from public.payments p
        where p.distributor_id=m.distributor_id and p.paid_at >= requested_month and p.paid_at < next_month),0),
      -- A closed month's final debt is exactly the next month's opening.
      case when requested_month=current_month then s.debt else following.amount end,
      case when requested_month=current_month then d.credit_limit else m.credit_limit end
    from public.monthly_opening_debts m
    join public.distributors d on d.id=m.distributor_id
    join public.distributor_stats s on s.distributor_id=m.distributor_id
    left join public.monthly_opening_debts following
      on following.distributor_id=m.distributor_id and following.month_start=next_month
    where m.month_start=requested_month and private.can_access_distributor(m.distributor_id);
end $$;
revoke all on function public.monthly_debt_report(date) from public,anon;
grant execute on function public.monthly_debt_report(date) to authenticated;

-- 19:00 UTC = midnight in Almaty. Idempotent daily execution also covers recovery.
create extension if not exists pg_cron;
do $$
begin
  if exists(select 1 from cron.job where jobname='monthly-debt-opening') then
    perform cron.unschedule('monthly-debt-opening');
  end if;
  perform cron.schedule('monthly-debt-opening','0 19 * * *',
    'select private.capture_monthly_opening_debts()');
end $$;

notify pgrst, 'reload schema';

-- 20261020110000_edit_month_opening_debt.sql
-- Preserve the original rollover amount used as the previous month's closing.
alter table public.monthly_opening_debts
  add column if not exists opening_correction numeric(14,2) not null default 0,
  -- Store the actor UUID without requiring a profiles.id uniqueness constraint.
  add column if not exists opening_modified_by uuid,
  add column if not exists opening_modified_at timestamptz;

create or replace function public.set_month_opening_debt(
  p_distributor_id bigint, p_month date, p_amount numeric, p_expected_amount numeric
) returns void
language plpgsql security definer set search_path='' as $$
declare
  current_month date := date_trunc('month',now() at time zone 'Asia/Almaty')::date;
  original_amount numeric;
  effective_amount numeric;
  new_amount numeric;
begin
  if auth.uid() is null or coalesce(private.my_role(),'') not in ('admin','manager')
     or not coalesce(private.can_access_distributor(p_distributor_id),false) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_month is null or p_month <> current_month then
    raise exception 'Only the current month can be edited' using errcode='22023';
  end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
     or abs(p_amount) > 999999999999.99 then
    raise exception 'Invalid opening debt' using errcode='22023';
  end if;
  new_amount := round(p_amount,2);
  perform pg_advisory_xact_lock(9242026,1);
  perform private.capture_monthly_opening_debts();
  perform 1 from public.distributors where id=p_distributor_id for update;
  select m.amount, m.amount+m.opening_correction into original_amount,effective_amount
    from public.monthly_opening_debts m
    where m.distributor_id=p_distributor_id and m.month_start=p_month for update;
  if not found then raise exception 'Monthly opening not found'; end if;
  if p_expected_amount is null or effective_amount <> p_expected_amount then
    raise exception 'Opening balance changed. Reload and retry.' using errcode='40001';
  end if;

  -- Both writes are atomic. Future automatic rollovers include this adjustment.
  update public.distributors set debt_adjustment=debt_adjustment+(new_amount-effective_amount)
    where id=p_distributor_id;
  update public.monthly_opening_debts
    set opening_correction=new_amount-original_amount,
        opening_modified_by=auth.uid(), opening_modified_at=now()
    where distributor_id=p_distributor_id and month_start=p_month;
end $$;
revoke all on function public.set_month_opening_debt(bigint,date,numeric,numeric) from public,anon;
grant execute on function public.set_month_opening_debt(bigint,date,numeric,numeric) to authenticated;

create or replace function public.current_month_opening_debts()
returns table(distributor_id bigint,month_start date,amount numeric)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform private.capture_monthly_opening_debts();
  return query select m.distributor_id,m.month_start,m.amount+m.opening_correction
    from public.monthly_opening_debts m
    where m.month_start=date_trunc('month',now() at time zone 'Asia/Almaty')::date
      and private.can_access_distributor(m.distributor_id);
end $$;

create or replace function public.monthly_debt_report(requested_month date)
returns table(distributor_id bigint,opening_debt numeric,paid numeric,debt numeric,credit_limit numeric)
language plpgsql security definer set search_path='' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'Asia/Almaty')::date;
  next_month date := (requested_month + interval '1 month')::date;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if requested_month is null or extract(day from requested_month) <> 1 or requested_month > current_month then
    raise exception 'Invalid report month';
  end if;
  perform private.capture_monthly_opening_debts();
  return query
    select m.distributor_id, m.amount+m.opening_correction,
      coalesce(m.closed_paid,(select sum(p.amount) from public.payments p
        where p.distributor_id=m.distributor_id and p.paid_at >= requested_month and p.paid_at < next_month),0),
      case when requested_month=current_month then s.debt else following.amount end,
      case when requested_month=current_month then d.credit_limit else m.credit_limit end
    from public.monthly_opening_debts m
    join public.distributors d on d.id=m.distributor_id
    join public.distributor_stats s on s.distributor_id=m.distributor_id
    left join public.monthly_opening_debts following
      on following.distributor_id=m.distributor_id and following.month_start=next_month
    where m.month_start=requested_month and private.can_access_distributor(m.distributor_id);
end $$;

notify pgrst, 'reload schema';

-- 20261020120000_align_current_month_debt.sql
-- Keep the current monthly report consistent with credit checks and distributor cards.

create or replace function public.monthly_debt_report(requested_month date)
returns table(distributor_id bigint,opening_debt numeric,paid numeric,debt numeric,credit_limit numeric)
language plpgsql security definer set search_path='' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'Asia/Almaty')::date;
  next_month date := (requested_month + interval '1 month')::date;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if requested_month is null or extract(day from requested_month) <> 1 or requested_month > current_month then
    raise exception 'Invalid report month';
  end if;
  perform private.capture_monthly_opening_debts();
  return query
    select m.distributor_id, m.amount+m.opening_correction,
      coalesce(m.closed_paid,(select sum(p.amount) from public.payments p
        where p.distributor_id=m.distributor_id and p.paid_at >= requested_month and p.paid_at < next_month),0),
      case when requested_month=current_month then s.debt else following.amount end,
      case when requested_month=current_month then d.credit_limit else m.credit_limit end
    from public.monthly_opening_debts m
    join public.distributors d on d.id=m.distributor_id
    join public.distributor_stats s on s.distributor_id=m.distributor_id
    left join public.monthly_opening_debts following
      on following.distributor_id=m.distributor_id and following.month_start=next_month
    where m.month_start=requested_month and private.can_access_distributor(m.distributor_id);
end $$;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
commit;

-- Verification: this job must exist and be active.
select jobname, schedule, active from cron.job where jobname='monthly-debt-opening';
select to_regprocedure('public.monthly_debt_report(date)') as monthly_report,
       to_regprocedure('public.set_month_opening_debt(bigint,date,numeric,numeric)') as opening_editor;
