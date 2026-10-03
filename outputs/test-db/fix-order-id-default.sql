-- Restore automatic fields lost when copying the test database.
begin;
lock table public.orders, public.order_items, public.order_history in access exclusive mode;

alter table public.orders alter column id set default gen_random_uuid();
alter table public.orders alter column created_at set default now();
alter table public.orders alter column status set default 'pending';
alter table public.order_history alter column changed_at set default now();
alter table public.order_history alter column note set default '';
alter table public.order_items alter column discount set default 0;

-- Restore missing identities, then advance their sequences beyond copied IDs.
do $$
declare
  table_to_fix text;
  identity_flag text;
  default_value text;
  sequence_name text;
  highest_id bigint;
  sequence_value bigint;
begin
  foreach table_to_fix in array array['order_items', 'order_history'] loop
    select is_identity, column_default into identity_flag, default_value
    from information_schema.columns
    where table_schema = 'public' and table_name = table_to_fix and column_name = 'id';
    if identity_flag = 'NO' and default_value is null then
      execute format('alter table public.%I alter column id add generated always as identity', table_to_fix);
    end if;
    sequence_name := pg_get_serial_sequence(format('public.%I', table_to_fix), 'id');
    if sequence_name is not null then
      execute format('select coalesce(max(id), 0) from public.%I', table_to_fix) into highest_id;
      execute format('select last_value from %s', sequence_name::regclass) into sequence_value;
      perform setval(sequence_name::regclass, greatest(highest_id + 1, sequence_value + 1), false);
    end if;
  end loop;
end;
$$;

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

-- Check defaults and generated columns used when creating an order.
select table_name, column_name, data_type, column_default,
       is_identity, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders', 'order_items', 'order_history')
order by table_name, ordinal_position;
