-- Allow a real order delete from either side of the shared order list.
-- Deleting from public.orders cascades to order_items and order_history.

drop policy if exists orders_shared_delete on public.orders;
create policy orders_shared_delete on public.orders for delete
  using (
    private.my_role() = 'admin'
    or (private.my_role() = 'manager' and private.can_access_distributor(distributor_id))
    or (private.my_role() = 'distributor' and distributor_id = private.my_distributor_id()
        and status in ('pending', 'draft', 'cancelled'))
  );
