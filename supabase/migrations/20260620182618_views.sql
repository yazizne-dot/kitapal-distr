-- Computed views (all with security_invoker so RLS of the caller applies through them)

create view public.order_totals
  with (security_invoker = true) as
  select o.id as order_id, o.distributor_id, o.status, o.created_at,
         coalesce(sum(i.amount), 0) as total
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  group by o.id;

create view public.distributor_stats
  with (security_invoker = true) as
  select d.id as distributor_id, d.company, d.city, d.credit_limit, d.discount,
         coalesce(ach.achieved, 0) as achieved,
         coalesce(t.amount, 0)     as target,
         coalesce(dbt.debt, 0)     as debt,
         greatest(0, d.credit_limit - coalesce(dbt.debt, 0)) as remaining_limit
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
      and ot.status in ('confirmed', 'shipped', 'delivered')
  ) dbt on true;

create view public.notifications
  with (security_invoker = true) as
  -- limit exceeded
  select 'danger'::text as type, s.distributor_id, 'Лимит асылды'::text as title,
         s.company || ' (' || s.city || ') — қарыз ' || round(s.debt)::text ||
         ' ₸, лимит ' || round(s.credit_limit)::text || ' ₸' as body,
         current_date as date
  from public.distributor_stats s
  where s.debt > s.credit_limit
  union all
  -- limit warning (80%+ but not over)
  select 'warning', s.distributor_id, 'Лимит ескертуі',
         s.company || ' (' || s.city || ') — лимиттің ' ||
         round(s.debt / nullif(s.credit_limit, 0) * 100)::text || '% қолданылды',
         current_date
  from public.distributor_stats s
  where s.credit_limit > 0 and s.debt > s.credit_limit * 0.8 and s.debt <= s.credit_limit
  union all
  -- close to target
  select 'success', s.distributor_id, 'Мақсатқа жақын',
         s.company || ' — мақсаттың ' ||
         round(s.achieved / nullif(s.target, 0) * 100)::text || '% орындалды',
         current_date
  from public.distributor_stats s
  where s.target > 0 and s.achieved >= s.target * 0.8 and s.achieved < s.target
  union all
  -- pending orders awaiting confirmation
  select 'info', ot.distributor_id, 'Тапсырыс расталуды күтуде',
         ot.order_id::text || ' — ' || round(ot.total)::text || ' ₸', ot.created_at::date
  from public.order_totals ot
  where ot.status = 'pending'
  union all
  -- manager/admin messages
  select 'info', m.distributor_id, 'Хабарлама', m.body, m.created_at::date
  from public.messages m;
