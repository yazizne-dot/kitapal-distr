-- Core tables: distributors, profiles, products, targets
-- distributors first (profiles references it); manager_id FK added after profiles exist

create table public.distributors (
  id           bigint generated always as identity primary key,
  company      text not null,
  city         text not null,
  manager_id   uuid,
  discount     numeric(4,3) not null default 0 check (discount >= 0 and discount <= 1),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  phone        text not null default '',
  created_at   timestamptz not null default now()
);

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null default '',
  role           text not null check (role in ('admin','manager','distributor')),
  distributor_id bigint references public.distributors(id),
  created_at     timestamptz not null default now()
);

alter table public.distributors
  add constraint distributors_manager_fk
  foreign key (manager_id) references public.profiles(id);

create table public.products (
  id                bigint generated always as identity primary key,
  name              text not null,
  barcode           text not null unique,
  publisher         text not null default '',
  category          text not null default '',
  base_price        numeric(12,2) not null check (base_price >= 0),
  discount_override numeric(4,3) check (discount_override >= 0 and discount_override <= 1),
  created_at        timestamptz not null default now()
);

create table public.targets (
  id             bigint generated always as identity primary key,
  distributor_id bigint not null references public.distributors(id) on delete cascade,
  period         text not null,
  amount         numeric(14,2) not null check (amount >= 0),
  unique (distributor_id, period)
);

create index on public.profiles (distributor_id);
create index on public.distributors (manager_id);
create index on public.targets (distributor_id);
