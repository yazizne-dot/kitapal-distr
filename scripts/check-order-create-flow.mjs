import { readFileSync } from 'node:fs';

const files = {
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};

const checks = [
  ['current month is computed', files.component, 'readonly CURRENT_MONTH = this.currentMonthKey();'],
  ['initial distributor month uses current month', files.component, 'distributorOrderMonth = signal<string>(this.CURRENT_MONTH);'],
  ['current month helper exists', files.component, 'private currentMonthKey(): string'],
  ['create order saving signal', files.component, 'orderCreating = signal(false)'],
  ['quick order double submit guard', files.component, "if (this.orderCreating()) return;"],
  ['price order double submit guard', files.component, "if (items.length === 0 || this.orderCreating()) return;"],
  ['quick order sets current month tab', files.component, 'this.distributorOrderMonth.set(this.CURRENT_MONTH);'],
  ['price order sets current month tab', files.component, 'this.distributorOrderMonth.set(this.CURRENT_MONTH);'],
  ['quick order resets saving flag', files.component, 'this.orderCreating.set(false);'],
  ['price submit disabled while saving', files.template, '[disabled]="priceDraftItems().length === 0 || orderCreating()"'],
  ['new order nav disabled while saving', files.template, '[disabled]="orderCreating()"'],
  ['quick order disabled while saving', files.template, '[disabled]="orderCreating()"'],
];

const forbidden = [
  ['hardcoded current month', files.component, "readonly CURRENT_MONTH = '2026-06';"],
  ['hardcoded initial distributor month', files.component, "distributorOrderMonth = signal<string>('2026-06');"],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Order create flow markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Order create flow markers present (${checks.length}/${checks.length})`);
