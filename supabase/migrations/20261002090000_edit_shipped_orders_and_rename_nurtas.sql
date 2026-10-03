begin;

drop policy if exists order_items_manager_write on public.order_items;
create policy order_items_manager_write on public.order_items for all
  using (private.my_role() = 'manager' and exists (
    select 1 from public.orders o
    where o.id = order_id and private.can_access_distributor(o.distributor_id)
      and o.status in ('draft', 'pending', 'confirmed', 'shipped')))
  with check (private.my_role() = 'manager' and exists (
    select 1 from public.orders o
    where o.id = order_id and private.can_access_distributor(o.distributor_id)
      and o.status in ('draft', 'pending', 'confirmed', 'shipped')));

update public.distributors set company = 'Нұртас'
where company = 'Сабитова Нұртас';

commit;
