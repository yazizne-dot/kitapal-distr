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
