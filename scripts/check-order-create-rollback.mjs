import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports={};let removed=[],cleanupError=null,itemError={code:'22023',message:'Book is no longer available in the price list'};
const supabase={from:table=>table==='orders'?{
  insert:()=>({select:()=>({single:async()=>({data:{id:'new-order'},error:null})})}),
  delete:()=>({eq:async(key,id)=>{removed.push(id);return {error:cleanupError};}}),
}:table==='order_items'?{insert:async()=>({error:itemError})}:null};
const signal=value=>{const f=()=>value;f.set=v=>value=v;return f;};
const code=ts.transpileModule(readFileSync('src/app/core/services/order.service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
new Function('require','exports',code)(name=>name==='@angular/core'?{Injectable:()=>c=>c,signal}:name.includes('supabase.client')?{supabase}:{lineAmount:(q,p)=>q*p},exports);
const service=new exports.OrderService();let histories=0;
service.addHistory=async()=>{histories++;};service.load=async()=>{};
const items=[{productId:7,qty:1,unitPrice:3000,discount:0}];
assert.ok(await service.create(1,items,'pending'));assert.deepEqual(removed,['new-order']);assert.equal(histories,0);
cleanupError={message:'Network failure'};assert.match(await service.create(1,items,'pending'),/new-order/,'failed cleanup must identify the incomplete order');
itemError=null;cleanupError=null;removed=[];
assert.equal(await service.create(1,items,'pending'),null);assert.equal(histories,1);assert.deepEqual(removed,[]);
console.log('Order creation: stale archived cart removes the new header, cleanup errors surface, success preserves the order');
