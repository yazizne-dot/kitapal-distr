import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const analytics={};new Function('exports','require',compile('src/app/analytics/analytics-data.ts'))(analytics,require);
const {buildAnalytics,almatyDate}=analytics;
const many=Array.from({length:1501},(_,id)=>({id}));
assert.deepEqual(await analytics.readAllPages(async(from,to)=>({data:many.slice(from,to+1),error:null})),many);
await assert.rejects(analytics.readAllPages(async(from)=>from?{data:null,error:new Error('Interrupted')}:{data:many.slice(0,500),error:null}),/Interrupted/);
assert.equal(almatyDate('2026-08-31T19:00:00Z'),'2026-09-01');
const orders=[
 {id:'a',order_code:'A',distributor_id:1,status:'confirmed',created_at:'2026-08-31T19:00:00Z'},
 {id:'b',order_code:'B',distributor_id:1,status:'pending',created_at:'2026-09-10T19:00:00Z'},
 {id:'c',order_code:'C',distributor_id:1,status:'cancelled',created_at:'2026-09-03T10:00:00Z'},
 {id:'d',order_code:'D',distributor_id:1,status:'draft',created_at:'2026-09-04T10:00:00Z'},
 {id:'e',order_code:'E',distributor_id:2,status:'delivered',created_at:'2026-09-05T10:00:00Z'},
 {id:'f',order_code:'F',distributor_id:1,status:'confirmed',created_at:'2026-09-06T10:00:00Z'},
 {id:'g',order_code:'G',distributor_id:1,status:'confirmed',created_at:'2026-09-30T19:00:00Z'},
];
const item=(id,order_id,qty,unit_price,publisher='Самға',barcode='0012345678901')=>({id,order_id,product_id:id,qty,unit_price,products:{name:'Қазақша кітап: Ә Ғ Қ Ң Ө Ұ Ү Һ І',barcode,publisher}});
const data={distributors:[{id:1,company:'Астана',city:'Астана'},{id:2,company:'Орал',city:'Орал'}],orders,items:[item(1,'a',2,100),item(2,'a',1,50,'Мазмұндама'),item(3,'b',3,100),item(4,'c',100,100),item(5,'d',100,100),item(6,'e',1,400),item(7,'f',1,900000,'system','OPENING-BALANCE'),item(8,'g',1,999)],payments:[{id:1,distributor_id:1,amount:200,paid_at:'2026-09-01',note:'Төлем'},{id:2,distributor_id:2,amount:100,paid_at:'2026-09-10',note:''},{id:3,distributor_id:1,amount:5000,paid_at:'2026-08-31',note:''}]};
const filter={from:'2026-09-01',to:'2026-09-30',distributorId:0,status:'active'};
const r=buildAnalytics(data,filter);
assert.equal(r.amount,950);assert.equal(r.paid,300);assert.equal(r.qty,7);assert.equal(r.orders,3);
assert.equal(r.distributors.find(d=>d.id===1).averageDays,10);
assert.equal(r.distributors.find(d=>d.id===2).averageDays,null);
assert.equal(r.publishers.reduce((s,p)=>s+p.amount,0),r.amount);
assert.equal(r.months.reduce((s,p)=>s+p.paid,0),r.paid);
assert.equal(buildAnalytics(data,{...filter,distributorId:1}).amount,550);
assert.equal(buildAnalytics(data,{...filter,status:'delivered'}).amount,400);
assert.equal(buildAnalytics(data,{...filter,status:'delivered'}).paid,300);
assert.equal(buildAnalytics({...data,distributors:[data.distributors[0]]},filter).amount,550);
assert.equal(buildAnalytics({...data,orders:[],payments:[]},filter).orders,0);
const exporter={};new Function('exports','require',compile('src/app/analytics/analytics-export.ts'))(exporter,name=>name==='./analytics-data'?analytics:require(name));
const X=require('xlsx');const workbook=await exporter.createExcel(r);
const roundtrip=X.read(X.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
assert.equal(roundtrip.SheetNames.length,6);
assert.equal(roundtrip.Sheets['Кітаптар']['G2'].v,'0012345678901');
assert.equal(roundtrip.Sheets['Қорытынды']['B6'].v,950);
const long={...r,lines:Array.from({length:130},(_,i)=>({...r.lines[i%r.lines.length],code:`TEST-${i}`,book:r.lines[0].book+' — Ұзын атау '.repeat(8)}))};
const pdf=await exporter.createPdf(long,fs.readFileSync('src/assets/fonts/NotoSans-Regular.ttf').toString('base64'));
assert.ok(pdf.getNumberOfPages()>2);
fs.mkdirSync('outputs/analytics-check',{recursive:true});
fs.writeFileSync('outputs/analytics-check/analytics-test.pdf',Buffer.from(pdf.output('arraybuffer')));
X.writeFile(workbook,'outputs/analytics-check/analytics-test.xlsx');
console.log('PASS: net prices, statuses, opening-balance exclusion, timezone, frequency, role-scoped data, filters, Excel roundtrip, multi-page PDF ('+pdf.getNumberOfPages()+' pages)');
