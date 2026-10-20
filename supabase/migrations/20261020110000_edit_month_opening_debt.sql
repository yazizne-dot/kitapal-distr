begin;

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
commit;
