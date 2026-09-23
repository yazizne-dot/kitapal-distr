import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('src/app/app.component.ts','utf8');
const methods=source.slice(source.indexOf('  effectiveDiscount('),source.indexOf('  priceQty('));
const code=ts.transpileModule(`class Pricing {${methods}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const Pricing=new Function(code+';return Pricing;')();
const p=new Pricing();
for(const discount of [.42,.45]){
 p.selectedDistributor=()=>({discount});
 assert.equal(p.effectiveDiscount({discountOverride:.3}),.3);
 assert.equal(p.myPrice({basePrice:2900,discountOverride:.3}),2030);
 assert.equal(p.effectiveDiscount({discountOverride:null}),discount);
 assert.equal(p.myPrice({basePrice:3000}),Math.round(3000*(1-discount)));
 assert.equal(p.myPrice({basePrice:3000,discountOverride:0}),3000);
}
console.log('PASS: fixed discount overrides distributor rate, blank inherits it, explicit 0% stays zero; discounts are never combined');
