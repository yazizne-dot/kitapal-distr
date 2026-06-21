# Component Split + Router — Implementation Plan (Plan 2B of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the ~1670-line monolithic `AppComponent` + 1460-line template into focused, routed feature components with lazy loading, move shared state into a session facade, and close the last data gap (item-level order editing now persists to Supabase).

**Architecture:** A `SessionService` (signals + cross-cutting computeds + data orchestration) becomes the single shared brain; the data services from Plan 2A stay the only Supabase touch-point. `AppComponent` shrinks to a shell (sidebar + profile panel + `<router-outlet>`). Each screen becomes a standalone, lazily-routed component that injects `SessionService` + the services it needs and renders its slice of the template. Global CSS stays global (moved to `src/styles.css`) so every component shares the existing styling — no risky per-component CSS surgery.

**Tech Stack:** Angular 18 standalone + signals + Router (lazy `loadComponent`), Supabase (existing services), one new RLS migration + Edge nothing.

**Prerequisite:** Plan 2A complete (it is). Node 20 via nvm — harness shell needs `export PATH="/c/nvm4w/nodejs:$PATH"`. Build gate: `npm run build` after each task; AOT type-checks templates.

**Spec:** `docs/superpowers/specs/2026-06-20-supabase-architecture-and-refactor-design.md` (section 4).

---

## Why a SessionService first

Feature components can't each own the shared state the monolith holds (`role`, `currentUser`, `selectedDistributorId`, the visible-rows computeds, login/logout, the initial data load). That state must live in one shared place both the shell and every routed component can inject. `SessionService` is that place. We build it first, point `AppComponent` at it (app still works as one screen), then peel screens off one by one — each step stays green.

## Target File Structure

```
src/app/
  core/
    services/            (existing: auth, product, distributor, order, payment, message, notification, account)
    session.service.ts   NEW — role/currentUser/selectedDistributorId, login/logout, reloadAll, shared computeds
    order-invoice.util.ts NEW — generateNakladnoy(order, distributor, managerName) moved out of AppComponent
    auth.guard.ts        NEW — CanActivate (signed-in) + role-based child guards
  features/
    login/login.component.{ts,html}
    layout/shell.component.{ts,html}        (sidebar + profile panel + <router-outlet>)
    overview/overview.component.{ts,html}
    goals/goals.component.{ts,html}
    distributors/distributors.component.{ts,html}   (list + detail sub-view)
    price/price.component.{ts,html}
    orders/orders.component.{ts,html}
    debts/debts.component.{ts,html}
    users/users.component.{ts,html}
    notifications/notifications.component.{ts,html}
    info/excel.component.html + security.component.html   (static info screens)
    settings/profile-panel.component.{ts,html}
  app.routes.ts          NEW
  app.component.ts        becomes the shell host (or replaced by ShellComponent)
src/styles.css           receives the former app.component.css (global)
```

---

## Stage 0 — Close the data gap: persist order-item editing

### Task 0.1: Manager RLS for order_items

**Files:** Create `supabase/migrations/<ts>_order_items_manager.sql` (`npx supabase migration new order_items_manager`)

Managers can change order status but currently have NO `order_items` write policy, so manager item edits can't persist. Add it.

- [ ] **Step 1: Write migration**

```sql
-- Managers may edit items of their own distributors' orders while pending/draft/confirmed.
create policy order_items_manager_write on public.order_items for all
  using (private.my_role() = 'manager' and exists (
           select 1 from public.orders o
           where o.id = order_id and private.can_access_distributor(o.distributor_id)
             and o.status in ('draft','pending','confirmed')))
  with check (private.my_role() = 'manager' and exists (
           select 1 from public.orders o
           where o.id = order_id and private.can_access_distributor(o.distributor_id)
             and o.status in ('draft','pending','confirmed')));
```

- [ ] **Step 2: Push + verify**

Run: `printf 'y\n' | npx supabase db push`
Then: `npx supabase db query --linked -o csv "select policyname from pg_policies where tablename='order_items' order by policyname;"`
Expected: includes `order_items_manager_write`.

- [ ] **Step 3: Commit** — `git commit -m "feat(db): manager RLS write policy for order_items"`

### Task 0.2: OrderService item methods

**Files:** Modify `src/app/core/services/order.service.ts`

- [ ] **Step 1: Add methods** (after `setStatus`):

```ts
  async addItem(orderId: string, productId: number, qty: number, unitPrice: number, discount: number): Promise<string | null> {
    const { error } = await supabase.from('order_items')
      .insert({ order_id: orderId, product_id: productId, qty, unit_price: unitPrice, discount });
    if (error) return error.message;
    await this.load();
    return null;
  }

  async updateItemQty(itemId: number, qty: number): Promise<string | null> {
    const { error } = await supabase.from('order_items').update({ qty }).eq('id', itemId);
    if (error) return error.message;
    await this.load();
    return null;
  }

  async removeItem(itemId: number): Promise<string | null> {
    const { error } = await supabase.from('order_items').delete().eq('id', itemId);
    if (error) return error.message;
    await this.load();
    return null;
  }
```

Note: `order_items.amount` is a generated column (`qty*unit_price`) — never send it.

- [ ] **Step 2: Build** — `npm run build` (expected: success).
- [ ] **Step 3: Commit** — `git commit -m "feat(orders): order_items add/update/remove service methods"`

### Task 0.3: Rewire AppComponent item editing + carry item id

**Files:** Modify `src/app/app.component.ts`

The component `OrderItem` view needs the DB `order_items.id`. The mapper in `reloadAll` already has `i.id` available from the service — include it.

- [ ] **Step 1:** In `reloadAll`, the order item mapping must include `id: i.id` (the OrderItem type already allows `id?`). Confirm/add `id: i.id` to each mapped item.

- [ ] **Step 2:** Replace the three local-only methods. `confirmAddItem`, `updateOrderItemQty`, `removeOrderItem` currently do `this.orders.update(...)`. Rewrite each to call the service against the selected order's `uuid` and the item's `id`, then `await this.reloadAll()`:

```ts
  async confirmAddItem(): Promise<void> {
    const order = this.selectedOrder();
    const product = this.products().find(p => p.id === Number(this.addItemProductId));
    if (!order?.uuid || !product) return;
    const distributor = this.orderDistributor(order);
    const discount = this.effectiveDiscount(product, distributor);
    const unitPrice = Math.round(product.basePrice * (1 - discount));
    const qty = Math.max(1, Number(this.addItemQty) || 1);
    await this.orderService.addItem(order.uuid, product.id, qty, unitPrice, discount);
    await this.reloadAll();
    this.addItemModal.set(false);
    this.addItemQuery.set('');
  }

  async updateOrderItemQty(orderId: string, productId: number, newQty: number): Promise<void> {
    const order = this.orders().find(o => o.id === orderId);
    const item = order?.items.find(i => i.productId === productId);
    if (!item?.id) return;
    await this.orderService.updateItemQty(item.id, Math.max(1, Math.round(newQty) || 1));
    await this.reloadAll();
  }

  async removeOrderItem(orderId: string, productId: number): Promise<void> {
    const order = this.orders().find(o => o.id === orderId);
    const item = order?.items.find(i => i.productId === productId);
    if (!item?.id) return;
    await this.orderService.removeItem(item.id);
    await this.reloadAll();
  }
```

- [ ] **Step 3: Build** — `npm run build`.
- [ ] **Step 4: Manual verify** — as `marjan`, open a pending order, change a qty / add / remove an item, refresh the page → change persists.
- [ ] **Step 5: Commit** — `git commit -m "feat(orders): persist item edits to Supabase"`

---

## Stage 1 — SessionService (shared brain), app still one screen

### Task 1.1: Create SessionService

**Files:** Create `src/app/core/session.service.ts`

Move the cross-cutting state + orchestration out of `AppComponent` into an injectable singleton. It owns: `role`, `currentUser`, `signedIn`, `selectedDistributorId`; `login/loginDemo/logout/changePassword` (delegating to `AuthService`); `reloadAll()` and the camelCase mapping; and the shared computeds (`effectiveDistributors`, `visibleDistributors`, `selectedDistributor`, `visibleOrders`, `computedNotifications`, totals).

- [ ] **Step 1:** Create the service. Move the corresponding fields/methods/computeds verbatim from `AppComponent` into it (they already exist — relocate, swapping `this.xService` injects into the service). Keep the camelCase view types in `core/models` (promote the inline `Distributor`/`Order`/etc. types from `app.component.ts` into the models files if not already there; reuse Plan 2A models where they fit).
- [ ] **Step 2:** In `AppComponent`, delete the moved members and instead expose them via the injected `session` (e.g. `get role() { return this.session.role; }`) so the existing template keeps compiling unchanged.
- [ ] **Step 3: Build** — `npm run build` (app behaves exactly as before, now backed by SessionService).
- [ ] **Step 4: Commit** — `git commit -m "refactor(core): extract SessionService (shared state + orchestration)"`

### Task 1.2: Move invoice generator out

**Files:** Create `src/app/core/order-invoice.util.ts`; modify `app.component.ts`

- [ ] **Step 1:** Move `generateNakladnoy` (and its number-to-words helpers) into `order-invoice.util.ts` as an exported function `openNakladnoy(order, distributor, managerName)`. Replace the component method body with a call to it.
- [ ] **Step 2: Build**; **Step 3: Commit** — `git commit -m "refactor: move З-2 invoice generator to util"`

---

## Stage 2 — Router + global CSS + shell

### Task 2.1: Global CSS

**Files:** Move `src/app/app.component.css` → append into `src/styles.css`; remove `styleUrl` usage as components are created.

- [ ] **Step 1:** Copy the full contents of `app.component.css` into `src/styles.css` (global). Keep `app.component.css` for now (shell still uses it) — duplication is temporary and removed in the final task.
- [ ] **Step 2: Build**; **Step 3: Commit** — `git commit -m "chore(styles): promote app styles to global styles.css"`

### Task 2.2: Router scaffolding + auth guard

**Files:** Create `src/app/app.routes.ts`, `src/app/core/auth.guard.ts`; modify `src/main.ts`

- [ ] **Step 1: Guard** — `auth.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const authGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.signedIn() ? true : router.createUrlTree(['/login']);
};

export const roleGuard = (roles: string[]): CanActivateFn => () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return roles.includes(session.role()) ? true : router.createUrlTree(['/overview']);
};
```

- [ ] **Step 2: Routes** — `app.routes.ts` with lazy `loadComponent` for each screen, `authGuard` on the shell, `roleGuard(['admin'])` on `users`. (Each `loadComponent` points to a component created in Stage 3; until then, point them at a temporary placeholder or create components in dependency order.)

- [ ] **Step 3: Bootstrap** — `main.ts`:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, { providers: [provideRouter(routes)] })
  .catch((e) => console.error(e));
```

- [ ] **Step 4:** Build + commit — `git commit -m "feat(router): routes + auth/role guards + provideRouter"`

### Task 2.3: Shell + Login components

**Files:** Create `features/layout/shell.component.*`, `features/login/login.component.*`

- [ ] **Step 1: Login** — move the login-screen template slice (`*ngIf="!signedIn()"` block) from `app.component.html` into `login.component.html`; move `email/password/loginError/login()/loginDemo()` usage to `LoginComponent` injecting `SessionService`; on success `router.navigate(['/overview'])`.
- [ ] **Step 2: Shell** — move the sidebar + profile panel + top bar into `shell.component.html`, ending with `<router-outlet>`. Sidebar menu items become `routerLink`s built from `session.currentMenu()`. `ShellComponent` is the parent route hosting `authGuard` + child routes.
- [ ] **Step 3:** `AppComponent` becomes just `<router-outlet>` (root). Build + manual verify login → shell renders + navigation works.
- [ ] **Step 4: Commit** — `git commit -m "feat(layout): shell + login components on the router"`

---

## Stage 3 — Extract one feature component per screen

For EACH screen below, the task is the same shape (one commit each):
1. `npx ng g component features/<name> --standalone` (or hand-create).
2. Cut that screen's `<section *ngIf="activeScreen()==='<name>'">…</section>` slice from `app.component.html` into `<name>.component.html` (remove the `*ngIf` wrapper — routing handles visibility).
3. Move the methods/computeds/signals that ONLY that screen uses from `SessionService`/`AppComponent` into the component; shared ones stay in `SessionService` (injected).
4. Add the route `loadComponent` (already stubbed in Task 2.2).
5. `npm run build` (AOT verifies all bindings resolve) + quick manual check, then commit.

- [ ] **Task 3.1: overview** (`overview.component`) — progress cards/totals.
- [ ] **Task 3.2: goals** (`goals.component`) — мақсаттар.
- [ ] **Task 3.3: distributors** (`distributors.component`) — list + the `distributorDetailId()` detail sub-view (keep both in this component).
- [ ] **Task 3.4: price** (`price.component`) — price list, filters, grid/list, add-to-draft, `createOrderFromPrice`.
- [ ] **Task 3.5: orders** (`orders.component`) — list + detail + status actions + add-item/ship modals + invoice button.
- [ ] **Task 3.6: debts** (`debts.component`) — debts/limits + payments (modal, add/delete).
- [ ] **Task 3.7: users** (`users.component`, `roleGuard(['admin'])`) — account CRUD via AccountService.
- [ ] **Task 3.8: notifications** (`notifications.component`).
- [ ] **Task 3.9: settings** (`profile-panel.component`) — password/notifications/language (move from the profile dropdown or keep in shell; if it stays in shell, skip routing it).
- [ ] **Task 3.10: info screens** — `excel` + `security` as small static components (content moved verbatim).

---

## Stage 4 — Cleanup

- [ ] **Task 4.1:** Delete the now-empty `app.component.html` screen slices and the duplicated `app.component.css` (styles now global). `AppComponent` = `<router-outlet>` only.
- [ ] **Task 4.2:** Re-tighten the `anyComponentStyle` budget in `angular.json` back toward default now that CSS is global/smaller; `npm run build`.
- [ ] **Task 4.3:** Full manual walkthrough under all three roles; commit.

---

## Self-Review notes

- Spec section 4 (folders: core/shared/features, services-only Supabase access, signals, lazy routes) — covered by Stages 1–3.
- Data gap (item editing) — Stage 0 (+ manager RLS).
- Risk control: SessionService first keeps every intermediate step building; global CSS avoids per-component style breakage; AOT build is the gate each task.
- Out of scope (future): Google OAuth (deferred), persisting profile prefs (notifications/language), splitting the 3146-line CSS per component, real Excel import.
