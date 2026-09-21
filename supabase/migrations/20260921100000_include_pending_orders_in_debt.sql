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
