-- Restore the relationships used by the nested order-list query.
-- Existing matching foreign keys are left in place. No rows are removed.
begin;

-- Referenced IDs must be unique before foreign keys can be restored.
-- PostgreSQL rejects duplicates; this script never removes or renumbers rows.
do $$
declare
  table_to_fix text;
  id_column smallint;
begin
  foreach table_to_fix in array array['orders', 'products'] loop
    select attnum into id_column from pg_attribute
      where attrelid = format('public.%I', table_to_fix)::regclass
        and attname = 'id' and not attisdropped;
    if not exists (
      select 1 from pg_index
      where indrelid = format('public.%I', table_to_fix)::regclass
        and indisunique and indisvalid and indimmediate
        and indpred is null and indexprs is null
        and indnkeyatts = 1 and indkey[0] = id_column
    ) then
      execute format('alter table public.%I add constraint %I unique (id)',
        table_to_fix, table_to_fix || '_id_unique_restore');
    end if;
  end loop;
end;
$$;

do $$
declare
  relation record;
  source_column smallint;
  target_column smallint;
begin
  for relation in
    select * from (values
      ('order_items', 'order_id', 'orders', 'id', 'order_items_order_id_fkey', 'cascade'),
      ('order_items', 'product_id', 'products', 'id', 'order_items_product_id_fkey', 'no action'),
      ('order_history', 'order_id', 'orders', 'id', 'order_history_order_id_fkey', 'cascade')
    ) as relations(source_table, source_field, target_table, target_field, constraint_name, delete_action)
  loop
    select attnum into source_column from pg_attribute
      where attrelid = format('public.%I', relation.source_table)::regclass
        and attname = relation.source_field and not attisdropped;
    select attnum into target_column from pg_attribute
      where attrelid = format('public.%I', relation.target_table)::regclass
        and attname = relation.target_field and not attisdropped;
    if not exists (
      select 1 from pg_constraint
      where contype = 'f'
        and conrelid = format('public.%I', relation.source_table)::regclass
        and confrelid = format('public.%I', relation.target_table)::regclass
        and conkey = array[source_column] and confkey = array[target_column]
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I (%I) on delete %s',
        relation.source_table, relation.constraint_name, relation.source_field,
        relation.target_table, relation.target_field, relation.delete_action);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;

select conrelid::regclass as source_table, conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid in ('public.order_items'::regclass, 'public.order_history'::regclass)
order by source_table, conname;
