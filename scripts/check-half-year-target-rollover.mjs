import { readFileSync } from 'node:fs';

const files = {
  service: readFileSync(new URL('../src/app/core/services/distributor.service.ts', import.meta.url), 'utf8'),
  component: readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8'),
  template: readFileSync(new URL('../src/app/app.component.html', import.meta.url), 'utf8'),
};

const checks = [
  ['service exports halfYearPeriod', files.service, 'export function halfYearPeriod(date: Date): string {'],
  ['service exports periodLabel', files.service, 'export function periodLabel(period: string): string {'],
  ['service exports missingTargetDistributorIds', files.service, 'export function missingTargetDistributorIds(distributorIds: number[], coveredIds: number[]): number[] {'],
  ['service exposes public currentPeriod', files.service, 'currentPeriod(): string {'],
  ['service sets a single target', files.service, 'async setTarget(distributorId: number, period: string, amount: number): Promise<string | null> {'],
  ['service backfills missing targets', files.service, 'async ensureCurrentPeriodTargets(): Promise<string | null> {'],
  ['service inserts backfilled targets', files.service, '.insert(missingIds.map((id) => ({ distributor_id: id, period, amount: 0 })));'],
  ['component target editing signal', files.component, 'editingTargetDistId = signal<number | null>(null)'],
  ['component start edit target', files.component, 'startEditTarget(d: Distributor): void {'],
  ['component save target', files.component, 'async saveTarget(distId: number): Promise<void> {'],
  ['component create new period targets', files.component, 'async createNewPeriodTargets(): Promise<void> {'],
  ['component period label helper', files.component, 'currentPeriodLabel(): string {'],
  ['template button wired', files.template, '(click)="createNewPeriodTargets()"'],
  ['template target edit input', files.template, '[(ngModel)]="editTargetStr"'],
  ['template save target wired', files.template, '(click)="saveTarget(item.id)"'],
  ['template dynamic period label', files.template, '{{ currentPeriodLabel() }}'],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const forbidden = [
  ['service old private half-year name', files.service, 'private currentHalfYear(): string'],
  ['template hardcoded period subtitle', files.template, 'Қаңтар / Шілде кезеңі'],
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
