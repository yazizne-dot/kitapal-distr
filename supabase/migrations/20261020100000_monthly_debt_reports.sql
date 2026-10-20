begin;

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
commit;
