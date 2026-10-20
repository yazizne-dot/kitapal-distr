-- Execute in a migrated test Supabase database; all fixtures are rolled back.
begin;
do $$
declare
  manager uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  dist bigint;
  this_month date := date_trunc('month',now() at time zone 'Asia/Almaty')::date;
  previous_month date := (this_month-interval '1 month')::date;
  actual numeric;
begin
  insert into auth.users(id) values(manager),(buyer);
  insert into public.profiles(id,full_name,role) values
    (manager,'Opening edit test','manager'),(buyer,'Opening buyer test','distributor');
  insert into public.distributors(company,city,credit_limit,debt_adjustment,manager_id)
    values('Opening edit regression','Test',1000,100,manager) returning id into dist;
  update public.profiles set distributor_id=dist where id=buyer;
  perform private.capture_monthly_opening_debts();
  insert into public.monthly_opening_debts(distributor_id,month_start,amount,credit_limit,closed_paid)
    values(dist,previous_month,100,1000,0);
  perform set_config('request.jwt.claim.sub',manager::text,true);
  perform public.set_month_opening_debt(dist,this_month,150,100);
  select opening_debt into actual from public.monthly_debt_report(this_month) where distributor_id=dist;
  assert actual=150, 'Manager must be able to update the current opening';
  select debt into actual from public.monthly_debt_report(this_month) where distributor_id=dist;
  assert actual=150, 'Current debt must increase by exactly the opening difference';
  select debt into actual from public.monthly_debt_report(previous_month) where distributor_id=dist;
  assert actual=100, 'Previous closing debt must remain unchanged';
  perform public.set_month_opening_debt(dist,this_month,180,150);
  select debt_adjustment into actual from public.distributors where id=dist;
  assert actual=180, 'Repeated edits must apply only the new difference';
  begin
    perform public.set_month_opening_debt(dist,this_month,200,150);
    raise exception 'Stale edit was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.set_month_opening_debt(dist,previous_month,200,100);
    raise exception 'Closed month edit was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_month_opening_debt(dist,this_month,'NaN'::numeric,180);
    raise exception 'NaN was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  begin
    perform public.set_month_opening_debt(dist,this_month,200,180);
    raise exception 'Distributor edit was accepted';
  exception when insufficient_privilege then null;
  end;
  select debt_adjustment into actual from public.distributors where id=dist;
  assert actual=180, 'Rejected edits must not change the balance';
  insert into public.payments(distributor_id,amount,paid_at)
    values(dist,30,(this_month+interval '1 month')::date);
  perform set_config('request.jwt.claim.sub',manager::text,true);
  select debt into actual from public.monthly_debt_report(this_month) where distributor_id=dist;
  assert actual=(select debt from public.distributor_stats where distributor_id=dist),
    'Current monthly report must match live debt even for future-dated payments';
  assert exists(select 1 from public.monthly_opening_debts where distributor_id=dist
    and month_start=this_month and opening_modified_by=manager), 'The editor must be recorded';
end $$;
rollback;
