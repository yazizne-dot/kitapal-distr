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
