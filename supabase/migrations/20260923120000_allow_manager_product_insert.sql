-- Managers can add books that inherit the distributor discount.
-- Existing admin permissions and product editing/deletion policies are unchanged.
drop policy if exists products_manager_insert on public.products;
create policy products_manager_insert on public.products
  for insert to authenticated
  with check (private.my_role() = 'manager' and discount_override is null);
