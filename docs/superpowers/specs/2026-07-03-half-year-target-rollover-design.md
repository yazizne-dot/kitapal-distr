# Half-year target rollover — design

## Problem

`distributor_stats.target` (shown as "6 айлық мақсат" on the manager/admin overview) is
computed by joining `public.targets` on `period = public.current_half_year()`
(`supabase/migrations/20260620182618_views.sql`). `current_half_year()` is derived from
`current_date`: months 1–6 → `<year>-H1`, months 7–12 → `<year>-H2`
(`supabase/migrations/20260620182605_functions.sql`).

`supabase/seed.sql` only seeded `targets` rows for period `2026-H1`. As of 2026-07-01 the
system rolled into `2026-H2`, so every existing distributor's target join now misses and
`distributor_stats.target` falls back to `0`. This is visible as `0` on the manager
overview ("6 айлық мақсат") and `0%` for every row in "Мақсат прогресі".

New distributors created via `DistributorService.createWithOpeningBalance` already write
a target row for `this.currentHalfYear()` at creation time (fixed in commit `57e5888`), so
they're unaffected — the gap only affects distributors that existed before the H1→H2
rollover and never got an H2 target row.

There is currently no UI to add/update a target for an existing distributor for the active
period. The "Жаңа 6 айлық кезең" button on the Мақсаттар (Goals) screen
(`app.component.html:171`) has no click handler at all.

## Scope

1. Wire "Жаңа 6 айлық кезең" to backfill missing `targets` rows (amount `0`) for the
   current period, for any distributor that doesn't have one yet. Existing rows for the
   current period (including ones just auto-created for new distributors) are left
   untouched. The button has no enabled/disabled state — it's always clickable, and it's a
   safe no-op when nothing is missing.
2. Make the "Мақсат" column in the Goals table inline-editable for admin, mirroring the
   existing "Жеңілдік" (discount) edit UX (pencil icon → number input → ✓/✕), so admin can
   set the real target per distributor after the backfill. Saving upserts into `targets`
   for `(distributor_id, current_period)` — this also means editing works even without
   the bulk-backfill step, since upsert creates the row if missing.
3. No toast/confirmation dialog after clicking "Жаңа 6 айлық кезең" — the Goals table
   simply re-renders with the freshly backfilled rows (still showing `0` until edited).
4. Bonus fix bundled into this task: the "Қаңтар / Шілде кезеңі" subtitle under "6 айлық
   мақсат" on the Overview screen (`app.component.html:88`) is a hardcoded string that
   always reads "Jan/July period" regardless of which half is actually active. Replace it
   with a label computed from the current period (`Қаңтар – Маусым` for H1, `Шілде –
   Желтоқсан` for H2).

## Out of scope

- Any change to how `current_half_year()` / `half_year_of()` are computed in SQL.
- Retroactively fixing historical `achieved`/`debt` figures — those already recompute
  correctly per-period since they're derived from `order_totals`, not a period-keyed
  table.
- Any confirmation/undo flow for the backfill — it only ever inserts rows with amount `0`
  for distributors that don't have one, never overwrites or deletes.

## Implementation

### `DistributorService` (`src/app/core/services/distributor.service.ts`)

- Promote the existing `private currentHalfYear()` to `public currentPeriod()` (rename to
  read better from the component/template; same logic, no behavior change). Update the one
  internal caller (`createWithOpeningBalance`).
- Add `async setTarget(distributorId: number, period: string, amount: number): Promise<string | null>`:
  upserts `{ distributor_id: distributorId, period, amount }` into `targets` with
  `onConflict: 'distributor_id,period'`, returns `error.message` on failure, otherwise calls
  `this.load()` and returns `null`. Mirrors the existing `setDiscount` method shape.
- Add `async ensureCurrentPeriodTargets(): Promise<string | null>`:
  - `period = this.currentPeriod()`
  - select `distributor_id` from `targets` where `period = period` → build a `Set` of
    covered ids
  - `missing = this.distributors().filter(d => !covered.has(d.id))`
  - if `missing.length === 0`, return `null` (no-op, no network write)
  - otherwise bulk `insert` rows `{ distributor_id: d.id, period, amount: 0 }` for each
    missing distributor, return `error.message` on failure, otherwise `this.load()` and
    return `null`.

### `AppComponent` (`src/app/app.component.ts`)

- `editingTargetDistId = signal<number | null>(null)` and `editTargetStr = ''`, alongside
  the existing `editingDiscountDistId` / `editDiscountStr`.
- `startEditTarget(d: Distributor): void` — sets `editingTargetDistId` and seeds
  `editTargetStr` from `d.target`. Mirrors `startEditDiscount`.
- `async saveTarget(distId: number): Promise<void>` — guards `role() === 'admin'`, parses
  `editTargetStr` as a non-negative number, calls
  `this.distributorService.setTarget(distId, this.distributorService.currentPeriod(), amount)`,
  then `await this.reloadAll()`, then clears `editingTargetDistId`. Mirrors `saveDiscount`.
- `async createNewPeriodTargets(): Promise<void>` — guards `role() === 'admin'`, calls
  `this.distributorService.ensureCurrentPeriodTargets()`, then `await this.reloadAll()`.
- `currentPeriodLabel(): string` — returns `'Қаңтар – Маусым'` if
  `this.distributorService.currentPeriod()` ends in `H1`, else `'Шілде – Желтоқсан'`. Plain
  method (not a signal/computed) since it only depends on today's date, same treatment as
  the existing `CURRENT_MONTH` constant.

### Template (`src/app/app.component.html`)

- Line ~171: `<button type="button" (click)="createNewPeriodTargets()">Жаңа 6 айлық
  кезең</button>`.
- Goals table "Мақсат" `<td>` (~line 189): replace the plain
  `{{ item.target | kzt }}` with the same edit/view toggle structure already used for
  "Жеңілдік" (`*ngIf="role() === 'admin' && editingTargetDistId() === item.id; else
  targetView"`), using `editTargetStr` + `saveTarget(item.id)` / `startEditTarget(item)`.
- Line 88 (Overview): replace `<small>Қаңтар / Шілде кезеңі</small>` with
  `<small>{{ currentPeriodLabel() }}</small>`.

### CSS

No new classes needed — reuse `.discount-edit-input`, `.btn-discount-save`,
`.btn-discount-cancel`, `.btn-discount-edit` class names generically (they're already
plain input/button styles, not discount-specific in appearance) or duplicate them under
`target-*` names if we want the class names to read cleanly. Decision: reuse the existing
classes as-is to avoid dead CSS — visually identical controls.

## Testing

- Manual verification (per `run`/`verify` skill): log in as admin, open Мақсаттар, confirm
  clicking "Жаңа 6 айлық кезең" doesn't error, table still shows the same distributors
  (now with a `0` target for the ones that were missing one), edit a target inline, confirm
  it persists after reload and the Overview "6 айлық мақсат" total updates accordingly.
- No new automated test harness exists in this repo for Supabase-backed flows beyond the
  `scripts/check-*.mjs` marker-based smoke scripts; follow that existing convention if a
  script is added for this flow (optional, not required for merge).
