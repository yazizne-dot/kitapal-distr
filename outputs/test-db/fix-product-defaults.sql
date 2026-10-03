-- Restore product defaults lost during the test database copy.
begin;
lock table public.products in access exclusive mode;
alter table public.products alter column created_at set default now();
alter table public.products alter column publisher set default '';
alter table public.products alter column category set default '';

do $$
declare
  table_to_fix text;
  identity_flag text;
  default_value text;
  sequence_name text;
  highest_id bigint;
  sequence_value bigint;
begin
  foreach table_to_fix in array array['products'] loop
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

commit;

select column_name, column_default, is_identity
from information_schema.columns
where table_schema = 'public' and table_name = 'products'
  and column_name in ('id', 'created_at');
