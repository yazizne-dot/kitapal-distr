begin;

-- Move RLS helper functions out of the API-exposed `public` schema into `private`
-- (clears advisor 0028/0029: helpers were callable via /rest/v1/rpc/...).
-- RLS can still call them; PostgREST does not expose the `private` schema.

create schema if not exists private;
grant usage on schema private to authenticated, anon;

create or replace function private.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function private.my_distributor_id()
returns bigint language sql stable security definer set search_path = public as $$
  select distributor_id from public.profiles where id = auth.uid();
$$;

create or replace function private.can_access_distributor(d_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case private.my_role()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from public.distributors d where d.id = d_id and d.manager_id = auth.uid())
    when 'distributor' then d_id = private.my_distributor_id()
    else false
  end;
$$;



drop policy if exists order_items_manager_write on public.order_items;
create policy order_items_manager_write on public.order_items for all
  using (private.my_role() = 'manager' and exists (
    select 1 from public.orders o
    where o.id = order_id and private.can_access_distributor(o.distributor_id)
      and o.status in ('draft', 'pending', 'confirmed', 'shipped')))
  with check (private.my_role() = 'manager' and exists (
    select 1 from public.orders o
    where o.id = order_id and private.can_access_distributor(o.distributor_id)
      and o.status in ('draft', 'pending', 'confirmed', 'shipped')));

update public.distributors set company = 'Нұртас'
where company = 'Сабитова Нұртас';


drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items for all
  using (private.my_role() = 'admin')
  with check (private.my_role() = 'admin');

commit;
