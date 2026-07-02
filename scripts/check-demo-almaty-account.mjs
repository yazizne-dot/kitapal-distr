import { readFileSync } from 'node:fs';

const files = {
  seed: readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8'),
  legacySeed: readFileSync(new URL('../supabase_seed_distributors.sql', import.meta.url), 'utf8'),
  seedUsers: readFileSync(new URL('../scripts/seed-supabase-users.mjs', import.meta.url), 'utf8'),
  createUsers: readFileSync(new URL('../scripts/create-auth-users.mjs', import.meta.url), 'utf8'),
};

const checks = [
  ['business seed has demo distributor', files.seed, "('Almaty Demo',       'Алматы',    0.40, 4000000,  '')"],
  ['business seed gives demo target', files.seed, "('Almaty Demo',12000000)"],
  ['business seed gives 2.3M demo debt', files.seed, "('Almaty Demo',2300000)"],
  ['legacy seed has id 12 demo distributor', files.legacySeed, "(12, 'Almaty Demo',      'Алматы',    'Маржан', 12000000, 0,       0.40, 4000000,  2300000, '')"],
  ['legacy seed advances identity to 12', files.legacySeed, "setval(pg_get_serial_sequence('public.distributors', 'id'), 12, true)"],
  ['service-role seed maps almaty to distributor 12', files.seedUsers, "{ login: 'almaty',     password: 'kitapal2026', name: 'Almaty Demo — Алматы',          role: 'distributor', distributorId: 12 }"],
  ['service-role seed keeps old Sabitova as sabitova', files.seedUsers, "{ login: 'sabitova',   password: 'kitapal2026', name: 'Сабитова Нұртас — Алматы',     role: 'distributor', distributorId: 10 }"],
  ['auth script maps almaty to Almaty Demo company', files.createUsers, "['almaty',     'kitapal2026', 'Almaty Demo — Алматы',       'distributor', 'Almaty Demo']"],
  ['auth script keeps old Sabitova as sabitova', files.createUsers, "['sabitova',   'kitapal2026', 'Сабитова Нұртас — Алматы',   'distributor', 'Сабитова Нұртас']"],
];

const missing = checks.filter(([, content, marker]) => !content.includes(marker));

if (missing.length > 0) {
  console.error('Demo almaty account markers missing:');
  for (const [label, , marker] of missing) {
    console.error(`- ${label}: ${marker}`);
  }
  process.exit(1);
}

console.log(`Demo almaty account markers present (${checks.length}/${checks.length})`);
