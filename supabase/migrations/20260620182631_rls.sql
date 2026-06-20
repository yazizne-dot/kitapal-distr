-- Row Level Security: enable on all app tables + policies per role matrix

alter table public.distributors  enable row level security;
alter table public.profiles      enable row level security;
alter table public.products      enable row level security;
alter table public.targets       enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.order_history enable row level security;
alter table public.payments      enable row level security;
alter table public.messages      enable row level security;

-- profiles
create policy profiles_select on public.profiles for select
  using (public.my_role() in ('admin','manager') or id = auth.uid());
create policy profiles_admin_write on public.profiles for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- distributors
create policy distributors_select on public.distributors for select
  using (public.can_access_distributor(id));
create policy distributors_admin_write on public.distributors for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- products: everyone reads, only admin writes
create policy products_select on public.products for select using (true);
create policy products_admin_write on public.products for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- targets
create policy targets_select on public.targets for select
  using (public.can_access_distributor(distributor_id));
create policy targets_admin_write on public.targets for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- orders
create policy orders_select on public.orders for select
  using (public.can_access_distributor(distributor_id));
create policy orders_admin_all on public.orders for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy orders_distributor_insert on public.orders for insert
  with check (public.my_role() = 'distributor' and distributor_id = public.my_distributor_id());
-- distributor may cancel own draft/pending order
create policy orders_distributor_cancel on public.orders for update
  using (public.my_role() = 'distributor' and distributor_id = public.my_distributor_id()
         and status in ('draft','pending'))
  with check (distributor_id = public.my_distributor_id()
         and status in ('draft','pending','cancelled'));
-- manager may read + change status on own distributors' orders
create policy orders_manager_update on public.orders for update
  using (public.my_role() = 'manager' and public.can_access_distributor(distributor_id))
  with check (public.my_role() = 'manager' and public.can_access_distributor(distributor_id));

-- order_items: visibility/writes follow the parent order
create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and public.can_access_distributor(o.distributor_id)));
create policy order_items_admin_all on public.order_items for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy order_items_distributor_write on public.order_items for all
  using (public.my_role() = 'distributor' and exists (
           select 1 from public.orders o
           where o.id = order_id and o.distributor_id = public.my_distributor_id()
             and o.status in ('draft','pending')))
  with check (public.my_role() = 'distributor' and exists (
           select 1 from public.orders o
           where o.id = order_id and o.distributor_id = public.my_distributor_id()
             and o.status in ('draft','pending')));

-- order_history
create policy order_history_select on public.order_history for select
  using (exists (select 1 from public.orders o
                 where o.id = order_id and public.can_access_distributor(o.distributor_id)));
create policy order_history_write on public.order_history for insert
  with check (exists (select 1 from public.orders o
                 where o.id = order_id and public.can_access_distributor(o.distributor_id)));

-- payments: visible to those who can access the distributor; written by admin/manager only
create policy payments_select on public.payments for select
  using (public.can_access_distributor(distributor_id));
create policy payments_admin_all on public.payments for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy payments_manager_insert on public.payments for insert
  with check (public.my_role() = 'manager' and public.can_access_distributor(distributor_id));

-- messages: visible to those who can access the distributor; written by admin/manager only
create policy messages_select on public.messages for select
  using (public.can_access_distributor(distributor_id));
create policy messages_admin_all on public.messages for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy messages_manager_insert on public.messages for insert
  with check (public.my_role() = 'manager' and public.can_access_distributor(distributor_id));
