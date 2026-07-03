# Half-year Target Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the dead "Жаңа 6 айлық кезең" button so admin can backfill missing `targets` rows for the current half-year period, add inline editing for each distributor's target, and make the Overview period subtitle reflect the active half instead of a hardcoded string.

**Architecture:** All new logic lives in the existing `DistributorService` (one new public method to backfill missing period rows, one to upsert a single target, plus three small pure helper functions extracted for testability) and the existing `AppComponent` (new signals/methods mirroring the already-shipped discount-editing pattern). No new files, no schema changes — `targets` and its RLS policies already support everything needed.

**Tech Stack:** Angular 18 (standalone component, signals), Supabase JS client, TypeScript. This repo has no working `ng test` harness (no karma/jasmine dependency, no `test` architect target in `angular.json`) — verification instead uses the project's actual existing convention: `node scripts/check-*.mjs` marker scripts that grep source files for exact strings, plus `npx tsc --noEmit -p tsconfig.app.json` for type-checking, plus a final manual run through the UI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-half-year-target-rollover-design.md`
- Only admin can write to `targets` (enforced both client-side via `role() === 'admin'` guards, matching the existing discount-editing pattern, and server-side via the existing `targets_admin_write` RLS policy — no RLS changes needed).
- The backfill only ever inserts rows with `amount: 0` for distributors missing a row in the current period; it never updates or deletes existing rows.
- No toast/confirmation UI after clicking "Жаңа 6 айлық кезең" — the table just re-renders.
- Reuse the existing `.discount-edit-input` / `.btn-discount-save` / `.btn-discount-cancel` / `.btn-discount-edit` CSS classes for the new target-editing controls (per spec, they're generic, not discount-specific in appearance) — do not add new CSS.

---

### Task 1: `DistributorService` — pure helpers + `currentPeriod`/`setTarget`/`ensureCurrentPeriodTargets`

**Files:**
- Modify: `src/app/core/services/distributor.service.ts`
- Modify: `scripts/check-create-distributor-flow.mjs` (its markers reference the method we're renaming)
- Create: `scripts/check-half-year-target-rollover.mjs`

**Interfaces:**
- Produces:
  - `export function halfYearPeriod(date: Date): string` — `'2026-H1'` for Jan–Jun, `'2026-H2'` for Jul–Dec, matching the existing `public.half_year_of` SQL logic.
  - `export function periodLabel(period: string): string` — `'Қаңтар – Маусым'` if `period` ends in `H1`, else `'Шілде – Желтоқсан'`.
  - `export function missingTargetDistributorIds(distributorIds: number[], coveredIds: number[]): number[]` — distributor ids present in `distributorIds` but absent from `coveredIds`.
  - `DistributorService.currentPeriod(): string` (was `private currentHalfYear(): string`, now public, delegates to `halfYearPeriod`).
  - `DistributorService.setTarget(distributorId: number, period: string, amount: number): Promise<string | null>`.
  - `DistributorService.ensureCurrentPeriodTargets(): Promise<string | null>`.

- [ ] **Step 1: Read the current file to confirm line numbers haven't drifted**

```bash
grep -n "async setDiscount\|currentHalfYear\|async createWithOpeningBalance" src/app/core/services/distributor.service.ts
```

Expected output includes `29:  async setDiscount(id: number, discount: number): Promise<string | null> {`, a line with `period: this.currentHalfYear(),`, and `116:  private currentHalfYear(): string {`. If line numbers differ, use them instead of the ones below — match on the surrounding code shown, not the line numbers.

- [ ] **Step 2: Write the failing check script**

Create `scripts/check-half-year-target-rollover.mjs`:

```js
import { readFileSync } from 'node:fs';

const files = {
  service: readFileSync(new URL('../src/app/core/services/distributor.service.ts', import.meta.url), 'utf8'),
};

const checks = [
  ['service exports halfYearPeriod', files.service, 'export function halfYearPeriod(date: Date): string {'],
  ['service exports periodLabel', files.service, 'export function periodLabel(period: string): string {'],
  ['service exports missingTargetDistributorIds', files.service, 'export function missingTargetDistributorIds(distributorIds: number[], coveredIds: number[]): number[] {'],
  ['service exposes public currentPeriod', files.service, 'currentPeriod(): string {'],
  ['service sets a single target', files.service, 'async setTarget(distributorId: number, period: string, amount: number): Promise<string | null> {'],
  ['service backfills missing targets', files.service, 'async ensureCurrentPeriodTargets(): Promise<string | null> {'],
  ['service inserts backfilled targets', files.service, '.insert(missingIds.map((id) => ({ distributor_id: id, period, amount: 0 })));'],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const forbidden = [
  ['service old private half-year name', files.service, 'private currentHalfYear(): string'],
].filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || forbidden.length > 0) {
  console.error('Half-year target rollover markers missing:');
  for (const [label, , marker] of missing) {
    console.error(`- ${label}: ${marker}`);
  }
  for (const [label, , marker] of forbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Half-year target rollover markers present (${checks.length}/${checks.length})`);
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
node scripts/check-half-year-target-rollover.mjs
```

Expected: exits non-zero, lists all 7 checks under "Half-year target rollover markers missing" (none of this code exists yet).

- [ ] **Step 4: Add the pure helper functions**

In `src/app/core/services/distributor.service.ts`, right after the imports (after the `CreateDistributorInput` interface, before `@Injectable`), add:

```ts
export function halfYearPeriod(date: Date): string {
  const half = date.getMonth() <= 5 ? 'H1' : 'H2';
  return `${date.getFullYear()}-${half}`;
}

export function periodLabel(period: string): string {
  return period.endsWith('H1') ? 'Қаңтар – Маусым' : 'Шілде – Желтоқсан';
}

export function missingTargetDistributorIds(distributorIds: number[], coveredIds: number[]): number[] {
  const covered = new Set(coveredIds);
  return distributorIds.filter((id) => !covered.has(id));
}
```

- [ ] **Step 5: Replace `private currentHalfYear()` with public `currentPeriod()`**

Find:

```ts
  private currentHalfYear(): string {
    const now = new Date();
    const half = now.getMonth() <= 5 ? 'H1' : 'H2';
    return `${now.getFullYear()}-${half}`;
  }
```

Replace with:

```ts
  currentPeriod(): string {
    return halfYearPeriod(new Date());
  }
```

- [ ] **Step 6: Update the one existing caller**

Find (inside `createWithOpeningBalance`):

```ts
        period: this.currentHalfYear(),
```

Replace with:

```ts
        period: this.currentPeriod(),
```

- [ ] **Step 7: Add `setTarget` and `ensureCurrentPeriodTargets`**

Right after the existing `setDiscount` method (ends with the closing `}` before `deleteIfEmpty`), add:

```ts
  async setTarget(distributorId: number, period: string, amount: number): Promise<string | null> {
    const { error } = await supabase
      .from('targets')
      .upsert({ distributor_id: distributorId, period, amount }, { onConflict: 'distributor_id,period' });
    if (error) return error.message;
    await this.load();
    return null;
  }

  async ensureCurrentPeriodTargets(): Promise<string | null> {
    const period = this.currentPeriod();
    const { data: existing, error: existingError } = await supabase
      .from('targets')
      .select('distributor_id')
      .eq('period', period);
    if (existingError) return existingError.message;

    const coveredIds = (existing ?? []).map((row) => row.distributor_id as number);
    const allIds = this.distributors().map((d) => d.id);
    const missingIds = missingTargetDistributorIds(allIds, coveredIds);
    if (missingIds.length === 0) return null;

    const { error: insertError } = await supabase
      .from('targets')
      .insert(missingIds.map((id) => ({ distributor_id: id, period, amount: 0 })));
    if (insertError) return insertError.message;

    await this.load();
    return null;
  }
```

- [ ] **Step 8: Run the check script again and confirm it passes**

```bash
node scripts/check-half-year-target-rollover.mjs
```

Expected: `Half-year target rollover markers present (7/7)`.

- [ ] **Step 9: Fix the now-stale markers in the older check script**

`scripts/check-create-distributor-flow.mjs` still asserts the old private/renamed method exists. Find:

```js
  ['service resolves current half year', files.service, 'private currentHalfYear(): string'],
  ['service uses current half year for target', files.service, 'period: this.currentHalfYear()'],
```

Replace with:

```js
  ['service resolves current half year', files.service, 'currentPeriod(): string'],
  ['service uses current half year for target', files.service, 'period: this.currentPeriod()'],
```

- [ ] **Step 10: Run the older check script and confirm it still passes**

```bash
node scripts/check-create-distributor-flow.mjs
```

Expected: `Create distributor flow markers present (20/20)`.

- [ ] **Step 11: Type-check**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add src/app/core/services/distributor.service.ts scripts/check-half-year-target-rollover.mjs scripts/check-create-distributor-flow.mjs
git commit -m "$(cat <<'EOF'
feat(targets): add current-period backfill and single-target upsert

DistributorService.currentPeriod() is now public (was private
currentHalfYear()), and two new methods support the upcoming
"Жаңа 6 айлық кезең" button: ensureCurrentPeriodTargets() backfills
missing target rows for distributors that don't have one for the
active half-year, and setTarget() upserts a single distributor's
target for a given period.
EOF
)"
```

---

### Task 2: `AppComponent` — target editing signals/methods + period label helper

**Files:**
- Modify: `src/app/app.component.ts`
- Modify: `scripts/check-half-year-target-rollover.mjs`

**Interfaces:**
- Consumes: `DistributorService.currentPeriod()`, `DistributorService.setTarget(...)`, `DistributorService.ensureCurrentPeriodTargets()` (Task 1), `periodLabel(period: string): string` (Task 1, imported), the local `Distributor` type already defined at the top of `app.component.ts`, `this.role()`, `this.reloadAll()` (both pre-existing).
- Produces:
  - `AppComponent.editingTargetDistId: WritableSignal<number | null>`
  - `AppComponent.editTargetStr: string`
  - `AppComponent.startEditTarget(d: Distributor): void`
  - `AppComponent.saveTarget(distId: number): Promise<void>`
  - `AppComponent.createNewPeriodTargets(): Promise<void>`
  - `AppComponent.currentPeriodLabel(): string`

- [ ] **Step 1: Confirm current line numbers**

```bash
grep -n "import { DistributorService }\|editingDiscountDistId = signal\|startEditDiscount(d: Distributor)\|async saveDiscount(distId: number)" src/app/app.component.ts
```

Expected: an import line, `editingDiscountDistId = signal<number | null>(null);`, `startEditDiscount(d: Distributor): void {`, `async saveDiscount(distId: number): Promise<void> {`. Match on surrounding code if line numbers differ.

- [ ] **Step 2: Extend the check script with (failing) component markers**

In `scripts/check-half-year-target-rollover.mjs`, add `component` to the `files` object:

```js
const files = {
  service: readFileSync(new URL('../src/app/core/services/distributor.service.ts', import.meta.url), 'utf8'),
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
};
```

Append to the `checks` array (before the closing `];`):

```js
  ['component target editing signal', files.component, 'editingTargetDistId = signal<number | null>(null)'],
  ['component start edit target', files.component, 'startEditTarget(d: Distributor): void {'],
  ['component save target', files.component, 'async saveTarget(distId: number): Promise<void> {'],
  ['component create new period targets', files.component, 'async createNewPeriodTargets(): Promise<void> {'],
  ['component period label helper', files.component, 'currentPeriodLabel(): string {'],
```

- [ ] **Step 3: Run it and confirm only the new component checks fail**

```bash
node scripts/check-half-year-target-rollover.mjs
```

Expected: non-zero exit, missing list shows exactly the 5 `component ...` entries just added (the 7 service entries from Task 1 still pass).

- [ ] **Step 4: Import `periodLabel`**

Find:

```ts
import { DistributorService } from './core/services/distributor.service';
```

Replace with:

```ts
import { DistributorService, periodLabel } from './core/services/distributor.service';
```

- [ ] **Step 5: Add the target-editing signals**

Find:

```ts
  // Discount editing (admin only)
  editingDiscountDistId = signal<number | null>(null);
  editDiscountStr = '';
```

Replace with:

```ts
  // Discount editing (admin only)
  editingDiscountDistId = signal<number | null>(null);
  editDiscountStr = '';

  // Target editing (admin only)
  editingTargetDistId = signal<number | null>(null);
  editTargetStr = '';
```

- [ ] **Step 6: Add the four new methods**

Find the existing `startEditDiscount`/`saveDiscount` pair:

```ts
  startEditDiscount(d: Distributor): void {
    this.editingDiscountDistId.set(d.id);
    this.editDiscountStr = String(Math.round(d.discount * 100));
  }

  async saveDiscount(distId: number): Promise<void> {
    if (this.role() !== 'admin') return;
    const pct = parseFloat(this.editDiscountStr);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    await this.distributorService.setDiscount(distId, pct / 100);
    await this.reloadAll();
    this.editingDiscountDistId.set(null);
  }
```

Add directly after it:

```ts
  startEditTarget(d: Distributor): void {
    this.editingTargetDistId.set(d.id);
    this.editTargetStr = String(d.target);
  }

  async saveTarget(distId: number): Promise<void> {
    if (this.role() !== 'admin') return;
    const amount = parseFloat(this.editTargetStr);
    if (isNaN(amount) || amount < 0) return;
    await this.distributorService.setTarget(distId, this.distributorService.currentPeriod(), amount);
    await this.reloadAll();
    this.editingTargetDistId.set(null);
  }

  async createNewPeriodTargets(): Promise<void> {
    if (this.role() !== 'admin') return;
    await this.distributorService.ensureCurrentPeriodTargets();
    await this.reloadAll();
  }

  currentPeriodLabel(): string {
    return periodLabel(this.distributorService.currentPeriod());
  }
```

- [ ] **Step 7: Run the check script again and confirm it passes**

```bash
node scripts/check-half-year-target-rollover.mjs
```

Expected: `Half-year target rollover markers present (12/12)`.

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/app/app.component.ts scripts/check-half-year-target-rollover.mjs
git commit -m "$(cat <<'EOF'
feat(targets): add target editing and period-label methods to AppComponent

Mirrors the existing discount-editing pattern: startEditTarget/
saveTarget for inline target edits, createNewPeriodTargets to back
the "Жаңа 6 айлық кезең" button, and currentPeriodLabel for the
dynamic Overview subtitle.
EOF
)"
```

---

### Task 3: Template wiring — button, editable Мақсат cell, dynamic period label

**Files:**
- Modify: `src/app/app.component.html`
- Modify: `scripts/check-half-year-target-rollover.mjs`

**Interfaces:**
- Consumes: everything produced by Task 2 (`createNewPeriodTargets()`, `editingTargetDistId()`, `editTargetStr`, `startEditTarget(item)`, `saveTarget(item.id)`, `currentPeriodLabel()`), plus the pre-existing `role()`, `item.target`, `kzt` pipe, and the `.discount-edit-input`/`.btn-discount-save`/`.btn-discount-cancel`/`.btn-discount-edit` CSS classes.
- Produces: no new interfaces (leaf template task).

- [ ] **Step 1: Confirm current line numbers**

```bash
grep -n "Қаңтар / Шілде кезеңі\|Жаңа 6 айлық кезең\|item.target | kzt" src/app/app.component.html
```

Expected: one hit for the Overview subtitle (~line 88), one hit for the dead button (~line 171), and hits for the Goals table Мақсат cell (~line 189) and the "Жаңа дистрибьютор" modal field label (~line 501 — leave that one alone, it's a form input label, not the bug).

- [ ] **Step 2: Extend the check script with (failing) template markers**

In `scripts/check-half-year-target-rollover.mjs`, add `template` to the `files` object:

```js
const files = {
  service: readFileSync(new URL('../src/app/core/services/distributor.service.ts', import.meta.url), 'utf8'),
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};
```

Append to `checks`:

```js
  ['template button wired', files.template, '(click)="createNewPeriodTargets()"'],
  ['template target edit input', files.template, '[(ngModel)]="editTargetStr"'],
  ['template save target wired', files.template, '(click)="saveTarget(item.id)"'],
  ['template dynamic period label', files.template, '{{ currentPeriodLabel() }}'],
```

Add to the `forbidden` array:

```js
  ['template hardcoded period subtitle', files.template, 'Қаңтар / Шілде кезеңі'],
```

- [ ] **Step 3: Run it and confirm only the new template checks fail**

```bash
node scripts/check-half-year-target-rollover.mjs
```

Expected: non-zero exit, missing list shows exactly the 4 `template ...` entries (the 12 service+component entries still pass, and the forbidden check doesn't yet fire since the hardcoded string is still present at this point — that's expected, it becomes a *pass* only once Step 5 removes it).

- [ ] **Step 4: Wire the button**

Find:

```html
        <button type="button">Жаңа 6 айлық кезең</button>
```

Replace with:

```html
        <button type="button" *ngIf="role() === 'admin'" (click)="createNewPeriodTargets()">Жаңа 6 айлық кезең</button>
```

- [ ] **Step 5: Make the Overview period subtitle dynamic**

Find:

```html
          <small>Қаңтар / Шілде кезеңі</small>
```

Replace with:

```html
          <small>{{ currentPeriodLabel() }}</small>
```

- [ ] **Step 6: Make the Goals table "Мақсат" cell editable**

Find:

```html
          <tr *ngFor="let item of distributors()">
            <td>{{ item.city }}</td>
            <td>{{ item.company }}</td>
            <td>{{ item.target | kzt }}</td>
            <td>{{ item.achieved | kzt }}</td>
```

Replace with:

```html
          <tr *ngFor="let item of distributors()">
            <td>{{ item.city }}</td>
            <td>{{ item.company }}</td>
            <td>
              <ng-container *ngIf="role() === 'admin' && editingTargetDistId() === item.id; else targetView">
                <input type="number" class="discount-edit-input" [(ngModel)]="editTargetStr" min="0" step="1000">
                <button type="button" class="btn-discount-save" title="Сақтау" (click)="saveTarget(item.id)">✓</button>
                <button type="button" class="btn-discount-cancel" title="Бас тарту" (click)="editingTargetDistId.set(null)">✕</button>
              </ng-container>
              <ng-template #targetView>
                {{ item.target | kzt }}
                <button type="button" class="btn-discount-edit" *ngIf="role() === 'admin'" title="Мақсатты өзгерту" (click)="startEditTarget(item)">✎</button>
              </ng-template>
            </td>
            <td>{{ item.achieved | kzt }}</td>
```

- [ ] **Step 7: Run the check script again and confirm full pass**

```bash
node scripts/check-half-year-target-rollover.mjs
```

Expected: `Half-year target rollover markers present (16/16)`.

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/app/app.component.html scripts/check-half-year-target-rollover.mjs
git commit -m "$(cat <<'EOF'
feat(targets): wire up new-period button and inline target editing

"Жаңа 6 айлық кезең" now backfills missing target rows for the
active half-year; the Мақсат column in the Goals table is editable
inline the same way Жеңілдік already is; the Overview period
subtitle reflects the actual active half instead of a hardcoded
Jan/July string.
EOF
)"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises the full stack built in Tasks 1–3 against the real Supabase project.

- [ ] **Step 1: Start the dev server**

Use the `run` skill (or `npm start`) to launch the app and open it in a browser.

- [ ] **Step 2: Log in as admin**

Use an existing admin account (see `scripts/create-auth-users.mjs` for how accounts are provisioned, or ask the user for admin credentials).

- [ ] **Step 3: Check Overview**

Navigate to the overview/dashboard screen. Confirm the subtitle under "6 айлық мақсат" reads "Шілде – Желтоқсан" (since today's date is in H2), not "Қаңтар / Шілде кезеңі".

- [ ] **Step 4: Open Мақсаттар (Goals) and click "Жаңа 6 айлық кезең"**

Confirm no console error appears and the table still renders all distributors (targets that were previously blank/0 for this period remain 0 for now — that's expected, they were just backfilled).

- [ ] **Step 5: Edit a target inline**

Click the ✎ next to a distributor's "Мақсат" value, type a new number (e.g. `15000000`), click ✓. Confirm the cell updates to show the new value formatted as currency.

- [ ] **Step 6: Confirm persistence**

Reload the page. Confirm the edited target value is still shown (proves the upsert actually persisted to Supabase, not just local state).

- [ ] **Step 7: Confirm the Overview total updates**

Go back to Overview. Confirm "6 айлық мақсат" (the sum across all visible distributors) increased by the amount just set in Step 5.

- [ ] **Step 8: Report result to the user**

Summarize what was checked and whether all steps passed. If anything failed, stop and diagnose before considering the feature done — do not report success without having actually run through these steps.

---
