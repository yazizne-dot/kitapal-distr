-- Transaction tables: orders, order_items, order_history, payments, messages

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_code     text unique,
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  status         text not null default 'pending'
                 check (status in ('draft','pending','confirmed','shipped','delivered','cancelled')),
  created_at     timestamptz not null default now()
);

create table public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  bigint not null references public.products(id),
  qty         int not null check (qty > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  discount    numeric(4,3) not null default 0 check (discount >= 0 and discount <= 1),
  amount      numeric(14,2) generated always as (qty * unit_price) stored
);

create table public.order_history (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null,
  note       text not null default '',
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.payments (
  id             bigint generated always as identity primary key,
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  paid_at        date not null default current_date,
  note           text not null default '',
  recorded_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create table public.messages (
  id              bigint generated always as identity primary key,
  distributor_id  bigint not null references public.distributors(id) on delete cascade,
  from_profile_id uuid references public.profiles(id),
  body            text not null,
  created_at      timestamptz not null default now()
);

create index on public.orders (distributor_id);
create index on public.order_items (order_id);
create index on public.order_history (order_id);
create index on public.payments (distributor_id);
create index on public.messages (distributor_id);
