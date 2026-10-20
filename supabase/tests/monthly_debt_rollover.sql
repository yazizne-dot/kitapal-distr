-- Run only against a migrated test database; fixtures are rolled back.
begin;
do $$
declare
  dist bigint;
  product bigint;
  ord uuid;
  this_month date := date_trunc('month',now() at time zone 'Asia/Almaty')::date;
  previous_month date := (this_month - interval '1 month')::date;
  actual numeric;
begin
  insert into public.distributors(company,city,credit_limit,debt_adjustment)
    values ('Monthly regression','Test',1000,100) returning id into dist;
  insert into public.products(name,barcode,base_price)
    values ('Monthly regression','monthly-test-' || dist,100) returning id into product;
  insert into public.orders(distributor_id,status,created_at)
    values (dist,'pending',previous_month::timestamp at time zone 'Asia/Almaty') returning id into ord;
  insert into public.order_items(order_id,product_id,qty,unit_price)
    values (ord,product,2,100);
  insert into public.payments(distributor_id,amount,paid_at) values (dist,50,previous_month);
  -- Arrange the last saved month, simulating the scheduler crossing a boundary.
  delete from public.monthly_opening_debts where distributor_id=dist;
  insert into public.monthly_opening_debts(distributor_id,month_start,amount,credit_limit)
    values (dist,previous_month,100,1000);
  perform private.capture_monthly_opening_debts();
  select amount into actual from public.monthly_opening_debts
    where distributor_id=dist and month_start=this_month;
  assert actual=250, 'Opening must include previous debt + orders - payments';
  select closed_paid into actual from public.monthly_opening_debts
    where distributor_id=dist and month_start=previous_month;
  assert actual=50, 'Closed month stores only its own payments';
  insert into public.payments(distributor_id,amount,paid_at) values (dist,25,this_month);
  perform private.capture_monthly_opening_debts();
  select amount into actual from public.monthly_opening_debts
    where distributor_id=dist and month_start=this_month;
  assert actual=250, 'Current payments must not overwrite the opening';
  assert (select count(*)=2 from public.monthly_opening_debts where distributor_id=dist),
    'Repeated capture must not duplicate monthly records';
  assert exists(select 1 from cron.job where jobname='monthly-debt-opening'), 'Scheduler must be installed';
end $$;
rollback;
