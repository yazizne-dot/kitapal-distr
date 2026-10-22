-- Run in a migrated test database. All fixtures are rolled back.
begin;
do $$
declare
  manager uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid();
  dist bigint; book bigint; ord uuid; new_ord uuid; line bigint;
  actual numeric;
begin
  insert into auth.users(id) values(manager),(buyer);
  insert into public.profiles(id,full_name,role) values
    (manager,'Catalogue manager test','manager'),(buyer,'Catalogue buyer test','distributor');
  insert into public.distributors(company,city,manager_id) values('Catalogue test','Test',manager) returning id into dist;
  update public.profiles set distributor_id=dist where id=buyer;
  insert into public.products(name,barcode,publisher,base_price)
    values('Historical book','archive-test-'||dist,'Publisher',3000) returning id into book;
  insert into public.orders(distributor_id,status) values(dist,'pending') returning id into ord;
  insert into public.order_items(order_id,product_id,qty,unit_price,discount)
    values(ord,book,2,1800,0.4) returning id into line;
  perform set_config('request.jwt.claim.sub',manager::text,true);
  perform public.set_product_price_and_pack_size(book,5250,12);
  select base_price into actual from public.products where id=book;
  assert actual=5250, 'Manager must be able to change an existing catalogue price';
  select total into actual from public.order_totals where order_id=ord;
  assert actual=3600, 'Catalogue price change must preserve the agreed order amount';
  perform public.archive_product(book);
  assert exists(select 1 from public.products where id=book and archived_at is not null), 'Product row must survive archival';
  assert not exists(select 1 from public.products where id=book and archived_at is null), 'Archived books must not appear in the active price list';
  assert exists(select 1 from public.order_items i join public.products p on p.id=i.product_id
    where i.id=line and p.name='Historical book' and i.unit_price=1800 and i.qty=2), 'Historical name, quantity and price must survive archival';
  select total into actual from public.order_totals where order_id=ord;
  assert actual=3600, 'Archival must not change order totals';
  insert into public.orders(distributor_id,status) values(dist,'pending') returning id into new_ord;
  begin
    insert into public.order_items(order_id,product_id,qty,unit_price) values(new_ord,book,1,3000);
    raise exception 'A new order accepted an archived book';
  exception when invalid_parameter_value then null;
  end;
  -- Shipped edits can reinsert a historical archived line without breaking its FK.
  update public.orders set status='shipped' where id=ord;
  delete from public.order_items where id=line;
  insert into public.order_items(order_id,product_id,qty,unit_price,discount) values(ord,book,2,1800,0.4);
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  begin
    perform public.archive_product(book);
    raise exception 'Distributor archive was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_product_price_and_pack_size(book,6000,null);
    raise exception 'Distributor price edit was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
