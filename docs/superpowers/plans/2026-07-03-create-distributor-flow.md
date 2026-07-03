# Create Distributor Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create a new distributor from the Distributor screen, including discount, credit limit, target, and optional opening debt.

**Architecture:** Add a scoped creation method to `DistributorService` that writes `distributors`, `targets`, and optional opening-balance order rows through the existing Supabase client under admin RLS. Add modal state and save handling in `AppComponent`, and wire the existing admin-only Distributor button to open the modal.

**Tech Stack:** Angular 18, Supabase JS, CSS, Node script verification.

---

### Task 1: Guard

**Files:**
- Create: `scripts/check-create-distributor-flow.mjs`

- [ ] Add a Node script that verifies the service method, modal state, HTML modal, and admin button markers exist.
- [ ] Run `node scripts/check-create-distributor-flow.mjs` and verify it fails before implementation.

### Task 2: Service

**Files:**
- Modify: `src/app/core/services/distributor.service.ts`

- [ ] Add `CreateDistributorInput`.
- [ ] Add `createWithOpeningBalance(input)` that inserts a distributor, upserts the current target, creates `OPENING-BALANCE` product if needed, and creates a confirmed opening-balance order item when `openingDebt > 0`.

### Task 3: UI

**Files:**
- Modify: `src/app/app.component.ts`
- Modify: `src/app/app.component.html`

- [ ] Add modal state and form fields.
- [ ] Wire the Distributor screen admin button to `openDistributorModal()`.
- [ ] Add modal fields for company, city, discount %, credit limit, target, opening debt, and phone.
- [ ] Save through `distributorService.createWithOpeningBalance`, reload data, and open the new distributor card.

### Task 4: Verify

**Files:**
- No additional files.

- [ ] Run `node scripts/check-create-distributor-flow.mjs`.
- [ ] Run `npm run build`.
