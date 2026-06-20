// Generates product INSERT statements from the Angular data file (src/app/price-products.ts).
// We parse the file directly (no tsc needed): the `products` array literal is valid JS once the
// TypeScript type annotation is stripped, so we extract it and evaluate it in isolation.
// Usage: node scripts/generate-seed.mjs > supabase/.gen/products-seed.sql
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/app/price-products.ts'), 'utf8');

// Grab everything from the opening `[` of the products array to its matching closing `];`.
const start = src.indexOf('[', src.indexOf('export const products'));
const end = src.indexOf('];', start);
if (start < 0 || end < 0) throw new Error('Could not locate products array literal');
const arrayLiteral = src.slice(start, end + 1);

// eslint-disable-next-line no-new-func
const allProducts = Function(`"use strict"; return (${arrayLiteral});`)();

// barcode is UNIQUE in the schema; the source data has a few duplicate barcodes.
// Keep the first occurrence of each barcode and drop the rest.
const seen = new Set();
const products = allProducts.filter((p) => {
  if (seen.has(p.barcode)) return false;
  seen.add(p.barcode);
  return true;
});

const esc = (s) => String(s).replace(/'/g, "''");
const rows = products.map((p) =>
  `  ('${esc(p.name)}', '${esc(p.barcode)}', '${esc(p.publisher)}', '${esc(p.category)}', ${p.basePrice}, ${p.discountOverride ?? 'null'})`
);

console.log('-- AUTO-GENERATED from src/app/price-products.ts — do not edit by hand');
console.log('insert into public.products (name, barcode, publisher, category, base_price, discount_override) values');
console.log(rows.join(',\n') + ';');
