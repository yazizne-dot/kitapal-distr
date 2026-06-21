# Supabase Integration + Auth — Implementation Plan (Plan 2A of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's in-file mock arrays and `localStorage` persistence with a typed Supabase data/service layer and real Supabase Auth login, while keeping the existing single `AppComponent` UI working.

**Architecture:** A thin `SupabaseClient` singleton; plain TypeScript models in `core/models`; one Angular service per domain area (`auth`, `distributor`, `product`, `order`, `payment`, `message`, `notification`) as the only place that talks to Supabase. The monolithic `AppComponent` is rewired to read/write through these services (signals stay). Login maps a short login (`admin`) to an email (`admin@kitapal.kz`) under the hood. RLS helper functions move to a non-exposed `private` schema.

**Tech Stack:** Angular 18 (standalone + signals), `@supabase/supabase-js` v2 (already a dependency), Supabase Auth, Supabase CLI for the DB migration.

**Out of scope (this plan → Plan 2B):** Splitting `AppComponent` into feature components, the Angular Router with lazy routes, moving the З-2 invoice generator. Those come after the app is live on Supabase.

**Prerequisites at execution start:**
- Re-auth the CLI if needed: `npx supabase login --token <token>` then confirm `npx supabase projects list` works and the project `tgiwtfavkuphllpgtuck` shows `linked: true`.
- Plan 1 is applied (schema + seed live on the cloud project).

**Spec:** `docs/superpowers/specs/2026-06-20-supabase-architecture-and-refactor-design.md`
**Project:** ref `tgiwtfavkuphllpgtuck`, URL `https://tgiwtfavkuphllpgtuck.supabase.co`, region ap-southeast-1.

---

## File Structure

- `src/environments/environment.ts` + `environment.development.ts` — Supabase URL + anon key.
- `src/app/core/supabase.client.ts` — exports a single `supabase` client instance.
- `src/app/core/models/{role,profile,distributor,product,order,payment,message,notification}.ts` — types extracted from `app.component.ts`.
- `src/app/core/services/{auth,distributor,product,order,payment,message,notification}.service.ts` — domain services.
- `scripts/create-auth-users.mjs` — one-off: create 13 auth users + profiles via the Auth Admin API.
- `supabase/migrations/<ts>_private_helpers.sql` — move RLS helpers to `private` schema; drop stray `handle_new_user`.
- `src/app/app.component.ts` — rewired to use services; mock arrays + `localStorage` removed.
- Test specs colocated as `*.spec.ts`.

---

## Task 1: Install dependencies and confirm the app builds

**Files:** none (environment setup)

- [ ] **Step 1: Install**

Run: `npm install`
Expected: `node_modules/` created; `@supabase/supabase-js` present under `node_modules/@supabase`.

- [ ] **Step 2: Baseline build**

Run: `npm run build`
Expected: Angular build succeeds (the app currently compiles). If it fails, stop and report — the baseline must be green before refactoring.

- [ ] **Step 3: Commit (lockfile only, if generated)**

```bash
git add package-lock.json
git commit -m "chore: install dependencies (package-lock)" || echo "nothing to commit"
```

---

## Task 2: Environment config + Supabase client

**Files:**
- Create: `src/environments/environment.ts`, `src/environments/environment.development.ts`
- Create: `src/app/core/supabase.client.ts`
- Modify: `angular.json` (file replacements already exist for Angular 18 default; verify)

- [ ] **Step 1: Fetch the anon (publishable) key**

Run: `npx supabase projects api-keys --project-ref tgiwtfavkuphllpgtuck`
Copy the value of the `anon` / publishable key. (If the command prints nothing, get it from Dashboard → Project Settings → API → `anon public`.)

- [ ] **Step 2: Create environment files**

Create `src/environments/environment.ts`:

```ts
export const environment = {
  production: true,
  supabaseUrl: 'https://tgiwtfavkuphllpgtuck.supabase.co',
  supabaseAnonKey: '<PASTE_ANON_KEY_FROM_STEP_1>',
};
```

Create `src/environments/environment.development.ts` with the same contents but `production: false`. The anon key is safe to ship in a client app (RLS protects data); it is not a secret.

- [ ] **Step 3: Create the client singleton**

Create `src/app/core/supabase.client.ts`:

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const supabase: SupabaseClient = createClient(
  environment.supabaseUrl,
  environment.supabaseAnonKey,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds with the new files.

- [ ] **Step 5: Commit**

```bash
git add src/environments src/app/core/supabase.client.ts
git commit -m "feat(core): supabase client + environment config"
```

---

## Task 3: Extract domain models

**Files:**
- Create: `src/app/core/models/role.ts`, `profile.ts`, `distributor.ts`, `product.ts`, `order.ts`, `payment.ts`, `message.ts`, `notification.ts`
- Modify: `src/app/app.component.ts` (import from models instead of defining inline) — defer the import switch to Task 9; for now just create the files.

- [ ] **Step 1: Create model files matching the DB schema (snake_case columns)**

Create `src/app/core/models/role.ts`:

```ts
export type Role = 'admin' | 'manager' | 'distributor';
export type OrderStatus =
  | 'draft' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
```

Create `src/app/core/models/profile.ts`:

```ts
import { Role } from './role';
export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  distributor_id: number | null;
}
```

Create `src/app/core/models/distributor.ts`:

```ts
export interface Distributor {
  id: number;
  company: string;
  city: string;
  manager_id: string | null;
  discount: number;
  credit_limit: number;
  phone: string;
}
// Shape returned by the distributor_stats view
export interface DistributorStats {
  distributor_id: number;
  company: string;
  city: string;
  credit_limit: number;
  discount: number;
  achieved: number;
  target: number;
  debt: number;
  remaining_limit: number;
}
```

Create `src/app/core/models/product.ts`:

```ts
export interface Product {
  id: number;
  name: string;
  barcode: string;
  publisher: string;
  category: string;
  base_price: number;
  discount_override: number | null;
}
```

Create `src/app/core/models/order.ts`:

```ts
import { OrderStatus } from './role';
export interface OrderItem {
  id?: number;
  order_id?: string;
  product_id: number;
  qty: number;
  unit_price: number;
  discount: number;
  amount: number;
  // joined from products for display
  name?: string;
  barcode?: string;
  publisher?: string;
}
export interface OrderHistory {
  status: OrderStatus;
  note: string;
  changed_at: string;
}
export interface Order {
  id: string;
  order_code: string | null;
  distributor_id: number;
  status: OrderStatus;
  created_at: string;
  items: OrderItem[];
  history: OrderHistory[];
  amount: number; // computed client-side from items
}
```

Create `src/app/core/models/payment.ts`:

```ts
export interface Payment {
  id: number;
  distributor_id: number;
  amount: number;
  paid_at: string;
  note: string;
}
```

Create `src/app/core/models/message.ts`:

```ts
export interface DistMessage {
  id: number;
  distributor_id: number;
  from_profile_id: string | null;
  body: string;
  created_at: string;
}
```

Create `src/app/core/models/notification.ts`:

```ts
export interface AppNotif {
  type: 'danger' | 'warning' | 'success' | 'info';
  distributor_id: number;
  title: string;
  body: string;
  date: string;
}
```

- [ ] **Step 2: Build (models are unused yet, just must compile)**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/models
git commit -m "feat(core): extract domain models matching DB schema"
```

---

## Task 4: Move RLS helpers to a private schema (DB)

**Files:**
- Create: `supabase/migrations/<timestamp>_private_helpers.sql` (use `npx supabase migration new private_helpers`)

This clears advisor warns 0028/0029 (helpers were callable via `/rest/v1/rpc/...`) and reconciles the stray `public.handle_new_user` found during Plan 1.

- [ ] **Step 1: Inspect the stray function first**

Run: `npx supabase db query --linked -o csv "select proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='handle_new_user';"`
Expected: prints the body. If it only references our `profiles` table in a way we want, keep it; otherwise we replace it in Step 2. Record what it does.

- [ ] **Step 2: Write the migration**

Create the migration file with:

```sql
-- Move RLS helper functions out of the API-exposed public schema into `private`,
-- so they are not callable via PostgREST RPC but RLS can still use them.
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

-- Repoint every policy to private.* by recreating them.
-- (Drop + recreate the policies that reference public.my_role / my_distributor_id /
--  can_access_distributor — copy each policy body from 20260620182631_rls.sql,
--  replacing public.my_role()->private.my_role(), etc.)
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

-- Recreate the security_invoker views that referenced public.current_half_year/half_year_of:
-- those functions stay in public (they read no user data), so views are unaffected.

-- Drop the now-unused public helpers.
drop function if exists public.can_access_distributor(bigint);
drop function if exists public.my_distributor_id();
drop function if exists public.my_role();

-- Reconcile the stray function found in Plan 1 (replace with a no-op-safe definition or drop
-- if it has no trigger). Confirm via Step 1 output before choosing:
drop function if exists public.handle_new_user() cascade;
```

- [ ] **Step 3: Push and verify advisors**

Run: `printf 'y\n' | npx supabase db push`
Then: `npx supabase db advisors --linked --type security 2>&1 | grep -o "security_definer_function_executable" | wc -l`
Expected: `0` (no more public RPC-exposed SECURITY DEFINER helpers).

- [ ] **Step 4: Verify RLS still works (math + visibility unaffected)**

Run: `npx supabase db query --linked -o csv "select company, debt, achieved from public.distributor_stats order by distributor_id limit 3;"`
Expected: same numbers as Plan 1 (Paidaly debt 8050087, achieved 4726848).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): move RLS helpers to private schema; drop stray handle_new_user"
```

---

## Task 5: Create auth users + profiles (one-off script)

**Files:**
- Create: `scripts/create-auth-users.mjs`

- [ ] **Step 1: Get the service_role key**

Run: `npx supabase projects api-keys --project-ref tgiwtfavkuphllpgtuck`
Copy the `service_role` key. This is a SECRET — it bypasses RLS. Pass it via env var, never commit it.

- [ ] **Step 2: Write the script**

Create `scripts/create-auth-users.mjs`. It creates each auth user (email confirmed) then inserts the matching `profiles` row. Distributor company → id is looked up from the DB.

```js
// One-off: create Supabase Auth users + profiles for all Kitapal accounts.
// Usage (PowerShell):
//   $env:SUPABASE_URL="https://tgiwtfavkuphllpgtuck.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
//   node scripts/create-auth-users.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// login, password, full_name, role, distributor company (null for admin/manager)
const accounts = [
  ['admin',      'admin2026',   'Бас Администратор', 'admin',       null],
  ['marjan',     'manager2026', 'Маржан',            'manager',     null],
  ['astana',     'kitapal2026', 'Paidaly — Астана',          'distributor', 'Paidaly'],
  ['rukhaniyat', 'kitapal2026', 'Руханият — Ақтау',          'distributor', 'Руханият'],
  ['aktaufr',    'kitapal2026', 'Ақтау франшиза',            'distributor', 'Ақтау франшиза'],
  ['kyzylorda',  'kitapal2026', 'Aidyn Kitap — Қызылорда',   'distributor', 'Aidyn Kitap'],
  ['oral',       'kitapal2026', 'Kitapal Oral — Орал',        'distributor', 'Kitapal Oral'],
  ['pavlodar',   'kitapal2026', 'Закария — Павлодар',         'distributor', 'Закария'],
  ['baigelov',   'kitapal2026', 'Байгелов — Тараз',           'distributor', 'Байгелов'],
  ['jasko',      'kitapal2026', 'ЖасКО — Тараз',              'distributor', 'ЖасКО'],
  ['shymkent',   'kitapal2026', 'Олжабаев — Шымкент',         'distributor', 'Олжабаев'],
  ['almaty',     'kitapal2026', 'Сабитова Нұртас — Алматы',   'distributor', 'Сабитова Нұртас'],
  ['rakhmanov',  'kitapal2026', 'Рахманов — Барахолка',        'distributor', 'Рахманов'],
];

const { data: dists, error: dErr } = await admin.from('distributors').select('id, company');
if (dErr) throw dErr;
const idByCompany = new Map(dists.map((d) => [d.company, d.id]));

for (const [login, password, fullName, role, company] of accounts) {
  const email = `${login}@kitapal.kz`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr) { console.error(`createUser ${email}:`, cErr.message); continue; }
  const distributor_id = company ? idByCompany.get(company) ?? null : null;
  const { error: pErr } = await admin.from('profiles').insert({
    id: created.user.id, full_name: fullName, role, distributor_id,
  });
  if (pErr) console.error(`profile ${email}:`, pErr.message);
  else console.log(`OK ${email} (${role}${company ? ' → ' + company : ''})`);
}
console.log('Done.');
```

- [ ] **Step 3: Run the script**

Run (PowerShell, with the two env vars set as in the header):
`node scripts/create-auth-users.mjs`
Expected: 13 `OK ...` lines, no errors.

- [ ] **Step 4: Verify**

Run: `npx supabase db query --linked -o csv "select role, count(*) from public.profiles group by role order by role;"`
Expected: `admin 1`, `distributor 11`, `manager 1`.

- [ ] **Step 5: Commit (script only — never the keys)**

```bash
git add scripts/create-auth-users.mjs
git commit -m "feat(scripts): create auth users + profiles via Auth Admin API"
```

---

## Task 6: Auth service + login rewiring

**Files:**
- Create: `src/app/core/services/auth.service.ts`, `auth.service.spec.ts`
- Modify: `src/app/app.component.ts` (login/logout/changePassword/kp_remember)

- [ ] **Step 1: Write the failing test (login maps short login → email)**

Create `src/app/core/services/auth.service.spec.ts`:

```ts
import { loginToEmail } from './auth.service';

describe('loginToEmail', () => {
  it('maps a short login to the kitapal email', () => {
    expect(loginToEmail('admin')).toBe('admin@kitapal.kz');
    expect(loginToEmail('  Astana ')).toBe('astana@kitapal.kz');
  });
  it('passes a full email through unchanged', () => {
    expect(loginToEmail('admin@kitapal.kz')).toBe('admin@kitapal.kz');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `loginToEmail` not exported.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/auth.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Profile } from '../models/profile';
import { Role } from '../models/role';

export function loginToEmail(login: string): string {
  const v = login.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@kitapal.kz`;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly profile = signal<Profile | null>(null);
  readonly role = signal<Role>('admin');
  readonly signedIn = signal(false);

  async login(login: string, password: string): Promise<string | null> {
    const email = loginToEmail(login);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return 'Логин немесе пароль қате';
    await this.loadProfile();
    return null;
  }

  async loadProfile(): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { this.signedIn.set(false); return; }
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', auth.user.id).single();
    if (profile) {
      this.profile.set(profile as Profile);
      this.role.set((profile as Profile).role);
      this.signedIn.set(true);
    }
  }

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    this.profile.set(null);
    this.signedIn.set(false);
  }

  async changePassword(newPassword: string): Promise<string | null> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error ? error.message : null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 5: Rewire AppComponent login**

In `src/app/app.component.ts`: inject `AuthService` (constructor `private auth = inject(AuthService)` or constructor param). Replace `login()` to call `await this.auth.login(this.email, this.password)`, set `loginError` from the result, and on success `this.signedIn`, `this.role`, `this.currentUser` read from the service signals (or mirror them). Remove the `accounts` array, `loginDemo` raw-array logic (keep demo buttons calling real demo accounts), the `kp_remember` localStorage block in the constructor, and `changePassword`'s array mutation (call `this.auth.changePassword`). Replace `currentUser()` usages with `this.auth.profile()`.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/auth.service.ts src/app/core/services/auth.service.spec.ts src/app/app.component.ts
git commit -m "feat(auth): Supabase Auth login with short-login→email mapping"
```

---

## Task 7: Reference-data services (products, distributors, notifications)

**Files:**
- Create: `src/app/core/services/product.service.ts`, `distributor.service.ts`, `notification.service.ts`

- [ ] **Step 1: Product service**

Create `src/app/core/services/product.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Product } from '../models/product';

@Injectable({ providedIn: 'root' })
export class ProductService {
  readonly products = signal<Product[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('products').select('*').order('name');
    if (!error && data) this.products.set(data as Product[]);
  }

  async update(id: number, patch: Partial<Product>): Promise<string | null> {
    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
```

- [ ] **Step 2: Distributor service (table + stats view)**

Create `src/app/core/services/distributor.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Distributor, DistributorStats } from '../models/distributor';

@Injectable({ providedIn: 'root' })
export class DistributorService {
  readonly distributors = signal<Distributor[]>([]);
  readonly stats = signal<DistributorStats[]>([]);

  async load(): Promise<void> {
    const [d, s] = await Promise.all([
      supabase.from('distributors').select('*').order('id'),
      supabase.from('distributor_stats').select('*').order('distributor_id'),
    ]);
    if (!d.error && d.data) this.distributors.set(d.data as Distributor[]);
    if (!s.error && s.data) this.stats.set(s.data as DistributorStats[]);
  }

  async setDiscount(id: number, discount: number): Promise<string | null> {
    const { error } = await supabase.from('distributors').update({ discount }).eq('id', id);
    if (error) return error.message;
    await this.load();
    return null;
  }
}
```

- [ ] **Step 3: Notification service (reads the view)**

Create `src/app/core/services/notification.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { AppNotif } from '../models/notification';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<AppNotif[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('notifications').select('*').order('date', { ascending: false });
    if (!error && data) this.notifications.set(data as AppNotif[]);
  }
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/product.service.ts src/app/core/services/distributor.service.ts src/app/core/services/notification.service.ts
git commit -m "feat(services): product, distributor(+stats), notification services"
```

---

## Task 8: Transaction services (orders, payments, messages)

**Files:**
- Create: `src/app/core/services/order.service.ts`, `order.service.spec.ts`, `payment.service.ts`, `message.service.ts`

- [ ] **Step 1: Failing test for the credit-limit rule**

Create `src/app/core/services/order.service.spec.ts`:

```ts
import { decideStatus } from './order.service';

describe('decideStatus', () => {
  it('is draft when the order pushes debt over the credit limit', () => {
    expect(decideStatus(900_000, 200_000, 1_000_000)).toBe('draft'); // debt+amount > limit
  });
  it('is pending when within the limit', () => {
    expect(decideStatus(100_000, 200_000, 1_000_000)).toBe('pending');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `decideStatus` not exported.

- [ ] **Step 3: Implement order service**

Create `src/app/core/services/order.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Order, OrderItem } from '../models/order';
import { OrderStatus } from '../models/role';

export function decideStatus(debt: number, amount: number, creditLimit: number): OrderStatus {
  return debt + amount > creditLimit ? 'draft' : 'pending';
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  readonly orders = signal<Order[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_code, distributor_id, status, created_at, ' +
              'order_items(id, product_id, qty, unit_price, discount, amount, products(name, barcode, publisher)), ' +
              'order_history(status, note, changed_at)')
      .order('created_at', { ascending: false });
    if (error || !data) return;
    this.orders.set(data.map((o: any) => ({
      id: o.id, order_code: o.order_code, distributor_id: o.distributor_id,
      status: o.status, created_at: o.created_at,
      items: (o.order_items ?? []).map((i: any) => ({
        id: i.id, product_id: i.product_id, qty: i.qty, unit_price: i.unit_price,
        discount: i.discount, amount: i.amount,
        name: i.products?.name, barcode: i.products?.barcode, publisher: i.products?.publisher,
      })) as OrderItem[],
      history: (o.order_history ?? []).map((h: any) => ({
        status: h.status, note: h.note, changed_at: h.changed_at })),
      amount: (o.order_items ?? []).reduce((s: number, i: any) => s + Number(i.amount), 0),
    })) as Order[]);
  }

  async create(distributorId: number, items: { productId: number; qty: number; unitPrice: number; discount: number }[],
               status: OrderStatus): Promise<string | null> {
    const { data: order, error } = await supabase
      .from('orders').insert({ distributor_id: distributorId, status }).select('id').single();
    if (error || !order) return error?.message ?? 'order insert failed';
    const rows = items.map((i) => ({
      order_id: order.id, product_id: i.productId, qty: i.qty,
      unit_price: i.unitPrice, discount: i.discount,
    }));
    const { error: iErr } = await supabase.from('order_items').insert(rows);
    if (iErr) return iErr.message;
    await this.addHistory(order.id, status,
      status === 'draft' ? 'Лимиттен асқандықтан черновик болып сақталды' : 'Дистрибьютор тапсырыс жіберді');
    await this.load();
    return null;
  }

  async setStatus(orderId: string, status: OrderStatus, note: string): Promise<string | null> {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) return error.message;
    await this.addHistory(orderId, status, note);
    await this.load();
    return null;
  }

  private async addHistory(orderId: string, status: OrderStatus, note: string): Promise<void> {
    await supabase.from('order_history').insert({ order_id: orderId, status, note });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 5: Payment + message services**

Create `src/app/core/services/payment.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { Payment } from '../models/payment';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  readonly payments = signal<Payment[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('payments').select('*').order('paid_at', { ascending: false });
    if (!error && data) this.payments.set(data as Payment[]);
  }

  async add(distributorId: number, amount: number, paidAt: string, note: string): Promise<string | null> {
    const { error } = await supabase.from('payments')
      .insert({ distributor_id: distributorId, amount, paid_at: paidAt, note });
    if (error) return error.message;
    await this.load();
    return null;
  }

  async remove(id: number): Promise<void> {
    await supabase.from('payments').delete().eq('id', id);
    await this.load();
  }
}
```

Create `src/app/core/services/message.service.ts`:

```ts
import { Injectable, signal } from '@angular/core';
import { supabase } from '../supabase.client';
import { DistMessage } from '../models/message';

@Injectable({ providedIn: 'root' })
export class MessageService {
  readonly messages = signal<DistMessage[]>([]);

  async load(): Promise<void> {
    const { data, error } = await supabase
      .from('messages').select('*').order('created_at', { ascending: false });
    if (!error && data) this.messages.set(data as DistMessage[]);
  }

  async send(distributorId: number, body: string): Promise<string | null> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('messages')
      .insert({ distributor_id: distributorId, body, from_profile_id: auth.user?.id ?? null });
    if (error) return error.message;
    await this.load();
    return null;
  }
}
```

- [ ] **Step 6: Build + test**

Run: `npm run build && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: build success, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/core/services/order.service.ts src/app/core/services/order.service.spec.ts src/app/core/services/payment.service.ts src/app/core/services/message.service.ts
git commit -m "feat(services): order(+limit rule), payment, message services"
```

---

## Task 9: Rewire AppComponent onto the services

**Files:**
- Modify: `src/app/app.component.ts`

This replaces the in-file `distributors`/`products`/`orders`/`payments`/`messages` arrays and all `localStorage` usage with the services. Computed signals that derived debt/achieved client-side are replaced by `DistributorService.stats`. The З-2 invoice generator stays as-is.

- [ ] **Step 1: Inject services and seed signals on init**

In `AppComponent`, inject all services. Add an `async ngOnInit()` (implement `OnInit`) that, after a session is restored / login succeeds, calls `Promise.all([...load()])` for product, distributor, order, payment, message, notification services. Replace the component's `products`/`distributors`/`orders`/`payments`/`messages` signals with getters that return the corresponding service signal (e.g. `get products() { return this.productService.products; }`), or reference services directly in the template.

- [ ] **Step 2: Replace mutation methods with service calls**

Map each existing method to a service call (await + reload happens in the service):
- `createOrder` / `createOrderFromPrice` → compute status with `decideStatus(stat.debt, amount, stat.credit_limit)`, then `orderService.create(...)`.
- `confirmOrder`/`shipOrder`/`cancelOrder`/`deliverOrder`/`updateOrderStatus` → `orderService.setStatus(...)`.
- `savePayment`/`deletePayment` → `paymentService.add/remove`.
- `sendMessage` → `messageService.send`.
- `saveDiscount` → `distributorService.setDiscount`.
- `saveEditProduct` → `productService.update`.
- Remove `removeOrderItem`/`updateOrderItemQty`/`confirmAddItem` client array mutations OR re-implement against `order_items` (defer item-level editing to Plan 2B if large; keep status flow working now).

- [ ] **Step 3: Delete dead code**

Remove: the top-of-file `initialAccounts`, `distributors`, `orders` mock arrays (keep them only if still referenced by a demo path — prefer deletion); the four `localStorage` `effect()`s in the constructor; the `kp_remember` block; `nextOrderId` (the DB trigger now generates `order_code`); `computedNotifications` (replaced by `notificationService`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success, no references to `localStorage` remain (`grep -rn localStorage src/app` returns nothing).

- [ ] **Step 5: Commit**

```bash
git add src/app/app.component.ts
git commit -m "refactor(app): drive UI from Supabase services; remove localStorage + mock arrays"
```

---

## Task 10: End-to-end smoke verification

**Files:** none

- [ ] **Step 1: Serve the app**

Run: `npm start`
Open `http://localhost:4200`.

- [ ] **Step 2: Login as each role**

Log in as `admin` / `admin2026`, `marjan` / `manager2026`, `astana` / `kitapal2026`.
Expected: each logs in; admin sees all 11 distributors; `astana` (distributor) sees only Paidaly (RLS enforced server-side).

- [ ] **Step 3: Verify computed numbers render**

On the overview/debts screens, confirm Paidaly shows debt ≈ 8 050 087 and achieved ≈ 4 726 848 (from `distributor_stats`).

- [ ] **Step 4: Create an order as a distributor**

As `astana`, add items from the price list and submit. Confirm a new row appears with a generated `order_code` like `KP-AST-...` and status `pending` (or `draft` if over limit).

- [ ] **Step 5: Confirm no localStorage data persistence**

In dev tools → Application → Local Storage: only Supabase auth session keys present (no `kp_orders`/`kp_payments`/etc.).

- [ ] **Step 6: Final commit (any fixes)**

```bash
git add -A && git commit -m "test(app): e2e smoke verification on Supabase" || echo "nothing to commit"
```

---

## Self-Review notes

- Spec coverage: auth (Supabase Auth + short-login mapping) ✓, services as the only Supabase touch-point ✓, signals retained ✓, localStorage removed ✓, RLS hardening (private schema) ✓. Router + component split are intentionally Plan 2B.
- The З-2 invoice generator (`generateNakladnoy`) is untouched and moves in Plan 2B.
- Item-level order editing (`updateOrderItemQty` etc.) may be deferred to Plan 2B if rewiring is large; the order status lifecycle must work in 2A.

## Notes for Plan 2B (component split + router)

Introduce `app.routes.ts` with lazy routes; extract `layout` (sidebar/shell), then one feature component per screen (overview, goals, distributors, price, orders, debts, users, notifications, settings); move `generateNakladnoy` into an `order-invoice` util/service; thin `AppComponent` down to the router outlet + shell.
