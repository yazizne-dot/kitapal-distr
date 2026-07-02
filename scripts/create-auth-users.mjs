// One-off: create Supabase Auth users + profiles for all Kitapal accounts.
// The service_role key bypasses RLS — keep it OUT of git and the chat.
//
// Usage (PowerShell):
//   $env:SUPABASE_URL="https://tgiwtfavkuphllpgtuck.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key from: npx supabase projects api-keys --project-ref tgiwtfavkuphllpgtuck>"
//   node scripts/create-auth-users.mjs
//
// Re-runnable: skips users that already exist, upserts profiles.
import { createClient } from '@supabase/supabase-js';
// supabase-js initializes a realtime client that needs WebSocket; Node < 22 has none.
// We don't use realtime here, but createClient still constructs it — polyfill to satisfy it.
import ws from 'ws';
globalThis.WebSocket ??= ws;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// login, password, full_name, role, distributor company (null for admin/manager)
const accounts = [
  ['admin',      'admin2026',   'Бас Администратор',          'admin',       null],
  ['marjan',     'manager2026', 'Маржан',                     'manager',     null],
  ['astana',     'kitapal2026', 'Paidaly — Астана',           'distributor', 'Paidaly'],
  ['rukhaniyat', 'kitapal2026', 'Руханият — Ақтау',           'distributor', 'Руханият'],
  ['aktaufr',    'kitapal2026', 'Ақтау франшиза',             'distributor', 'Ақтау франшиза'],
  ['kyzylorda',  'kitapal2026', 'Aidyn Kitap — Қызылорда',    'distributor', 'Aidyn Kitap'],
  ['oral',       'kitapal2026', 'Kitapal Oral — Орал',        'distributor', 'Kitapal Oral'],
  ['pavlodar',   'kitapal2026', 'Закария — Павлодар',         'distributor', 'Закария'],
  ['baigelov',   'kitapal2026', 'Байгелов — Тараз',           'distributor', 'Байгелов'],
  ['jasko',      'kitapal2026', 'ЖасКО — Тараз',              'distributor', 'ЖасКО'],
  ['shymkent',   'kitapal2026', 'Олжабаев — Шымкент',         'distributor', 'Олжабаев'],
  ['sabitova',   'kitapal2026', 'Сабитова Нұртас — Алматы',   'distributor', 'Сабитова Нұртас'],
  ['rakhmanov',  'kitapal2026', 'Рахманов — Барахолка',       'distributor', 'Рахманов'],
  ['almaty',     'kitapal2026', 'Almaty Demo — Алматы',       'distributor', 'Almaty Demo'],
];

const { data: dists, error: dErr } = await admin.from('distributors').select('id, company');
if (dErr) throw dErr;
const idByCompany = new Map(dists.map((d) => [d.company, d.id]));

// existing users (to make the script re-runnable)
const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const idByEmail = new Map((existing?.users ?? []).map((u) => [u.email, u.id]));

for (const [login, password, fullName, role, company] of accounts) {
  const email = `${login}@kitapal.kz`;
  let userId = idByEmail.get(email);

  if (!userId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (cErr) { console.error(`createUser ${email}:`, cErr.message); continue; }
    userId = created.user.id;
  } else {
    console.log(`(exists) ${email}`);
  }

  if (company && !idByCompany.has(company)) {
    console.error(`distributor not found for ${email}: ${company}`);
    continue;
  }
  const distributor_id = company ? idByCompany.get(company) : null;

  const { error: pErr } = await admin.from('profiles').upsert({
    id: userId, full_name: fullName, role, distributor_id,
  });
  if (pErr) console.error(`profile ${email}:`, pErr.message);
  else console.log(`OK ${email} (${role}${company ? ' → ' + company : ''})`);
}

// Assign every distributor to the manager (the original setup had a single manager, Маржан).
const { data: mgr } = await admin.from('profiles').select('id').eq('role', 'manager').limit(1).maybeSingle();
if (mgr) {
  const { error } = await admin.from('distributors').update({ manager_id: mgr.id }).is('manager_id', null);
  console.log('assign manager to distributors:', error ? error.message : 'OK');
}

console.log('Done.');
