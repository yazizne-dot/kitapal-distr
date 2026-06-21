// Smoke test: exercises the SAME client path the Angular app uses (anon key + signInWithPassword
// + RLS-gated queries) to verify auth + RLS + data end-to-end without a browser.
// Usage: node scripts/smoke-auth.mjs
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
globalThis.WebSocket ??= ws;

const url = 'https://tgiwtfavkuphllpgtuck.supabase.co';
const anon =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnaXd0ZmF2a3VwaGxscGd0dWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5Mjk1NjYsImV4cCI6MjA5NzUwNTU2Nn0.3WSAhP_MFC6swnoK0d_ivUKEegcLpKVKffpKmAA0V7s';

async function as(login, password) {
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: `${login}@kitapal.kz`, password });
  if (error) throw new Error(`login ${login}: ${error.message}`);
  return sb;
}

// distributor astana → must see ONLY Paidaly
const dist = await as('astana', 'kitapal2026');
const d1 = await dist.from('distributors').select('company');
const s1 = await dist.from('distributor_stats').select('company, debt, achieved');
const p1 = await dist.from('products').select('id', { count: 'exact', head: true });
console.log('distributor astana:');
console.log('  distributors visible:', d1.data?.map(x => x.company));
console.log('  stats:', s1.data);
console.log('  products readable count:', p1.count);
await dist.auth.signOut();

// admin → must see all 11
const admin = await as('admin', 'admin2026');
const da = await admin.from('distributors').select('id', { count: 'exact', head: true });
console.log('admin distributors count:', da.count);
await admin.auth.signOut();

const ok = d1.data?.length === 1 && d1.data[0].company === 'Paidaly' && da.count === 11;
console.log(ok ? '\nSMOKE PASS ✅' : '\nSMOKE FAIL ❌');
process.exit(ok ? 0 : 1);
