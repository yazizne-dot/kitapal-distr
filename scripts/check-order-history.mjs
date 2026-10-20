import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports = {};
const source = readFileSync('src/app/core/utils/order-history.ts','utf8');
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {orderMonthKey,filterOrderHistory} = exports;
const orders = [
  {id:'old',distributorId:1,createdAt:'2025-12-20T12:00:00Z'},
  {id:'oct',distributorId:1,createdAt:'2026-10-31T18:59:59Z'},
  {id:'nov',distributorId:1,createdAt:'2026-10-31T19:00:00Z'},
  {id:'other',distributorId:2,createdAt:'2026-10-20T10:00:00Z'},
];
assert.equal(orderMonthKey(orders[2].createdAt),'2026-11','Almaty midnight belongs to the next month');
assert.deepEqual(filterOrderHistory(orders,'2026-10',1).map(o=>o.id),['oct']);
assert.deepEqual(filterOrderHistory(orders,'all',1).map(o=>o.id),['nov','oct','old']);
assert.deepEqual(filterOrderHistory(orders,'2025-12',1).map(o=>o.id),['old'],'previous years remain accessible');
assert.deepEqual(filterOrderHistory(orders,'2026-09',1),[]);
assert.deepEqual(filterOrderHistory(orders,'2026-10').map(o=>o.id),['oct','other'],'staff can combine distributor and month filters');
assert.equal(orders[0].id,'old','filtering must not reorder the source');
const component = readFileSync('src/app/app.component.ts','utf8');
const methods = component.slice(component.indexOf('  setOrderDistributorFilter('),component.indexOf('  // months that appear in manager'));
const controllerCode = ts.transpileModule(`class Controller {${methods}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const Controller = new Function(controllerCode+';return Controller;')();
const signal = value => {const f=()=>value;f.set=next=>value=next;return f;};
const c = new Controller(); c.CURRENT_MONTH='2026-10';c.orderEditSaving=()=>false;
c.role=()=> 'distributor';c.distributorOrderMonth=signal('2026-10');c.managerOrderMonth=signal('all');
c.selectedOrderId=signal('old');c.orderFilterDistributorId=signal(0);c.cancelOrderEdit=()=>{};
c.setOrderHistoryMonth('2025-12');assert.equal(c.distributorOrderMonth(),'2025-12');assert.equal(c.selectedOrderId(),'');
c.setOrderHistoryMonth('2027-01');assert.equal(c.distributorOrderMonth(),'2025-12','future months must not be selected');
c.role=()=> 'manager';c.setOrderHistoryMonth('2026-09');c.setOrderDistributorFilter(2);
assert.equal(c.managerOrderMonth(),'2026-09','changing distributor must retain the selected month');
c.setOrderHistoryMonth('all');assert.equal(c.managerOrderMonth(),'all');
console.log('Order history: own distributor, all months, previous years, empty month and Almaty boundary passed');
