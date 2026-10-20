-- Repair installations where payments.id lost its identity/default generator.
-- Run this migration in Supabase SQL Editor; existing payments are preserved.
begin;

lock table public.payments in access exclusive mode;

do $$
declare
  identity_kind text;
  default_expression text;
  sequence_name text;
  next_id bigint;
begin
  select a.attidentity, pg_get_expr(d.adbin, d.adrelid)
    into identity_kind, default_expression
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.payments'::regclass
    and a.attname = 'id' and not a.attisdropped;

  if identity_kind is null then
    raise exception 'public.payments.id does not exist';
  end if;

  -- Leave working identity/serial generators untouched on subsequent runs.
  if identity_kind = '' and default_expression is null then
    alter table public.payments alter column id add generated always as identity;
    sequence_name := pg_get_serial_sequence('public.payments', 'id');
    select greatest(coalesce(max(id), 0) + 1, 1) into next_id from public.payments;
    perform setval(sequence_name::regclass, next_id, false);
    execute format('grant usage, select on sequence %s to authenticated, service_role', sequence_name);
  end if;
end;
$$;

-- Restore the other defaults declared by the transaction-table schema.
alter table public.payments
  alter column created_at set default now(),
  alter column paid_at set default current_date,
  alter column note set default '';

notify pgrst, 'reload schema';
commit;
