-- ============================================================
-- Kitapal — Supabase (PostgreSQL) schema
-- Қазіргі Angular қосымшадағы in-memory деректерге (app.component.ts,
-- price-products.ts) дәл сәйкес келетін кесте құрылымы.
-- Supabase SQL Editor-ге осы файлды толық көшіріп, Run басу жеткілікті.
-- ============================================================

-- ---------- ENUM түрлері ----------
create type user_role as enum ('admin', 'manager', 'distributor');
create type order_status as enum ('draft', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
create type notif_type as enum ('danger', 'warning', 'success', 'info');

-- ---------- 1. profiles (auth.users-ге қосымша: рөл, дистрибьютор байланысы) ----------
-- Логин/пароль емес, Supabase Auth (email+password) арқылы кіреді.
-- Ескі логиндер (astana, rukhaniyat, ...) орнына нақты email қолданылады.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role user_role not null default 'distributor',
  distributor_id bigint references public.distributors(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 2. distributors ----------
create table public.distributors (
  id bigint generated always as identity primary key,
  company text not null,
  city text not null,
  manager text not null,
  target numeric(14,2) not null default 0,
  achieved numeric(14,2) not null default 0,
  discount numeric(4,3) not null default 0,      -- 0.40 = 40%
  credit_limit numeric(14,2) not null default 0,
  debt numeric(14,2) not null default 0,
  phone text default '',
  created_at timestamptz not null default now()
);

-- profiles.distributor_id FK-ін distributors жасалғаннан кейін қою үшін:
alter table public.profiles
  add constraint profiles_distributor_fk
  foreign key (distributor_id) references public.distributors(id) on delete set null;

-- ---------- 3. products (баспа каталогы / прайс-лист) ----------
create table public.products (
  id bigint generated always as identity primary key,
  barcode text not null unique,
  name text not null,
  publisher text not null,
  category text not null default 'Kitapal',
  base_price numeric(12,2) not null,
  discount_override numeric(4,3),                -- кездейсоқ жеке жеңілдік
  created_at timestamptz not null default now()
);

-- ---------- 4. orders (тапсырыстар) ----------
create table public.orders (
  id text primary key,                           -- мыс. 'KP-AST-2605-0001'
  distributor_id bigint not null references public.distributors(id) on delete restrict,
  status order_status not null default 'draft',
  amount numeric(14,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 5. order_items (тапсырыс жолдары — накладная үшін негізгі дереккөз) ----------
create table public.order_items (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id),
  name text not null,
  barcode text not null,
  publisher text not null,
  qty integer not null check (qty > 0),
  unit_price numeric(12,2) not null,
  discount numeric(4,3) not null default 0,
  amount numeric(14,2) not null
);
create index order_items_order_id_idx on public.order_items(order_id);

-- ---------- 6. order_history (статус өзгерістерінің журналы) ----------
create table public.order_history (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  status order_status not null,
  text text not null,
  changed_by uuid references public.profiles(id),
  date timestamptz not null default now()
);
create index order_history_order_id_idx on public.order_history(order_id);

-- ---------- 7. payments (төлемдер) ----------
create table public.payments (
  id bigint generated always as identity primary key,
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  amount numeric(14,2) not null,
  note text default '',
  date timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index payments_distributor_id_idx on public.payments(distributor_id);

-- ---------- 8. messages (дистрибьютормен хат алмасу) ----------
create table public.messages (
  id bigint generated always as identity primary key,
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  from_name text not null,
  text text not null,
  date timestamptz not null default now()
);
create index messages_distributor_id_idx on public.messages(distributor_id);

-- ---------- 9. notifications (жүйелік хабарландырулар) ----------
create table public.notifications (
  id bigint generated always as identity primary key,
  type notif_type not null default 'info',
  title text not null,
  body text not null,
  distributor_id bigint references public.distributors(id) on delete cascade,
  date timestamptz not null default now()
);

-- ============================================================
-- Row Level Security (RLS) — Supabase-те міндетті түрде қосылады
-- ============================================================
alter table public.profiles enable row level security;
alter table public.distributors enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_history enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Көмекші функция: ағымдағы пайдаланушының рөлі мен distributor_id-ін алу
create or replace function public.current_role()
returns user_role language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_distributor_id()
returns bigint language sql stable as $$
  select distributor_id from public.profiles where id = auth.uid()
$$;

-- profiles: әркім тек өзінің профилін көреді, admin/manager барлығын көреді
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.current_role() in ('admin','manager'));
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid());

-- distributors: admin/manager барлығын, distributor тек өзінің компаниясын көреді
create policy "distributors_select" on public.distributors for select
  using (public.current_role() in ('admin','manager') or id = public.current_distributor_id());
create policy "distributors_write" on public.distributors for all
  using (public.current_role() in ('admin','manager'));

-- products: барлық авторизацияланған пайдаланушы оқи алады, admin/manager жаза алады
create policy "products_select" on public.products for select
  using (auth.uid() is not null);
create policy "products_write" on public.products for all
  using (public.current_role() in ('admin','manager'));

-- orders: distributor тек өзінің тапсырыстарын, admin/manager барлығын көреді/басқарады
create policy "orders_select" on public.orders for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "orders_insert" on public.orders for insert
  with check (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "orders_update" on public.orders for update
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());

-- order_items / order_history: тиісті orders-қа қатысты бірдей ереже
create policy "order_items_select" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (public.current_role() in ('admin','manager') or o.distributor_id = public.current_distributor_id())));
create policy "order_items_write" on public.order_items for all
  using (exists (select 1 from public.orders o where o.id = order_id and
    (public.current_role() in ('admin','manager') or o.distributor_id = public.current_distributor_id())));

create policy "order_history_select" on public.order_history for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (public.current_role() in ('admin','manager') or o.distributor_id = public.current_distributor_id())));
create policy "order_history_write" on public.order_history for all
  using (public.current_role() in ('admin','manager'));

-- payments / messages / notifications: distributor тек өзінің жазбаларын көреді
create policy "payments_select" on public.payments for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "payments_write" on public.payments for all
  using (public.current_role() in ('admin','manager'));

create policy "messages_select" on public.messages for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());
create policy "messages_insert" on public.messages for insert
  with check (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id());

create policy "notifications_select" on public.notifications for select
  using (public.current_role() in ('admin','manager') or distributor_id = public.current_distributor_id()
    or distributor_id is null);
create policy "notifications_write" on public.notifications for all
  using (public.current_role() in ('admin','manager'));

-- ============================================================
-- Жаңа auth.users тіркелгенде profiles жолын автоматты жасау
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'distributor');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
