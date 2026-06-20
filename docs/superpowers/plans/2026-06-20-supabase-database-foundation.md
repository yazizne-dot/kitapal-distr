# Supabase Database Foundation — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the normalized Postgres schema, computed views, helper functions, RLS policies, and seed data for the Kitapal Distributor Portal on Supabase, fully tested with pgTAP.

**Architecture:** Normalized tables hold only facts; all derived values (debt, achieved, remaining limit, notifications) are Postgres views with `security_invoker = true` so RLS applies through them. Access control lives in the database via RLS using helper functions that read the caller's role/distributor from `profiles` keyed by `auth.uid()`.

**Tech Stack:** Supabase CLI (local Docker stack), PostgreSQL 15, pgTAP for tests, Node (one-off seed generator).

**Out of scope (this plan):** Angular code, Supabase JS client wiring, replacing localStorage. That is Plan 2.

**Prerequisites:** Docker Desktop running (needed for `supabase start` / `supabase test db`). Supabase CLI already installed (v2.107.0).

**Spec:** `docs/superpowers/specs/2026-06-20-supabase-architecture-and-refactor-design.md`

---

## File Structure

- `supabase/config.toml` — created by `supabase init`.
- `supabase/migrations/0001_core_tables.sql` — `distributors`, `profiles`, `products`, `targets`.
- `supabase/migrations/0002_transaction_tables.sql` — `orders`, `order_items`, `order_history`, `payments`, `messages` + indexes.
- `supabase/migrations/0003_functions.sql` — `current_half_year`, `half_year_of`, `my_role`, `my_distributor_id`, `can_access_distributor`, `set_order_code` trigger.
- `supabase/migrations/0004_views.sql` — `order_totals`, `distributor_stats`, `notifications`.
- `supabase/migrations/0005_rls.sql` — enable RLS + all policies.
- `supabase/tests/01_schema_test.sql` — pgTAP: tables/columns/constraints exist.
- `supabase/tests/02_views_test.sql` — pgTAP: debt/achieved/remaining_limit math.
- `supabase/tests/03_rls_test.sql` — pgTAP: per-role visibility.
- `scripts/generate-seed.mjs` — generates product INSERTs from `src/app/price-products.ts`.
- `supabase/seed.sql` — auth users, profiles, distributors, products, targets, demo orders/payments.

---

## Task 1: Initialize Supabase project

**Files:**
- Create: `supabase/config.toml` (via CLI)

- [ ] **Step 1: Initialize Supabase**

Run: `npx supabase init`
Expected: creates `supabase/` with `config.toml`, `seed.sql` (empty), `.gitignore`. If it asks about generating VS Code settings, answer `N`.

- [ ] **Step 2: Start the local stack to confirm Docker works**

Run: `npx supabase start`
Expected: prints local API URL, DB URL, `anon key`, `service_role key`. If Docker is not running, start Docker Desktop first.

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml supabase/.gitignore
git commit -m "chore: initialize Supabase project"
```

---

## Task 2: Core tables migration

**Files:**
- Create: `supabase/migrations/0001_core_tables.sql`
- Test: `supabase/tests/01_schema_test.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/01_schema_test.sql`:

```sql
begin;
select plan(8);

select has_table('public', 'distributors', 'distributors table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'targets', 'targets table exists');

select col_is_pk('public', 'profiles', 'id', 'profiles.id is PK');
select fk_ok('public', 'profiles', 'distributor_id', 'public', 'distributors', 'id');
select col_has_check('public', 'distributors', 'discount', 'discount has a CHECK constraint');
select col_is_unique('public', 'targets', ARRAY['distributor_id','period']);

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — relation "public.distributors" does not exist (table not created yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0001_core_tables.sql`:

```sql
-- distributors first (profiles references it), manager_id FK added after profiles
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase test db`
Expected: PASS — `01_schema_test.sql .. ok` (8/8).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_core_tables.sql supabase/tests/01_schema_test.sql
git commit -m "feat(db): core tables (distributors, profiles, products, targets)"
```

---

## Task 3: Transaction tables migration

**Files:**
- Create: `supabase/migrations/0002_transaction_tables.sql`
- Test: append to `supabase/tests/01_schema_test.sql`

- [ ] **Step 1: Extend the failing test**

Edit `supabase/tests/01_schema_test.sql` — change `select plan(8);` to `select plan(14);` and add these assertions before `select * from finish();`:

```sql
select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_items', 'order_items table exists');
select has_table('public', 'order_history', 'order_history table exists');
select has_table('public', 'payments', 'payments table exists');
select has_table('public', 'messages', 'messages table exists');
select fk_ok('public', 'order_items', 'order_id', 'public', 'orders', 'id');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — relation "public.orders" does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0002_transaction_tables.sql`:

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase test db`
Expected: PASS — 14/14.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_transaction_tables.sql supabase/tests/01_schema_test.sql
git commit -m "feat(db): transaction tables (orders, items, history, payments, messages)"
```

---

## Task 4: Helper functions + order code trigger

**Files:**
- Create: `supabase/migrations/0003_functions.sql`
- Test: append to `supabase/tests/01_schema_test.sql`

- [ ] **Step 1: Extend the failing test**

Edit `supabase/tests/01_schema_test.sql` — change `select plan(14);` to `select plan(17);` and add before `finish()`:

```sql
-- half-year helper computes period strings correctly
select is( public.half_year_of(date '2026-03-10'), '2026-H1', 'March is H1' );
select is( public.half_year_of(date '2026-09-10'), '2026-H2', 'September is H2' );
select has_function('public', 'can_access_distributor', ARRAY['bigint'], 'access helper exists');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — function public.half_year_of(date) does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0003_functions.sql`:

```sql
create or replace function public.half_year_of(d date)
returns text language sql immutable as $$
  select extract(year from d)::int::text || '-H' ||
         case when extract(month from d) <= 6 then '1' else '2' end;
$$;

create or replace function public.current_half_year()
returns text language sql stable as $$
  select public.half_year_of(current_date);
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_distributor_id()
returns bigint language sql stable security definer set search_path = public as $$
  select distributor_id from public.profiles where id = auth.uid();
$$;

-- single source of truth for distributor-scoped visibility, reused by RLS
create or replace function public.can_access_distributor(d_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from public.distributors d where d.id = d_id and d.manager_id = auth.uid())
    when 'distributor' then d_id = public.my_distributor_id()
    else false
  end;
$$;

-- city -> 3-letter code for human-readable order codes
create or replace function public.city_code(p_city text)
returns text language sql immutable as $$
  select case p_city
    when 'Астана' then 'AST' when 'Шымкент' then 'SHY' when 'Ақтау' then 'AKT'
    when 'Қызылорда' then 'KYZ' when 'Тараз' then 'TAR' when 'Жезқазған' then 'JEZ'
    when 'Павлодар' then 'PAV' when 'Орал' then 'ORL' when 'Барахолка' then 'BAR'
    when 'Алматы' then 'ALA' when 'Атырау' then 'ATR' else 'XXX'
  end;
$$;

create or replace function public.set_order_code()
returns trigger language plpgsql as $$
declare
  v_city text;
  v_seq  int;
begin
  if new.order_code is not null then
    return new;
  end if;
  select city into v_city from public.distributors where id = new.distributor_id;
  select count(*) + 1 into v_seq
    from public.orders o
    join public.distributors d on d.id = o.distributor_id
    where d.city = v_city
      and to_char(o.created_at, 'YYMM') = to_char(now(), 'YYMM');
  new.order_code := 'KP-' || public.city_code(v_city) || '-' ||
                    to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger trg_set_order_code
  before insert on public.orders
  for each row execute function public.set_order_code();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase test db`
Expected: PASS — 17/17.

- [ ] **Step 5: Add a focused trigger test**

Create `supabase/tests/02_views_test.sql` with the order-code check first (views added next task):

```sql
begin;
select plan(1);

insert into public.distributors (company, city, discount, credit_limit)
  values ('TestCo', 'Астана', 0.40, 1000000) returning id \gset
insert into public.orders (distributor_id, status) values (:id, 'pending') returning order_code \gset
select like(:'order_code', 'KP-AST-%', 'order_code uses city code AST');

select * from finish();
rollback;
```

- [ ] **Step 6: Run the trigger test**

Run: `npx supabase test db`
Expected: PASS — `02_views_test.sql` 1/1.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0003_functions.sql supabase/tests/01_schema_test.sql supabase/tests/02_views_test.sql
git commit -m "feat(db): helper functions and order_code trigger"
```

---

## Task 5: Computed views

**Files:**
- Create: `supabase/migrations/0004_views.sql`
- Test: expand `supabase/tests/02_views_test.sql`

- [ ] **Step 1: Write the failing test (debt/achieved math)**

Replace the contents of `supabase/tests/02_views_test.sql` with:

```sql
begin;
select plan(4);

-- order code still works
insert into public.distributors (company, city, discount, credit_limit)
  values ('TestCo', 'Астана', 0.40, 1000000) returning id as dist_id \gset
insert into public.orders (distributor_id, status)
  values (:dist_id, 'pending') returning order_code \gset
select like(:'order_code', 'KP-AST-%', 'order_code uses city code AST');

-- product + target for the math
insert into public.products (name, barcode, base_price)
  values ('Book', 'B1', 1000) returning id as prod_id \gset
insert into public.targets (distributor_id, period, amount)
  values (:dist_id, public.current_half_year(), 500000);

-- a DELIVERED order this period: 100 * 1000 = 100000 (counts to achieved AND debt)
insert into public.orders (distributor_id, status, created_at)
  values (:dist_id, 'delivered', now()) returning id as o1_id \gset
insert into public.order_items (order_id, product_id, qty, unit_price)
  values (:'o1_id', :prod_id, 100, 1000);

-- a PENDING order: 50 * 1000 = 50000 (counts to NEITHER debt nor achieved)
insert into public.orders (distributor_id, status, created_at)
  values (:dist_id, 'pending', now()) returning id as o2_id \gset
insert into public.order_items (order_id, product_id, qty, unit_price)
  values (:'o2_id', :prod_id, 50, 1000);

-- a payment of 30000 reduces debt
insert into public.payments (distributor_id, amount) values (:dist_id, 30000);

-- achieved = 100000 (delivered only)
select is( (select achieved from public.distributor_stats where distributor_id = :dist_id), 100000::numeric, 'achieved counts delivered only' );
-- debt = 100000 (delivered, confirmed-bucket) - 30000 payment = 70000
select is( (select debt from public.distributor_stats where distributor_id = :dist_id), 70000::numeric, 'debt = committed orders - payments' );
-- remaining_limit = 1000000 - 70000 = 930000
select is( (select remaining_limit from public.distributor_stats where distributor_id = :dist_id), 930000::numeric, 'remaining limit correct' );

select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — relation "public.distributor_stats" does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0004_views.sql`:

```sql
create view public.order_totals
  with (security_invoker = true) as
  select o.id as order_id, o.distributor_id, o.status, o.created_at,
         coalesce(sum(i.amount), 0) as total
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  group by o.id;

create view public.distributor_stats
  with (security_invoker = true) as
  select d.id as distributor_id, d.company, d.city, d.credit_limit, d.discount,
         coalesce(ach.achieved, 0) as achieved,
         coalesce(t.amount, 0)     as target,
         coalesce(dbt.debt, 0)     as debt,
         greatest(0, d.credit_limit - coalesce(dbt.debt, 0)) as remaining_limit
  from public.distributors d
  left join public.targets t
    on t.distributor_id = d.id and t.period = public.current_half_year()
  left join lateral (
    select coalesce(sum(ot.total), 0) as achieved
    from public.order_totals ot
    where ot.distributor_id = d.id
      and ot.status = 'delivered'
      and public.half_year_of(ot.created_at::date) = public.current_half_year()
  ) ach on true
  left join lateral (
    select coalesce(sum(ot.total), 0)
           - coalesce((select sum(p.amount) from public.payments p where p.distributor_id = d.id), 0)
           as debt
    from public.order_totals ot
    where ot.distributor_id = d.id
      and ot.status in ('confirmed', 'shipped', 'delivered')
  ) dbt on true;

create view public.notifications
  with (security_invoker = true) as
  -- limit exceeded
  select 'danger'::text as type, s.distributor_id, 'Лимит асылды'::text as title,
         s.company || ' (' || s.city || ') — қарыз ' || round(s.debt)::text ||
         ' ₸, лимит ' || round(s.credit_limit)::text || ' ₸' as body,
         current_date as date
  from public.distributor_stats s
  where s.debt > s.credit_limit
  union all
  -- limit warning (80%+ but not over)
  select 'warning', s.distributor_id, 'Лимит ескертуі',
         s.company || ' (' || s.city || ') — лимиттің ' ||
         round(s.debt / nullif(s.credit_limit, 0) * 100)::text || '% қолданылды',
         current_date
  from public.distributor_stats s
  where s.credit_limit > 0 and s.debt > s.credit_limit * 0.8 and s.debt <= s.credit_limit
  union all
  -- close to target
  select 'success', s.distributor_id, 'Мақсатқа жақын',
         s.company || ' — мақсаттың ' ||
         round(s.achieved / nullif(s.target, 0) * 100)::text || '% орындалды',
         current_date
  from public.distributor_stats s
  where s.target > 0 and s.achieved >= s.target * 0.8 and s.achieved < s.target
  union all
  -- pending orders awaiting confirmation
  select 'info', ot.distributor_id, 'Тапсырыс расталуды күтуде',
         ot.order_id::text || ' — ' || round(ot.total)::text || ' ₸', ot.created_at::date
  from public.order_totals ot
  where ot.status = 'pending'
  union all
  -- manager/admin messages
  select 'info', m.distributor_id, 'Хабарлама', m.body, m.created_at::date
  from public.messages m;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase test db`
Expected: PASS — `02_views_test.sql` 4/4.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_views.sql supabase/tests/02_views_test.sql
git commit -m "feat(db): computed views (order_totals, distributor_stats, notifications)"
```

---

## Task 6: RLS policies

**Files:**
- Create: `supabase/migrations/0005_rls.sql`
- Test: `supabase/tests/03_rls_test.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/03_rls_test.sql`. It seeds two distributors and one distributor-user, then checks that the user sees only their own row. The helper `set_auth(uuid)` impersonates a logged-in user.

```sql
begin;
select plan(3);

-- seed: two distributors
insert into public.distributors (company, city) values ('Alpha', 'Астана') returning id as alpha_id \gset
insert into public.distributors (company, city) values ('Beta', 'Алматы')  returning id as beta_id \gset

-- seed: an auth user + distributor profile bound to Alpha
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'alpha@kitapal.kz');
insert into public.profiles (id, full_name, role, distributor_id)
  values ('11111111-1111-1111-1111-111111111111', 'Alpha User', 'distributor', :alpha_id);

-- impersonate the distributor user
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- distributor sees exactly 1 distributor row (their own)
select is( (select count(*)::int from public.distributors), 1, 'distributor sees only own distributor' );
select is( (select id from public.distributors), :alpha_id, 'and it is Alpha' );

-- distributor cannot insert a payment (manager/admin only)
select throws_ok(
  format('insert into public.payments (distributor_id, amount) values (%s, 100)', :alpha_id),
  '42501', null, 'distributor cannot insert payments'
);

reset role;  -- back to superuser so finish()/rollback run cleanly
select * from finish();
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — without RLS the distributor sees 2 rows (count is 2, not 1), and the payment insert does not throw.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0005_rls.sql`:

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx supabase test db`
Expected: PASS — `03_rls_test.sql` 3/3. (Tests 01 and 02 still pass: they run before RLS is enabled within their own transactions as the superuser test role, which bypasses RLS.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_rls.sql supabase/tests/03_rls_test.sql
git commit -m "feat(db): row level security policies for all tables"
```

---

## Task 7: Seed data

**Files:**
- Create: `scripts/generate-seed.mjs`
- Create/overwrite: `supabase/seed.sql`

- [ ] **Step 1: Write the product seed generator**

Create `scripts/generate-seed.mjs` — it imports the existing product array and prints product INSERTs so we don't hand-copy hundreds of rows (DRY):

```js
// Generates product INSERT statements from the existing Angular data file.
// Usage: node scripts/generate-seed.mjs > /tmp/products-seed.sql
import { products } from '../src/app/price-products.js';

const esc = (s) => String(s).replace(/'/g, "''");
console.log('insert into public.products (name, barcode, publisher, category, base_price, discount_override) values');
const rows = products.map((p) =>
  `  ('${esc(p.name)}', '${esc(p.barcode)}', '${esc(p.publisher)}', '${esc(p.category)}', ${p.basePrice}, ${p.discountOverride ?? 'null'})`
);
console.log(rows.join(',\n') + ';');
```

Note: `price-products.ts` is plain data with no Angular imports, so it transpiles trivially. If `node` cannot import the `.ts` directly, first run `npx tsc src/app/price-products.ts --outDir /tmp/seedgen --module es2020 --moduleResolution node` and import from `/tmp/seedgen/price-products.js`.

- [ ] **Step 2: Generate the product INSERTs**

Run: `node scripts/generate-seed.mjs > /tmp/products-seed.sql`
Expected: `/tmp/products-seed.sql` contains one multi-row INSERT covering every product. Inspect the first few lines to confirm valid SQL.

- [ ] **Step 3: Write `supabase/seed.sql`**

Overwrite `supabase/seed.sql`. Seed auth users (password `kitapal2026`, admin `admin2026`), profiles, distributors, the 11 distributors' targets as `2026-H1`, then paste the generated products block where indicated. Distributor/target/order values come from `src/app/app.component.ts` (`distributors` and `orders` arrays).

```sql
-- ============ AUTH USERS ============
-- Supabase local: insert directly into auth.users with bcrypt-hashed passwords.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000001','authenticated','authenticated','admin@kitapal.kz', crypt('admin2026', gen_salt('bf')),  now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000002','authenticated','authenticated','marjan@kitapal.kz',crypt('manager2026',gen_salt('bf')), now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','a0000000-0000-0000-0000-000000000003','authenticated','authenticated','astana@kitapal.kz',crypt('kitapal2026',gen_salt('bf')), now(), now(), now());
-- (add the remaining 10 distributor users following the same pattern; emails = login + '@kitapal.kz')

-- ============ DISTRIBUTORS ============
-- manager_id is set after the manager profile exists (below), so insert distributors first.
insert into public.distributors (company, city, discount, credit_limit, phone) values
 ('Paidaly','Астана',0.45,8000000,''),
 ('Руханият','Ақтау',0.40,3000000,''),
 ('Ақтау франшиза','Ақтау',0.40,3000000,''),
 ('Aidyn Kitap','Қызылорда',0.40,2000000,''),
 ('Kitapal Oral','Орал',0.43,4500000,''),
 ('Закария','Павлодар',0.38,14000000,''),
 ('Байгелов','Тараз',0.37,2000000,''),
 ('ЖасКО','Тараз',0.40,2000000,''),
 ('Олжабаев','Шымкент',0.45,15000000,''),
 ('Сабитова Нұртас','Алматы',0.45,8000000,''),
 ('Рахманов','Барахолка',0.45,10000000,'');

-- ============ PROFILES ============
insert into public.profiles (id, full_name, role, distributor_id) values
 ('a0000000-0000-0000-0000-000000000001','Бас Администратор','admin', null),
 ('a0000000-0000-0000-0000-000000000002','Маржан','manager', null),
 ('a0000000-0000-0000-0000-000000000003','Paidaly — Астана','distributor', (select id from public.distributors where company='Paidaly'));
-- (add the remaining 10 distributor profiles, binding each to its distributor row)

-- assign all distributors to manager Маржан
update public.distributors set manager_id = 'a0000000-0000-0000-0000-000000000002';

-- ============ TARGETS (2026-H1) ============
insert into public.targets (distributor_id, period, amount)
select id, '2026-H1', t.amount from public.distributors d
join (values
 ('Paidaly',42000000),('Руханият',18000000),('Ақтау франшиза',15000000),
 ('Aidyn Kitap',12000000),('Kitapal Oral',27000000),('Закария',14000000),
 ('Байгелов',9000000),('ЖасКО',10000000),('Олжабаев',42000000),
 ('Сабитова Нұртас',40000000),('Рахманов',25000000)
) as t(company, amount) on t.company = d.company;

-- ============ PRODUCTS ============
-- >>> PASTE the generated block from /tmp/products-seed.sql here <<<

-- ============ HISTORICAL DEBT (spec open question resolved) ============
-- Current debts come from before this system existed; there are no historical orders to
-- reproduce them. Record each distributor's starting debt as a single confirmed
-- "opening balance" order so debt math stays truthful and consistent.
-- For each distributor, insert one confirmed order with a single line whose amount equals
-- the legacy debt, product = a dedicated 'Бастапқы сальдо' SKU (base_price 1), qty = debt.
insert into public.products (name, barcode, publisher, category, base_price)
  values ('Бастапқы сальдо (opening balance)', 'OPENING-BALANCE', 'system', 'system', 1);

-- Example for Paidaly (legacy debt 8050087); repeat per distributor with its debt value:
-- with o as (
--   insert into public.orders (distributor_id, status, created_at)
--   values ((select id from public.distributors where company='Paidaly'), 'confirmed', '2026-01-01')
--   returning id)
-- insert into public.order_items (order_id, product_id, qty, unit_price)
--   select o.id, (select id from public.products where barcode='OPENING-BALANCE'), 8050087, 1 from o;
```

- [ ] **Step 4: Reset the DB to run all migrations + seed**

Run: `npx supabase db reset`
Expected: all 5 migrations apply in order, then `seed.sql` runs with no errors; final line reports success.

- [ ] **Step 5: Verify seed sanity**

Run:
```bash
npx supabase db reset
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "select count(*) from public.products; select count(*) from public.distributors; select distributor_id, debt, achieved, target from public.distributor_stats order by distributor_id limit 3;"
```
Expected: products count > 0, distributors count = 11 (plus opening-balance product), and `distributor_stats` returns rows with sensible non-null numbers.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-seed.mjs supabase/seed.sql
git commit -m "feat(db): seed auth users, distributors, products, targets, opening balances"
```

---

## Task 8: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Clean reset**

Run: `npx supabase db reset`
Expected: completes with no errors (migrations + seed).

- [ ] **Step 2: Full test suite**

Run: `npx supabase test db`
Expected: all three test files report `ok` and the run ends with no failures (01: 17, 02: 4, 03: 3).

- [ ] **Step 3: Confirm RLS is on for every table**

Run:
```bash
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;"
```
Expected: `rowsecurity = t` for all 9 application tables.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "test(db): verify full migration + seed + pgTAP suite passes" || echo "nothing to commit"
```

---

## Notes for Plan 2 (Angular refactor + integration)

After this plan is green, Plan 2 will: add `src/environments`, a `supabase.client.ts`, the `core/services/*`, split `app.component.ts` into feature components, switch auth to Supabase Auth (email `<login>@kitapal.kz`), and replace all `localStorage` reads/writes with service calls hitting the tables/views above. The opening-balance convention from Task 7 means the app should display `distributor_stats.debt` directly — no separate legacy debt field.
