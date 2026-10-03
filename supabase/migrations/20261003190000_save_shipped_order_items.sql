begin;

create or replace function public.save_shipped_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target_order public.orders%rowtype;
begin
  if auth.uid() is null or coalesce(private.my_role(), '') not in ('admin', 'manager') then
    raise exception 'Тапсырысты өңдеуге рұқсат жоқ';
  end if;
  select * into target_order from public.orders where id = p_order_id for update;
  if not found or target_order.status <> 'shipped'
     or not coalesce(private.can_access_distributor(target_order.distributor_id), false) then
    raise exception 'Жөнелтілген тапсырыс табылмады немесе рұқсат жоқ';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Кітаптар тізімі дұрыс емес';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Кемінде бір кітап қалуы керек';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items)
      as i(product_id bigint, qty numeric, unit_price numeric, discount numeric)
    where i.product_id is null or i.qty is null or i.qty < 1 or i.qty <> trunc(i.qty)
      or i.unit_price is null or i.unit_price < 0
      or i.discount is null or i.discount < 0 or i.discount > 1
      or not exists (select 1 from public.products p where p.id = i.product_id)
  ) then
    raise exception 'Кітаптың саны немесе бағасы дұрыс емес';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(product_id bigint)
      group by product_id having count(*) > 1
  ) then
    raise exception 'Кітап қайталанған';
  end if;

  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items(order_id, product_id, qty, unit_price, discount)
    select p_order_id, i.product_id, i.qty, round(i.unit_price, 2), i.discount
    from jsonb_to_recordset(p_items)
      as i(product_id bigint, qty int, unit_price numeric, discount numeric);
  insert into public.order_history(order_id, status, note, changed_by)
    values (p_order_id, 'shipped', 'Жөнелтілген тапсырыс өңделді: кітаптар, саны және бағасы жаңартылды', auth.uid());
end;
$$;

revoke all on function public.save_shipped_order_items(uuid, jsonb) from public, anon;
grant execute on function public.save_shipped_order_items(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
