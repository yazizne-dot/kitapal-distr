import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/app.component.css', import.meta.url), 'utf8');

const checks = [
  ['orders split uses shrinkable columns', css, 'grid-template-columns: minmax(0, 1fr);'],
  ['orders split clips own overflow', css, '.orders-split {\n  align-items: start;\n  display: grid;\n  gap: 18px;\n  grid-template-columns: minmax(0, 1fr);\n  max-width: 100%;\n  min-width: 0;'],
  ['orders list panel can shrink', css, '.orders-list-panel {\n  min-width: 0;\n  overflow-x: auto;'],
  ['order detail panel can shrink', css, '.order-detail-panel {\n  background: #fff;\n  border: 1px solid #e1e7e3;\n  border-radius: 8px;\n  display: grid;\n  gap: 22px;\n  grid-template-columns: minmax(0, 1fr);\n  min-width: 0;'],
  ['detail table scrolls inside panel', css, '.order-items-scroll {\n  min-width: 0;\n  overflow-x: auto;'],
  ['detail table has stable minimum width', css, '.detail-table-wrap table {\n  min-width: 760px;'],
  ['order list table has stable minimum width', css, '.orders-list-panel table {\n  min-width: 620px;'],
  ['financial cards collapse on narrow screens', css, '@media (max-width: 760px) {\n  .fin-cards {\n    grid-template-columns: 1fr;'],
];

const forbidden = [
  ['old fixed order split', css, 'grid-template-columns: 400px minmax(0, 1fr);'],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));
const presentForbidden = forbidden.filter(([, content, marker]) => content.includes(marker));

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error('Orders layout markers failed:');
  for (const [label, , marker] of missing) {
    console.error(`- missing ${label}: ${marker}`);
  }
  for (const [label, , marker] of presentForbidden) {
    console.error(`- forbidden ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Orders layout markers present (${checks.length}/${checks.length})`);
