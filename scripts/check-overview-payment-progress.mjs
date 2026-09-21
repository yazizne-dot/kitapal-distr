import { readFileSync } from 'node:fs';

const files = {
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};

const checks = [
  ['total paid only visible distributors', files.component, 'totalPaid = computed(() => this.visibleDistributors().reduce((sum, d) => sum + (this.paymentsByDist().get(d.id) ?? 0), 0));'],
  ['payment progress helper exists', files.component, 'paymentProgress(distributor: Distributor): number'],
  ['payment progress uses payments', files.component, 'const paid = this.paymentsByDist().get(distributor.id) ?? 0;'],
  ['payment progress caps at 100 percent', files.component, 'Math.min(1, paid / distributor.target)'],
  ['overview uses paid amount', files.template, '<strong>{{ totalPaid() | kzt }}</strong>'],
  ['overview label registered payments', files.template, '<small>Тіркелген төлемдер</small>'],
  ['overview uses paid percent', files.template, '<small>{{ totalPaid() / totalTarget() | percent }}</small>'],
  ['goal list uses payment progress label', files.template, '<b>{{ paymentProgress(item) | percent }}</b>'],
  ['goal list uses payment progress bar', files.template, '<i><em [style.width.%]="paymentProgress(item) * 100"></em></i>'],
];

const forbidden = [
  ['overview must not use achieved amount', files.template, '<strong>{{ totalAchieved() | kzt }}</strong>'],
  ['overview must not use achieved percent', files.template, '<small>{{ totalAchieved() / totalTarget() | percent }}</small>'],
  ['goal list must not use order progress label', files.template, '<b>{{ progress(item) | percent }}</b>'],
  ['goal list must not use order progress bar', files.template, '<i><em [style.width.%]="progress(item) * 100"></em></i>'],
  ['total paid must not include hidden distributors', files.component, 'totalPaid = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));'],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Overview payment progress markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Overview payment progress markers present (${checks.length}/${checks.length})`);
