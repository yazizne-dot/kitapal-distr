import { readFileSync } from 'node:fs';

const files = {
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};

const checks = [
  ['payment saving signal', files.component, 'paymentSaving = signal(false)'],
  ['payment date uses today helper', files.component, "paymentDateStr = this.todayDateKey();"],
  ['open payment resets saving', files.component, 'this.paymentSaving.set(false);'],
  ['open payment uses today helper', files.component, 'this.paymentDateStr = this.todayDateKey();'],
  ['save payment double submit guard', files.component, 'if (this.paymentSaving()) return;'],
  ['save payment sets saving true', files.component, 'this.paymentSaving.set(true);'],
  ['save payment resets saving false', files.component, 'this.paymentSaving.set(false);'],
  ['save payment handles errors', files.component, "if (err) { console.error('savePayment:', err); alert('Төлем сақталмады: ' + err); return; }"],
  ['today helper exists', files.component, 'private todayDateKey(): string'],
  ['payment save button disabled', files.template, '[disabled]="paymentSaving()"'],
  ['payment save button saving label', files.template, "paymentSaving() ? 'Сақталуда...' : 'Сақтау'"],
];

const forbidden = [
  ['old hardcoded payment field date', files.component, "paymentDateStr = '2026-06-10';"],
  ['old hardcoded open payment date', files.component, "this.paymentDateStr = '2026-06-10';"],
  ['old save without error handling', files.component, "await this.paymentService.add(distId, amount, this.paymentDateStr || '2026-06-10', this.paymentNoteStr);"],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Payment create flow markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Payment create flow markers present (${checks.length}/${checks.length})`);
