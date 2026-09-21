-- unit_price already includes the discount. Keep legacy, ordinary amount columns
-- in sync; modern generated columns already enforce qty * unit_price.
begin;
create or replace function public.sync_order_item_amount()
returns trigger language plpgsql set search_path = public as $$
begin
  new.amount := round(new.qty * new.unit_price, 2);
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_items'
      and column_name = 'amount' and is_generated = 'NEVER'
  ) then
    execute 'drop trigger if exists trg_sync_order_item_amount on public.order_items';
    execute 'create trigger trg_sync_order_item_amount before insert or update on public.order_items
             for each row execute function public.sync_order_item_amount()';
    update public.order_items set amount = round(qty * unit_price, 2)
      where amount is distinct from round(qty * unit_price, 2);
  end if;
end;
$$;
commit;
