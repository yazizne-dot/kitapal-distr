begin;
create table public.monthly_opening_debts (
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  month_start date not null,
  amount numeric(14,2) not null,
  captured_at timestamptz not null default now(),
  primary key(distributor_id,month_start)
);
alter table public.monthly_opening_debts enable row level security;
create policy monthly_opening_debts_read on public.monthly_opening_debts for select to authenticated
using (private.can_access_distributor(distributor_id));
revoke all on public.monthly_opening_debts from anon,authenticated;
grant select on public.monthly_opening_debts to authenticated;

create function private.capture_monthly_opening_debts() returns void
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

create function private.capture_opening_before_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.capture_monthly_opening_debts();
  return null;
end $$;
revoke all on function private.capture_opening_before_change() from public,anon,authenticated;
create trigger capture_opening_before_orders before insert or update or delete on public.orders
for each statement execute function private.capture_opening_before_change();
create trigger capture_opening_before_items before insert or update or delete on public.order_items
for each statement execute function private.capture_opening_before_change();
create trigger capture_opening_before_payments before insert or update or delete on public.payments
for each statement execute function private.capture_opening_before_change();
create trigger capture_opening_before_distributors before update or delete on public.distributors
for each statement execute function private.capture_opening_before_change();

create function public.current_month_opening_debts()
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
select private.capture_monthly_opening_debts();
commit;
