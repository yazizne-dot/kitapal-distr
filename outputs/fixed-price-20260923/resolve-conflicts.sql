begin;
do $$ begin
  if not exists(select 1 from public.products where id=754 and barcode='9786017604530' and base_price=4250 and discount_override=0.33) then
    raise exception 'Ramazan product changed since review';
  end if;
  if not exists(select 1 from public.products where id=1341 and name='Азбука корана Алифба и таджид' and barcode='NO-BARCODE-1348' and base_price=530 and discount_override=0.15) then
    raise exception 'Azbuka product changed since review';
  end if;
end $$;
create temporary table financial_before on commit drop as
select (select sum(debt) from public.distributor_stats) as debt,
       (select sum(amount) from public.order_items) as orders,
       (select sum(amount) from public.payments) as payments;
update public.products set base_price=3500, discount_override=0.15 where id=754;
do $$ begin
  if exists(select 1 from financial_before b where
    b.debt is distinct from (select sum(debt) from public.distributor_stats) or
    b.orders is distinct from (select sum(amount) from public.order_items) or
    b.payments is distinct from (select sum(amount) from public.payments)) then
    raise exception 'Financial data changed during update';
  end if;
end $$;
select id,name,barcode,base_price,discount_override from public.products where id in (754,1341,1489) order by id;
commit;
