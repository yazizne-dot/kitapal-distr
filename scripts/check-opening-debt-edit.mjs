import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true}}).outputText;
const signal = value => {const f = () => value; f.set = next => value = next; return f;};
const calls = [];
let error = null;
const exports = {};
new Function('require','exports',compile(readFileSync('src/app/core/services/monthly-debt.service.ts','utf8')))(
  name => name === '@angular/core' ? {Injectable: () => c => c, signal} : {supabase: {rpc: async (name,args) => {calls.push({name,args}); return {error};}}},exports);
const service = new exports.MonthlyDebtService();
for (const value of [NaN, Infinity, -Infinity]) {
  assert.ok(await service.setOpeningDebt(1,'2026-10',value,1000));
}
assert.equal(calls.length,0,'invalid values must not reach the database');
assert.equal(await service.setOpeningDebt(1,'2026-10',1200.25,1000),null);
assert.deepEqual(calls[0],{name:'set_month_opening_debt',args:{p_distributor_id:1,p_month:'2026-10-01',p_amount:1200.25,p_expected_amount:1000}});
error = {message:'Opening balance changed. Reload and retry.'};
assert.ok(await service.setOpeningDebt(1,'2026-10',1300,1000),'database rejection must be shown');

const source = readFileSync('src/app/app.component.ts','utf8');
const methods = source.slice(source.indexOf('  startEditOpeningDebt('),source.indexOf('  selectedDistributorId ='));
const Controller = new Function(compile(`class Controller {${methods}}`) + ';return Controller;')();
const c = new Controller();
c.role = () => 'distributor'; c.debtMonth = signal('2026-10'); c.debtCurrentMonth = '2026-10';
c.editingOpeningDebtId = signal(null); c.openingDebtSaving = signal(false); c.openingDebtError = '';
const row = {id:1,openingDebt:1000};
c.startEditOpeningDebt(row); assert.equal(c.editingOpeningDebtId(),null,'distributors cannot edit');
c.role = () => 'manager'; c.startEditOpeningDebt(row); assert.equal(c.editingOpeningDebtId(),1);
let saved = 0; c.monthlyDebtService = {setOpeningDebt: async () => {saved++;return null;}}; c.reloadAll = async () => {};
c.openingDebtInput = ''; await c.saveOpeningDebt(); assert.equal(saved,0,'empty input must not become zero');
c.openingDebtInput = 1200; await c.saveOpeningDebt(); assert.equal(saved,1); assert.equal(c.editingOpeningDebtId(),null);
c.role = () => 'admin'; c.startEditOpeningDebt(row); c.openingDebtInput = 0;
await c.saveOpeningDebt(); assert.equal(saved,2,'admins can save a zero balance');
c.debtMonth.set('2026-09'); c.startEditOpeningDebt(row); assert.equal(c.editingOpeningDebtId(),null,'closed months cannot be edited');
console.log('Opening debt edit: validation, manager access, distributor denial, closed months and RPC errors passed');
