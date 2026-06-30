-- ============================================================
-- Kitapal — 1-қадам: кестелер мен индекстер
-- DBeaver-де немесе Supabase SQL Editor-да жүргізіңіз.
-- ============================================================

-- Бұрын жасалған болса тазалау
drop table if exists public.notifications   cascade;
drop table if exists public.messages        cascade;
drop table if exists public.payments        cascade;
drop table if exists public.order_history   cascade;
drop table if exists public.order_items     cascade;
drop table if exists public.orders          cascade;
drop table if exists public.products        cascade;
drop table if exists public.profiles        cascade;
drop table if exists public.distributors    cascade;

drop type if exists notif_type   cascade;
drop type if exists order_status cascade;
drop type if exists user_role    cascade;

-- ENUM
create type user_role    as enum ('admin', 'manager', 'distributor');
create type order_status as enum ('draft', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled');
create type notif_type   as enum ('danger', 'warning', 'success', 'info');

-- distributors (profiles-тан бұрын жасалады)
create table public.distributors (
  id           bigint         generated always as identity primary key,
  company      text           not null,
  city         text           not null,
  manager      text           not null,
  target       numeric(14,2)  not null default 0,
  achieved     numeric(14,2)  not null default 0,
  discount     numeric(4,3)   not null default 0,
  credit_limit numeric(14,2)  not null default 0,
  debt         numeric(14,2)  not null default 0,
  phone        text                    default '',
  created_at   timestamptz    not null default now()
);

-- profiles (auth.users FK жоқ — Supabase-те trigger арқылы байланысады)
create table public.profiles (
  id             uuid          primary key,
  name           text          not null,
  role           user_role     not null default 'distributor',
  distributor_id bigint        references public.distributors(id) on delete set null,
  created_at     timestamptz   not null default now()
);

-- products
create table public.products (
  id                bigint         generated always as identity primary key,
  barcode           text           not null unique,
  name              text           not null,
  publisher         text           not null,
  category          text           not null default 'Kitapal',
  base_price        numeric(12,2)  not null,
  discount_override numeric(4,3),
  created_at        timestamptz    not null default now()
);

-- orders
create table public.orders (
  id             text           primary key,
  distributor_id bigint         not null references public.distributors(id) on delete restrict,
  status         order_status   not null default 'draft',
  amount         numeric(14,2)  not null default 0,
  created_by     uuid           references public.profiles(id),
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now()
);

-- order_items
create table public.order_items (
  id         bigint         generated always as identity primary key,
  order_id   text           not null references public.orders(id) on delete cascade,
  product_id bigint         references public.products(id),
  name       text           not null,
  barcode    text           not null,
  publisher  text           not null,
  qty        integer        not null check (qty > 0),
  unit_price numeric(12,2)  not null,
  discount   numeric(4,3)   not null default 0,
  amount     numeric(14,2)  not null
);
create index order_items_order_id_idx on public.order_items(order_id);

-- order_history
create table public.order_history (
  id         bigint        generated always as identity primary key,
  order_id   text          not null references public.orders(id) on delete cascade,
  status     order_status  not null,
  text       text          not null,
  changed_by uuid          references public.profiles(id),
  date       timestamptz   not null default now()
);
create index order_history_order_id_idx on public.order_history(order_id);

-- payments
create table public.payments (
  id             bigint         generated always as identity primary key,
  distributor_id bigint         not null references public.distributors(id) on delete cascade,
  amount         numeric(14,2)  not null,
  note           text                    default '',
  date           timestamptz    not null default now(),
  created_by     uuid           references public.profiles(id)
);
create index payments_distributor_id_idx on public.payments(distributor_id);

-- messages
create table public.messages (
  id             bigint       generated always as identity primary key,
  distributor_id bigint       not null references public.distributors(id) on delete cascade,
  from_name      text         not null,
  text           text         not null,
  date           timestamptz  not null default now()
);
create index messages_distributor_id_idx on public.messages(distributor_id);

-- notifications
create table public.notifications (
  id             bigint       generated always as identity primary key,
  type           notif_type   not null default 'info',
  title          text         not null,
  body           text         not null,
  distributor_id bigint       references public.distributors(id) on delete cascade,
  date           timestamptz  not null default now()
);
