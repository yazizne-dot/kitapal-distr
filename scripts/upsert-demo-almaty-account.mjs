// Upsert a standalone demo distributor account:
//   login: almaty
//   password: kitapal2026
//   role: distributor
//   company: Almaty Demo
//   discount: 40%, credit limit: 4,000,000 KZT, opening debt: 2,300,000 KZT
//
// Required env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Re-runnable. Uses service_role server-side only; never expose the key in frontend code.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

globalThis.WebSocket ??= ws;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = 'kitapal2026';
const currentHalfYear = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() <= 5 ? 'H1' : 'H2'}`;
};

async function ensureAuthProfile({ login, fullName, role, distributorId }) {
  const email = `${login}@kitapal.kz`;
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let user = existing.users.find((item) => item.email === email);
  if (!user) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = created.user;
    console.log(`+ created auth user ${email}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`= updated auth user ${email}`);
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    full_name: fullName,
    role,
    distributor_id: distributorId,
  });
  if (profileError) throw profileError;
  console.log(`= upserted profile ${email} -> distributor ${distributorId ?? 'none'}`);
}

async function maybeSingleOrThrow(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

const existingDemo = await maybeSingleOrThrow(
  admin.from('distributors').select('id').eq('company', 'Almaty Demo')
);

let demoDistributorId = existingDemo?.id;
if (demoDistributorId) {
  const { error } = await admin
    .from('distributors')
    .update({ city: 'Алматы', discount: 0.40, credit_limit: 4000000, phone: '' })
    .eq('id', demoDistributorId);
  if (error) throw error;
  console.log(`= updated distributor Almaty Demo (${demoDistributorId})`);
} else {
  const { data, error } = await admin
    .from('distributors')
    .insert({ company: 'Almaty Demo', city: 'Алматы', discount: 0.40, credit_limit: 4000000, phone: '' })
    .select('id')
    .single();
  if (error) throw error;
  demoDistributorId = data.id;
  console.log(`+ created distributor Almaty Demo (${demoDistributorId})`);
}

const { error: targetError } = await admin.from('targets').upsert({
  distributor_id: demoDistributorId,
  period: currentHalfYear(),
  amount: 12000000,
}, { onConflict: 'distributor_id,period' });
if (targetError) throw targetError;

let product = await maybeSingleOrThrow(
  admin.from('products').select('id').eq('barcode', 'OPENING-BALANCE')
);
if (!product) {
  const { data, error } = await admin
    .from('products')
    .insert({ name: 'Бастапқы сальдо (opening balance)', barcode: 'OPENING-BALANCE', publisher: 'system', category: 'system', base_price: 1 })
    .select('id')
    .single();
  if (error) throw error;
  product = data;
}

let order = await maybeSingleOrThrow(
  admin
    .from('orders')
    .select('id')
    .eq('distributor_id', demoDistributorId)
    .eq('status', 'confirmed')
    .eq('created_at', '2026-06-01T00:00:00+00:00')
);
if (!order) {
  const { data, error } = await admin
    .from('orders')
    .insert({ distributor_id: demoDistributorId, status: 'confirmed', created_at: '2026-06-01T00:00:00+00:00' })
    .select('id')
    .single();
  if (error) throw error;
  order = data;
}

const existingItem = await maybeSingleOrThrow(
  admin
    .from('order_items')
    .select('id')
    .eq('order_id', order.id)
    .eq('product_id', product.id)
);
if (existingItem) {
  const { error } = await admin
    .from('order_items')
    .update({ qty: 2300000, unit_price: 1, discount: 0 })
    .eq('id', existingItem.id);
  if (error) throw error;
} else {
  const { error } = await admin
    .from('order_items')
    .insert({ order_id: order.id, product_id: product.id, qty: 2300000, unit_price: 1, discount: 0 });
  if (error) throw error;
}
console.log('= ensured opening debt order: 2,300,000 KZT');

const sabitova = await maybeSingleOrThrow(
  admin.from('distributors').select('id').eq('company', 'Сабитова Нұртас')
);
if (sabitova) {
  await ensureAuthProfile({
    login: 'sabitova',
    fullName: 'Сабитова Нұртас — Алматы',
    role: 'distributor',
    distributorId: sabitova.id,
  });
}

await ensureAuthProfile({
  login: 'almaty',
  fullName: 'Almaty Demo — Алматы',
  role: 'distributor',
  distributorId: demoDistributorId,
});

console.log('\nDone. Demo login: almaty / kitapal2026');
