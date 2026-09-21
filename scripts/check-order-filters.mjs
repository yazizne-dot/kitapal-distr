import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/app/app.component.ts', import.meta.url), 'utf8');
const start = source.indexOf('  managerOrderMonth =');
const end = source.indexOf('\n  });', source.indexOf('  adminManagerOrders =', start)) + 6;
const code = ts.transpileModule(`class Filters { ${source.slice(start, end)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const signal = initial => { let value = initial; const read = () => value; read.set = next => value = next; return read; };
const Filters = new Function('signal', 'computed', `${code}; return Filters;`)(signal, fn => fn);
const f = new Filters();
f.selectedOrderId = signal('old');
f.sortedVisibleOrders = () => [
 { distributorId: 1, createdAt: '2026-09-21' },
 { distributorId: 2, createdAt: '2026-09-18' },
 { distributorId: 2, createdAt: '2026-08-18' },
];
assert.equal(f.adminManagerOrders().length, 3);
f.managerOrderMonth.set('2026-09');
assert.equal(f.adminManagerOrders().length, 2);
f.setOrderDistributorFilter(2);
assert.equal(f.managerOrderMonth(), 'all');
assert.equal(f.selectedOrderId(), '');
assert.equal(f.adminManagerOrders().length, 2);
assert.deepEqual(f.managerOrderMonthCounts(), { '2026-09': 1, '2026-08': 1 });
f.managerOrderMonth.set('2026-08');
assert.equal(f.adminManagerOrders().length, 1);
f.setOrderDistributorFilter(0);
assert.equal(f.adminManagerOrders().length, 3);
f.managerOrderMonth.set('2026-07');
assert.equal(f.adminManagerOrders().length, 0);
console.log('Order filters: all distributors, months, counts and filter reset passed');
