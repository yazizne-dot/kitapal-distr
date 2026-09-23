import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import XLSX from 'xlsx';

// Produces a reviewable plan only; execution is a separate step.
const [source, snapshot, destination] = process.argv.slice(2);
if (!source || !snapshot || !destination) throw new Error('Usage: node scripts/prepare-fixed-price-import.mjs workbook snapshot.json output-directory');
const products = JSON.parse(readFileSync(snapshot, 'utf8'));
const workbook = XLSX.readFile(source);
const records = [], held = [], plan = [], additions = [];
const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
for (const sheetName of workbook.SheetNames) {
  if (['қарыздар', 'Қалдықтар'].includes(sheetName)) continue;
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const hi = rows.findIndex(r => r.includes('Штрихкод') && r.includes('Кітап атауы'));
  if (hi < 0) continue;
  const header = rows[hi];
  const bi = header.indexOf('Штрихкод'), ni = header.indexOf('Кітап атауы');
  const pi = ['Дистр бағасы', 'Дистр баға', 'Баға'].map(h => header.indexOf(h)).find(i => i >= 0);
  const di = ['Дистр скидка', 'Скидка', 'Жеңілдік'].map(h => header.indexOf(h)).find(i => i >= 0);
  if (pi == null) throw new Error(`No agreed price column in ${sheetName}`);
  rows.slice(hi + 1).forEach((row, offset) => {
    const name = String(row[ni] ?? '').trim(), barcode = String(row[bi] ?? '').trim();
    if (!name && !barcode) return;
    const rawDiscount = di == null ? null : row[di];
    const discount = rawDiscount === null || rawDiscount === '' ? null : Number(rawDiscount);
    const price = Number(row[pi]);
    const record = { sheet: sheetName, row: hi + offset + 2, name, barcode, price, discount };
    if (!name || !Number.isFinite(price) || price <= 0 || (discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 1))) {
      held.push({ ...record, reason: 'Жарамсыз баға немесе жеңілдік' }); return;
    }
    records.push(record);
  });
}
const candidates = new Map();
for (const r of records) {
  let matches = r.barcode ? products.filter(p => String(p.barcode) === r.barcode) : products.filter(p => norm(p.name) === norm(r.name));
  if (!matches.length) matches = products.filter(p => norm(p.name) === norm(r.name));
  if (matches.length > 1 && r.sheet === 'Әділет кітаптары') matches = matches.filter(p => p.publisher === 'Әділет');
  if (!matches.length && !r.barcode && r.sheet === 'Әділет кітаптары') {
    additions.push({ ...r, barcode: `NO-BARCODE-PRICE-20260923-${r.row}`, publisher: 'Әділет', category: 'Кітаптар' }); continue;
  }
  if (matches.length !== 1) {
    held.push({ ...r, reason: matches.length === 0 ? 'Базадан табылмады' : matches.length > 1 ? 'Бірнеше өнім сәйкес келеді' : 'Штрихкод сәйкес, атауы басқа', currentName: matches[0]?.name }); continue;
  }
  const p = matches[0];
  if (p.barcode === 'OPENING-BALANCE') { held.push({ ...r, reason: 'Жүйелік жазба' }); continue; }
  const group = candidates.get(p.id) ?? [];
  group.push({ ...r, id: p.id, oldName: p.name, oldBarcode: p.barcode, oldPrice: Number(p.base_price), oldDiscount: p.discount_override == null ? null : Number(p.discount_override) });
  candidates.set(p.id, group);
}
// A repeated barcode with a different title/price/discount is never silently selected.
const conflictingBarcodes = new Set();
for (const r of records.filter(r => r.barcode)) {
  if (records.some(other => other.barcode === r.barcode && (other.price !== r.price || other.discount !== r.discount))) conflictingBarcodes.add(r.barcode);
}
for (const group of candidates.values()) {
  if (group.some(r => conflictingBarcodes.has(r.barcode)) || new Set(group.map(r => JSON.stringify([r.price, r.discount]))).size !== 1) held.push(...group.map(r => ({ ...r, reason: 'Файлдағы қайталанған жолдарда қайшылық бар' })));
  else plan.push(group[0]);
}
plan.sort((a, b) => a.id - b.id);
mkdirSync(destination, { recursive: true });
writeFileSync(destination + '/products-before-import.json', JSON.stringify(products, null, 2));
writeFileSync(destination + '/plan.json', JSON.stringify(plan, null, 2));
writeFileSync(destination + '/held.json', JSON.stringify(held, null, 2));
writeFileSync(destination + '/additions.json', JSON.stringify(additions, null, 2));
const q = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + v.replaceAll("'", "''") + "'";
const values = plan.map(r => '(' + [r.id, r.oldBarcode, r.oldName, r.oldPrice, r.oldDiscount, r.price, r.discount].map(q).join(',') + ')').join(',\n');
const sql = `begin;
create temporary table price_import(id bigint primary key, barcode text, old_name text, old_price numeric, old_discount numeric, new_price numeric, new_discount numeric) on commit drop;
insert into price_import values ${values};
do $$ begin
if (select count(*) from price_import s join public.products p on p.id=s.id and p.barcode=s.barcode and p.name=s.old_name and p.base_price=s.old_price and p.discount_override is not distinct from s.old_discount) <> ${plan.length} then raise exception 'Product data changed since review; import aborted'; end if;
if exists(select 1 from price_import where new_price<=0 or new_discount<0 or new_discount>1) then raise exception 'Invalid pricing'; end if;
end $$;
${additions.length ? 'insert into public.products(name,barcode,publisher,category,base_price,discount_override) values ' + additions.map(r => '(' + [r.name,r.barcode,r.publisher,r.category,r.price,r.discount].map(q).join(',') + ')').join(',') + ';' : ''}
create temporary table import_financial_check on commit drop as select (select sum(debt) from public.distributor_stats) as debt, (select sum(amount) from public.order_items) as order_amount, (select sum(amount) from public.payments) as payments;
update public.products p set base_price=s.new_price, discount_override=s.new_discount from price_import s where p.id=s.id and (p.base_price is distinct from s.new_price or p.discount_override is distinct from s.new_discount);
do $$ begin
if exists(select 1 from price_import s join public.products p on p.id=s.id where p.base_price is distinct from s.new_price or p.discount_override is distinct from s.new_discount) then raise exception 'Price validation failed'; end if;
if exists(select 1 from import_financial_check b where b.debt is distinct from (select sum(debt) from public.distributor_stats) or b.order_amount is distinct from (select sum(amount) from public.order_items) or b.payments is distinct from (select sum(amount) from public.payments)) then raise exception 'Financial data changed; import aborted'; end if;
end $$;
select count(*) as matched_products, count(*) filter(where old_price is distinct from new_price) as prices_changed, count(*) filter(where old_discount is distinct from new_discount) as discounts_changed from price_import;
commit;`;
writeFileSync(destination + '/apply.sql', sql);
const report = XLSX.utils.book_new();
for (const [name, data] of [['Импорт', plan], ['Жаңа кітаптар', additions], ['Тексеру қажет', held]]) {
  const sheet = XLSX.utils.json_to_sheet(data);
  sheet['!cols'] = Array.from({ length: 16 }, (_, i) => ({ wch: i === 2 ? 60 : 24 }));
  XLSX.utils.book_append_sheet(report, sheet, name);
}
XLSX.writeFile(report, destination + '/price-review.xlsx');
console.log(JSON.stringify({ records: records.length, matched: plan.length, added: additions.length, fixed: plan.filter(r => r.discount !== null).length, distributorDiscount: plan.filter(r => r.discount === null).length, held: held.length, pricesChanged: plan.filter(r => r.oldPrice !== r.price).length, discountsChanged: plan.filter(r => r.oldDiscount !== r.discount).length, examples: plan.filter(r => r.name.includes('Абылай хан') || r.name.includes('100 вопросов')) }, null, 2));
