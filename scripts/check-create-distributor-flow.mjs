import { readFileSync } from 'node:fs';

const files = {
  service: readFileSync(new URL('../src/app/core/services/distributor.service.ts', import.meta.url), 'utf8'),
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};

const checks = [
  ['service input type', files.service, 'export interface CreateDistributorInput'],
  ['service create method', files.service, 'async createWithOpeningBalance(input: CreateDistributorInput): Promise<number | string>'],
  ['service inserts distributor', files.service, ".from('distributors').insert"],
  ['service writes target', files.service, ".from('targets').upsert"],
  ['service resolves current half year', files.service, 'private currentHalfYear(): string'],
  ['service uses current half year for target', files.service, 'period: this.currentHalfYear()'],
  ['service creates opening debt order', files.service, "status: 'confirmed'"],
  ['service checks existing distributor', files.service, '.eq(\'company\', input.company)'],
  ['service returns duplicate message', files.service, 'Дистрибьютор осындай компания және қала бойынша бұрыннан бар'],
  ['component modal signal', files.component, 'distributorModal = signal(false)'],
  ['component saving guard signal', files.component, 'distributorSaving = signal(false)'],
  ['component open modal', files.component, 'openDistributorModal(): void'],
  ['component save modal', files.component, 'async saveDistributor(): Promise<void>'],
  ['component prevents double submit', files.component, 'if (this.role() !== \'admin\' || this.distributorSaving()) return;'],
  ['component resets saving flag', files.component, 'this.distributorSaving.set(false);'],
  ['template admin button wired', files.template, '(click)="openDistributorModal()"'],
  ['template modal title', files.template, 'Жаңа дистрибьютор'],
  ['template detail target label renamed', files.template, '6 айлық мақсат'],
  ['template disables save button', files.template, '[disabled]="distributorSaving()"'],
  ['template save button wired', files.template, '(click)="saveDistributor()"'],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const forbidden = [
  ['template old annual target label', files.template, 'Жылдық мақсат'],
].filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || forbidden.length > 0) {
  console.error('Create distributor flow markers missing:');
  for (const [label, , marker] of missing) {
    console.error(`- ${label}: ${marker}`);
  }
  for (const [label, , marker] of forbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Create distributor flow markers present (${checks.length}/${checks.length})`);
