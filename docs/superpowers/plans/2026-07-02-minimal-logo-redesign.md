# Minimal Logo Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Angular distributor portal with a cleaner, simpler minimalist interface using the Kitapal logo color as the main accent.

**Architecture:** Keep the existing Angular component structure and business logic unchanged. Apply the redesign through scoped CSS tokens and component style overrides in `src/app/app.component.css`, with a lightweight static guard script to verify the key design system markers stay present.

**Tech Stack:** Angular 18, CSS, Node.js script-based verification.

---

### Task 1: Add Design Guard

**Files:**
- Create: `scripts/check-minimal-design.mjs`

- [ ] **Step 1: Write the failing test**

Create a Node script that reads `src/app/app.component.css` and asserts the final redesign contains these markers:

```js
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/app.component.css', import.meta.url), 'utf8');

const checks = [
  ['Kitapal primary token', '--kitapal-primary: #B52278'],
  ['Minimal page token', '--surface-page: #fbfafc'],
  ['Soft border token', '--border-soft: #eadde6'],
  ['Simplified shell columns', 'grid-template-columns: minmax(220px, 248px) minmax(0, 1fr)'],
  ['Mobile horizontal navigation', 'grid-template-columns: 1fr;'],
  ['Minimal override marker', 'Minimal Kitapal redesign overrides'],
];

const missing = checks.filter(([, marker]) => !css.includes(marker));

if (missing.length > 0) {
  console.error('Minimal design markers missing:');
  for (const [label, marker] of missing) {
    console.error(`- ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Minimal design markers present (${checks.length}/${checks.length})`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-minimal-design.mjs`

Expected: FAIL with missing minimal design markers.

### Task 2: Implement Minimal CSS Redesign

**Files:**
- Modify: `src/app/app.component.css`
- Modify: `src/styles.css`

- [ ] **Step 1: Add CSS tokens and shell overrides**

Append a final override block to `src/app/app.component.css` defining Kitapal color tokens, calmer surfaces, compact sidebar, clearer topbar, softer cards, simplified tables, and mobile navigation.

- [ ] **Step 2: Refresh global page typography**

Update `src/styles.css` body font stack and background to match the app-level tokens.

- [ ] **Step 3: Run design guard**

Run: `node scripts/check-minimal-design.mjs`

Expected: PASS.

### Task 3: Verify Angular Compile

**Files:**
- No code changes expected.

- [ ] **Step 1: Run Angular build**

Run: `npm run build`

Expected in a supported Node environment: PASS. In the current environment, Node `v24.16.0` is unsupported by Angular 18 and may fail before reporting app code errors.

- [ ] **Step 2: If build is blocked by Node version, record the exact blocker**

Run: `npx ng version`

Expected: Angular CLI reports Node `v24.16.0` is unsupported.
