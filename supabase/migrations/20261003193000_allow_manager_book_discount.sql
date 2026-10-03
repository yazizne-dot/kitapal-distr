begin;
drop policy if exists products_manager_insert on public.products;
create policy products_manager_insert on public.products
  for insert to authenticated
  with check (
    private.my_role() = 'manager'
    and (discount_override is null or discount_override between 0 and 1)
  );
commit;
