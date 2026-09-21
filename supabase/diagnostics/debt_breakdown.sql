-- Read-only: separate each source of debt without multiplying orders by payments.
with orders_by_distributor as (
  select o.distributor_id,
    coalesce(sum(i.amount) filter (where o.status = 'pending'), 0) as pending,
    coalesce(sum(i.amount) filter (where o.status in ('confirmed','shipped','delivered')), 0) as accepted,
    coalesce(sum(i.amount) filter (where p.barcode = 'OPENING-BALANCE'), 0) as opening_balance_in_orders,
    coalesce(sum(round(i.qty * i.unit_price, 2) - coalesce(i.amount, 0)), 0) as amount_difference
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  left join public.products p on p.id = i.product_id
  where o.status in ('pending','confirmed','shipped','delivered')
  group by o.distributor_id
), payments_by_distributor as (
  select distributor_id, sum(amount) as paid
  from public.payments group by distributor_id
)
select d.id, d.company,
  coalesce(o.pending, 0) as pending,
  coalesce(o.accepted, 0) as accepted,
  coalesce(o.opening_balance_in_orders, 0) as opening_included,
  d.debt_adjustment as adjustment,
  coalesce(p.paid, 0) as paid,
  coalesce(o.pending, 0) + coalesce(o.accepted, 0)
    + d.debt_adjustment - coalesce(p.paid, 0) as calculated_debt,
  s.debt as displayed_debt,
  coalesce(o.amount_difference, 0) as amount_difference
from public.distributors d
left join orders_by_distributor o on o.distributor_id = d.id
left join payments_by_distributor p on p.distributor_id = d.id
left join public.distributor_stats s on s.distributor_id = d.id
order by calculated_debt desc;
