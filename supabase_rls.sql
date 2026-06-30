-- ============================================================
-- Kitapal — 2-қадам: RLS + саясаттар
-- ТЕК Supabase SQL Editor-да жүргізіңіз!
-- (auth.uid() функциясы тек Supabase ортасында бар)
-- Алдын ала supabase_schema.sql жүргізілген болуы керек.
-- ============================================================

-- RLS қосу
alter table public.profiles       enable row level security;
alter table public.distributors   enable row level security;
alter table public.products       enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.order_history  enable row level security;
alter table public.payments       enable row level security;
alter table public.messages       enable row level security;
alter table public.notifications  enable row level security;

-- Көмекші функциялар
drop function if exists public.current_role()           cascade;
drop function if exists public.current_distributor_id() cascade;

create or replace function public.current_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_distributor_id()
returns bigint language sql stable security definer as $$
  select distributor_id from public.profiles where id = auth.uid()
$$;

-- profiles
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.current_role() in ('admin','manager'));
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid());

-- distributors
create policy "distributors_select" on public.distributors for select
  using (public.current_role() in ('admin','manager') or id = public.current_distributor_id());
create policy "distributors_write" on public.distributors for all
  using (public.current_role() in ('admin','manager'));

-- products
create policy "products_select" on public.products for select
  using (auth.uid() is not null);
create policy "products_write" on public.products for all
  using (public.current_role() in ('admin','manager'));

-- orders
create policy "orders_select" on public.orders for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "orders_insert" on public.orders for insert
  with check (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "orders_update" on public.orders for update
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "orders_delete" on public.orders for delete
  using (public.current_role() in ('admin','manager')
    or (distributor_id = public.current_distributor_id() and status in ('cancelled', 'draft')));

-- order_items
create policy "order_items_select" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (public.current_role() in ('admin','manager') or o.distributor_id = public.current_distributor_id())));
create policy "order_items_write" on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and
    (public.current_role() in ('admin','manager') or o.distributor_id = public.current_distributor_id())));

-- order_history
create policy "order_history_select" on public.order_history for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (public.current_role() in ('admin','manager') or o.distributor_id = public.current_distributor_id())));
create policy "order_history_insert" on public.order_history for insert
  with check (public.current_role() in ('admin','manager')
    or exists (select 1 from public.orders o where o.id = order_id
                 and o.distributor_id = public.current_distributor_id()));
-- Distributors need delete permission so CASCADE from orders.delete works
create policy "order_history_delete" on public.order_history for delete
  using (public.current_role() in ('admin','manager')
    or exists (select 1 from public.orders o where o.id = order_id
                 and o.distributor_id = public.current_distributor_id()));

-- payments
create policy "payments_select" on public.payments for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "payments_write" on public.payments for all
  using (public.current_role() in ('admin','manager'));

-- messages
create policy "messages_select" on public.messages for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "messages_insert" on public.messages for insert
  with check (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());

-- notifications
create policy "notifications_select" on public.notifications for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id()
    or distributor_id is null);
create policy "notifications_write" on public.notifications for all
  using (public.current_role() in ('admin','manager'));
