import fs from 'node:fs';
import XLSX from 'xlsx';
const [file,snapshot,out]=process.argv.slice(2);
const products=JSON.parse(fs.readFileSync(snapshot,'utf8'));
const w=XLSX.readFile(file);
const rows=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1,defval:null});
if(rows[0][0]!=='Пачка'||rows[0][1]!=='Штрихкод')throw Error('Unexpected columns');
const plan=new Map(),issues=[];
for(const [index,row] of rows.entries()){
 if(!index||(!row[1]&&!row[2]))continue;
 const barcode=String(row[1]??'').trim(),name=String(row[2]??'').trim();
 const size=row[0]==null||row[0]===''?null:Number(row[0]);
 if(size!==null&&(!Number.isInteger(size)||size<=0))throw Error('Invalid size at row '+(index+1));
 const matches=products.filter(p=>barcode?String(p.barcode)===barcode:p.name.trim()===name);
 if(matches.length!==1){issues.push({row:index+1,barcode,name,size});continue;}
 const p=matches[0];
 if(p.name.trim().replace(/\s+/g,' ')!==name.replace(/\s+/g,' ')){issues.push({row:index+1,barcode,name,size,reason:'Атауы базамен сәйкес емес',currentName:p.name});continue;}
 if(plan.has(p.id)&&plan.get(p.id).size!==size)throw Error('Conflicting pack sizes for '+barcode);
 plan.set(p.id,{id:p.id,barcode:p.barcode,name:p.name,size});
}
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/products-before.json',JSON.stringify(products,null,2));
fs.writeFileSync(out+'/plan.json',JSON.stringify([...plan.values()],null,2));
fs.writeFileSync(out+'/issues.json',JSON.stringify(issues,null,2));
const q=v=>v===null?'null':typeof v==='number'?String(v):"'"+v.replaceAll("'","''")+"'";
const sql=`begin;
create temporary table pack_import(id bigint,barcode text,name text,size integer) on commit drop;
insert into pack_import values ${[...plan.values()].map(r=>'('+[r.id,r.barcode,r.name,r.size].map(q).join(',')+')').join(',')};
create temporary table before_products on commit drop as select id,to_jsonb(p)-'pack_size' as data from public.products p;
do $$ begin
if (select count(*) from pack_import i join public.products p on p.id=i.id and p.barcode=i.barcode and p.name=i.name)<>${plan.size} then raise exception 'Product matching changed'; end if;
end $$;
update public.products p set pack_size=i.size from pack_import i where p.id=i.id;
do $$ begin
if exists(select 1 from before_products b full join public.products p on p.id=b.id where b.data is distinct from (to_jsonb(p)-'pack_size')) then raise exception 'Unrelated product data changed'; end if;
end $$;
select count(*) as matched,count(size) as with_pack_size,count(*) filter(where size is null) as blank from pack_import;
commit;`;
fs.writeFileSync(out+'/import.sql',sql);
console.log(JSON.stringify({matched:plan.size,withSize:[...plan.values()].filter(r=>r.size!==null).length,blank:[...plan.values()].filter(r=>r.size===null).length,issues}));
