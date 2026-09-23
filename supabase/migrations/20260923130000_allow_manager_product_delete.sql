-- order_items.product_id has a non-cascading FK, so used books cannot be deleted.
drop policy if exists products_manager_delete on public.products;
create policy products_manager_delete on public.products
  for delete to authenticated
  using (private.my_role() = 'manager' and barcode <> 'OPENING-BALANCE');
