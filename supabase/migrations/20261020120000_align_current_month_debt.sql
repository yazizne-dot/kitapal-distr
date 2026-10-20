-- Keep the current monthly report consistent with credit checks and distributor cards.
begin;

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
