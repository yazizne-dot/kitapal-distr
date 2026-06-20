-- ============================================================================
-- Kitapal seed — BUSINESS DATA ONLY (no auth users / profiles).
-- Auth users + profiles are created via the Supabase Auth API in Plan 2.
--
-- Apply against the linked cloud project in this order:
--   1) node scripts/generate-seed.mjs > supabase/.gen/products-seed.sql
--   2) npx supabase db query --linked -f supabase/.gen/products-seed.sql   (1622 products)
--   3) npx supabase db query --linked -f supabase/seed.sql                 (this file)
--
-- Idempotency: this file is written to run once against an empty project.
-- ============================================================================

-- ---------- Distributors (from src/app/app.component.ts) ----------
insert into public.distributors (company, city, discount, credit_limit, phone) values
 ('Paidaly',          'Астана',    0.45, 8000000,  ''),
 ('Руханият',         'Ақтау',     0.40, 3000000,  ''),
 ('Ақтау франшиза',   'Ақтау',     0.40, 3000000,  ''),
 ('Aidyn Kitap',      'Қызылорда', 0.40, 2000000,  ''),
 ('Kitapal Oral',     'Орал',      0.43, 4500000,  ''),
 ('Закария',          'Павлодар',  0.38, 14000000, ''),
 ('Байгелов',         'Тараз',     0.37, 2000000,  ''),
 ('ЖасКО',            'Тараз',     0.40, 2000000,  ''),
 ('Олжабаев',         'Шымкент',   0.45, 15000000, ''),
 ('Сабитова Нұртас',  'Алматы',    0.45, 8000000,  ''),
 ('Рахманов',         'Барахолка', 0.45, 10000000, '');

-- ---------- Synthetic product used for opening balances ----------
insert into public.products (name, barcode, publisher, category, base_price)
values ('Бастапқы сальдо (opening balance)', 'OPENING-BALANCE', 'system', 'system', 1)
on conflict (barcode) do nothing;

-- ---------- Targets for the current half-year (2026-H1) ----------
insert into public.targets (distributor_id, period, amount)
select d.id, '2026-H1', t.amount
from public.distributors d
join (values
 ('Paidaly',42000000),('Руханият',18000000),('Ақтау франшиза',15000000),
 ('Aidyn Kitap',12000000),('Kitapal Oral',27000000),('Закария',14000000),
 ('Байгелов',9000000),('ЖасКО',10000000),('Олжабаев',42000000),
 ('Сабитова Нұртас',40000000),('Рахманов',25000000)
) as t(company, amount) on t.company = d.company;

-- ---------- Legacy "achieved": one DELIVERED order per distributor in 2026-H1 ----------
-- distributor_stats.achieved = sum of delivered orders this half-year, so this makes
-- achieved equal the legacy values from app.component.ts.
with ob as (select id as pid from public.products where barcode = 'OPENING-BALANCE'),
src as (
  select d.id as did, v.amount
  from public.distributors d
  join (values
   ('Paidaly',4726848),('Руханият',2572777),('Ақтау франшиза',1255682),
   ('Aidyn Kitap',545037),('Kitapal Oral',1915963),('Закария',886814),
   ('Байгелов',702806),('ЖасКО',759006),('Олжабаев',1668679),
   ('Сабитова Нұртас',2831901),('Рахманов',2307519)
  ) v(company, amount) on v.company = d.company
),
ins as (
  insert into public.orders (distributor_id, status, created_at)
  select did, 'delivered', timestamptz '2026-06-01' from src
  returning id, distributor_id
)
insert into public.order_items (order_id, product_id, qty, unit_price)
select ins.id, ob.pid, src.amount, 1
from ins join src on src.did = ins.distributor_id cross join ob;

-- ---------- Legacy "debt" top-up: CONFIRMED order for (debt - achieved) where positive ----------
-- debt = sum(confirmed/shipped/delivered) - payments. The delivered orders above already
-- contribute "achieved" to debt; these confirmed orders add the remainder so debt hits legacy.
with ob as (select id as pid from public.products where barcode = 'OPENING-BALANCE'),
src as (
  select d.id as did, v.amount
  from public.distributors d
  join (values
   ('Paidaly',3323239),('Руханият',1012359),('Ақтау франшиза',2485477),
   ('Aidyn Kitap',1216452),('Байгелов',1753148),('ЖасКО',1324123),
   ('Рахманов',4757681)
  ) v(company, amount) on v.company = d.company
),
ins as (
  insert into public.orders (distributor_id, status, created_at)
  select did, 'confirmed', timestamptz '2026-06-01' from src
  returning id, distributor_id
)
insert into public.order_items (order_id, product_id, qty, unit_price)
select ins.id, ob.pid, src.amount, 1
from ins join src on src.did = ins.distributor_id cross join ob;

-- ---------- Legacy "debt" reduction: PAYMENT for (achieved - debt) where debt < achieved ----------
insert into public.payments (distributor_id, amount, paid_at, note)
select d.id, v.amount, date '2026-06-01', 'Бастапқы сальдо түзетуі'
from public.distributors d
join (values ('Закария', 363045)) v(company, amount) on v.company = d.company;
