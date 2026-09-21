-- Run after migrations against a test database. All fixtures are rolled back.
begin;
do $$
declare
  dist bigint;
  product bigint;
  ord uuid;
  actual numeric;
  state text;
begin
  insert into public.distributors(company, city, credit_limit, debt_adjustment)
    values ('Debt regression', 'Test', 1000, 50) returning id into dist;
  insert into public.products(name, barcode, base_price)
    values ('Debt regression', 'debt-test-' || dist, 100) returning id into product;
  insert into public.orders(distributor_id, status)
    values (dist, 'pending') returning id into ord;
  insert into public.order_items(order_id, product_id, qty, unit_price)
    values (ord, product, 2, 100);

  foreach state in array array['pending', 'confirmed', 'shipped', 'delivered'] loop
    update public.orders set status = state where id = ord;
    select debt into actual from public.distributor_stats where distributor_id = dist;
    assert actual = 250, 'Submitted order must count exactly once: ' || state;
  end loop;
  foreach state in array array['draft', 'cancelled'] loop
    update public.orders set status = state where id = ord;
    select debt into actual from public.distributor_stats where distributor_id = dist;
    assert actual = 50, 'Excluded status must preserve adjustment: ' || state;
  end loop;

  update public.orders set status = 'pending' where id = ord;
  update public.order_items set qty = 3 where order_id = ord;
  insert into public.payments(distributor_id, amount) values (dist, 75);
  select debt into actual from public.distributor_stats where distributor_id = dist;
  assert actual = 275, 'Quantity edits and payments must update debt';
  select remaining_limit into actual from public.distributor_stats where distributor_id = dist;
  assert actual = 725, 'Pending orders must reduce available credit';
  select achieved into actual from public.distributor_stats where distributor_id = dist;
  assert actual = 0, 'Pending orders must not count as delivered sales';

  delete from public.orders where id = ord;
  select debt into actual from public.distributor_stats where distributor_id = dist;
  assert actual = -25, 'Deleting an order must release its debt and preserve payment credit';
end $$;
rollback;
