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

-- ---- Repoint every policy from public.* helpers to private.* ----
-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (private.my_role() in ('admin','manager') or id = auth.uid());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');

-- distributors
drop policy if exists distributors_select on public.distributors;
create policy distributors_select on public.distributors for select
  using (private.can_access_distributor(id));
drop policy if exists distributors_admin_write on public.distributors;
create policy distributors_admin_write on public.distributors for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');

-- products
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');

-- targets
drop policy if exists targets_select on public.targets;
create policy targets_select on public.targets for select
  using (private.can_access_distributor(distributor_id));
drop policy if exists targets_admin_write on public.targets;
create policy targets_admin_write on public.targets for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');

-- orders
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (private.can_access_distributor(distributor_id));
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
drop policy if exists orders_distributor_insert on public.orders;
create policy orders_distributor_insert on public.orders for insert
  with check (private.my_role() = 'distributor' and distributor_id = private.my_distributor_id());
drop policy if exists orders_distributor_cancel on public.orders;
create policy orders_distributor_cancel on public.orders for update
  using (private.my_role() = 'distributor' and distributor_id = private.my_distributor_id()
         and status in ('draft','pending'))
  with check (distributor_id = private.my_distributor_id()
         and status in ('draft','pending','cancelled'));
drop policy if exists orders_manager_update on public.orders;
create policy orders_manager_update on public.orders for update
  using (private.my_role() = 'manager' and private.can_access_distributor(distributor_id))
  with check (private.my_role() = 'manager' and private.can_access_distributor(distributor_id));

-- order_items
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and private.can_access_distributor(o.distributor_id)));
drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
drop policy if exists order_items_distributor_write on public.order_items;
create policy order_items_distributor_write on public.order_items for all
  using (private.my_role() = 'distributor' and exists (
           select 1 from public.orders o
           where o.id = order_id and o.distributor_id = private.my_distributor_id()
             and o.status in ('draft','pending')))
  with check (private.my_role() = 'distributor' and exists (
           select 1 from public.orders o
           where o.id = order_id and o.distributor_id = private.my_distributor_id()
             and o.status in ('draft','pending')));

-- order_history
drop policy if exists order_history_select on public.order_history;
create policy order_history_select on public.order_history for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and private.can_access_distributor(o.distributor_id)));
drop policy if exists order_history_write on public.order_history;
create policy order_history_write on public.order_history for insert
  with check (exists (select 1 from public.orders o
                 where o.id = order_id and private.can_access_distributor(o.distributor_id)));

-- payments
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (private.can_access_distributor(distributor_id));
drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all on public.payments for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
drop policy if exists payments_manager_insert on public.payments;
create policy payments_manager_insert on public.payments for insert
  with check (private.my_role() = 'manager' and private.can_access_distributor(distributor_id));

-- messages
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (private.can_access_distributor(distributor_id));
drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all on public.messages for all
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
drop policy if exists messages_manager_insert on public.messages;
create policy messages_manager_insert on public.messages for insert
  with check (private.my_role() = 'manager' and private.can_access_distributor(distributor_id));

-- ---- Drop the now-unused public helpers ----
drop function if exists public.can_access_distributor(bigint);
drop function if exists public.my_distributor_id();
drop function if exists public.my_role();

-- ---- Reconcile stray leftover from an earlier Supabase quickstart ----
-- on_auth_user_created -> handle_new_user() inserts into profiles(id, NAME, role); our table
-- has full_name, not name, so this trigger would break auth-user creation. Remove both;
-- Plan 2A creates profiles explicitly in scripts/create-auth-users.mjs.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
