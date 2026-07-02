// Kitapal — Supabase Auth тіркелгілерін автоматты жасау
//
// Қолдану:
//   1. .env файл жасаңыз (бұл жоба түбірінде) мына екі мәнмен:
//        SUPABASE_URL=https://xxxx.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...        (Project Settings → API → service_role)
//      service_role кілт құпия! Тек осы скрипт үшін, .env-ді git-ке қоспаңыз.
//   2. supabase_schema.sql және supabase_seed_distributors.sql-ды Supabase SQL Editor-да
//      алдын ала жүргізіп қойыңыз (распределители кестесі бос болмауы керек).
//   3. Жүргізу: node --env-file=.env scripts/seed-supabase-users.mjs
//
// Не істейді:
//   - Әр тіркелгіге Supabase Auth пайдаланушысын жасайды (email+password, расталған)
//   - public.profiles жолын дұрыс role/distributor_id-мен жаңартады
//     (auth.users триггері бастапқыда role='distributor' қойып кетеді, біз нақтыласамыз)
//   - Бұрыннан бар email-ді қайта жасамай, өткізіп кетеді (қайта-қайта жүргізуге қауіпсіз)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Қате: SUPABASE_URL және SUPABASE_SERVICE_ROLE_KEY орнатылмаған.');
  console.error('Мысал: node --env-file=.env scripts/seed-supabase-users.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// app.component.ts ішіндегі initialAccounts-пен дәл сәйкес келеді.
// Email домені нақты болуы міндетті емес — тек логин ретінде сақталады.
const EMAIL_DOMAIN = 'kitapal.local';

const accounts = [
  { login: 'admin',      password: 'admin2026',   name: 'Бас Администратор',           role: 'admin' },
  { login: 'marjan',     password: 'manager2026', name: 'Маржан',                        role: 'manager' },
  { login: 'astana',     password: 'kitapal2026', name: 'Paidaly — Астана',              role: 'distributor', distributorId: 1 },
  { login: 'rukhaniyat', password: 'kitapal2026', name: 'Руханият — Ақтау',              role: 'distributor', distributorId: 2 },
  { login: 'aktaufr',    password: 'kitapal2026', name: 'Ақтау франшиза',                role: 'distributor', distributorId: 3 },
  { login: 'kyzylorda',  password: 'kitapal2026', name: 'Aidyn Kitap — Қызылорда',       role: 'distributor', distributorId: 4 },
  { login: 'oral',       password: 'kitapal2026', name: 'Kitapal Oral — Орал',           role: 'distributor', distributorId: 5 },
  { login: 'pavlodar',   password: 'kitapal2026', name: 'Закария — Павлодар',            role: 'distributor', distributorId: 6 },
  { login: 'baigelov',   password: 'kitapal2026', name: 'Байгелов — Тараз',              role: 'distributor', distributorId: 7 },
  { login: 'jasko',      password: 'kitapal2026', name: 'ЖасКО — Тараз',                role: 'distributor', distributorId: 8 },
  { login: 'shymkent',   password: 'kitapal2026', name: 'Олжабаев — Шымкент',           role: 'distributor', distributorId: 9 },
  { login: 'sabitova',   password: 'kitapal2026', name: 'Сабитова Нұртас — Алматы',     role: 'distributor', distributorId: 10 },
  { login: 'rakhmanov',  password: 'kitapal2026', name: 'Рахманов — Барахолка',         role: 'distributor', distributorId: 11 },
  { login: 'almaty',     password: 'kitapal2026', name: 'Almaty Demo — Алматы',          role: 'distributor', distributorId: 12 },
];

async function findUserIdByEmail(email) {
  // listUsers беттеп қайтарады — 13 тіркелгі үшін бір бет жеткілікті.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const found = data.users.find(u => u.email === email);
  return found ? found.id : null;
}

async function run() {
  for (const acc of accounts) {
    const email = `${acc.login}@${EMAIL_DOMAIN}`;
    let userId = await findUserIdByEmail(email);

    if (userId) {
      console.log(`= бар екен, өткізілді: ${email}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { name: acc.name }
      });
      if (error) {
        console.error(`✗ қате (${email}): ${error.message}`);
        continue;
      }
      userId = data.user.id;
      console.log(`+ жасалды: ${email}`);
    }

    // Триггер алдымен profiles жолын role='distributor' дефолтымен жасап қояды,
    // мұнда дұрыс role/distributor_id-ге жаңартамыз.
    const { error: updErr } = await supabase
      .from('profiles')
      .update({
        name: acc.name,
        role: acc.role,
        distributor_id: acc.distributorId ?? null
      })
      .eq('id', userId);

    if (updErr) {
      console.error(`✗ profile жаңарту қатесі (${email}): ${updErr.message}`);
    }
  }

  console.log('\nДайын. Кіру логиндері (email ретінде қолданылады):');
  for (const acc of accounts) {
    console.log(`  ${acc.login}@${EMAIL_DOMAIN}  /  ${acc.password}  →  ${acc.role}`);
  }
}

run().catch(err => {
  console.error('Скрипт қатемен тоқтады:', err);
  process.exit(1);
});
