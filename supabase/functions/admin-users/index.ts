// Edge Function: admin-only user management.
// Holds service_role server-side (never in the browser). Verifies the caller is an admin,
// then creates / updates / deletes Supabase Auth users + their profiles.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Verify the caller is a signed-in admin.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: caller, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !caller.user) return json({ error: 'unauthorized' }, 401);
  const { data: callerProfile } = await admin
    .from('profiles').select('role').eq('id', caller.user.id).single();
  if (callerProfile?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'list') {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const { data: profiles } = await admin.from('profiles').select('*');
    const pById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const users = (list?.users ?? []).map((u) => {
      const p: any = pById.get(u.id);
      return {
        id: u.id,
        login: (u.email ?? '').split('@')[0],
        full_name: p?.full_name ?? '',
        role: p?.role ?? 'distributor',
        distributor_id: p?.distributor_id ?? null,
      };
    });
    return json({ users });
  }

  if (action === 'create') {
    const login = String(body.login ?? '').trim().toLowerCase();
    if (!login) return json({ error: 'login required' }, 400);
    const email = `${login}@kitapal.kz`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: body.password || 'kitapal2026', email_confirm: true,
    });
    if (error) return json({ error: error.message }, 400);
    const { error: pErr } = await admin.from('profiles').insert({
      id: created.user.id,
      full_name: body.name ?? '',
      role: body.role ?? 'distributor',
      distributor_id: body.role === 'distributor' ? body.distributor_id ?? null : null,
    });
    if (pErr) return json({ error: pErr.message }, 400);
    return json({ ok: true, id: created.user.id });
  }

  if (action === 'update') {
    if (!body.id) return json({ error: 'id required' }, 400);
    if (body.password) {
      const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
      if (error) return json({ error: error.message }, 400);
    }
    const { error: pErr } = await admin.from('profiles').update({
      full_name: body.name,
      role: body.role,
      distributor_id: body.role === 'distributor' ? body.distributor_id ?? null : null,
    }).eq('id', body.id);
    if (pErr) return json({ error: pErr.message }, 400);
    return json({ ok: true });
  }

  if (action === 'delete') {
    if (!body.id) return json({ error: 'id required' }, 400);
    if (body.id === caller.user.id) return json({ error: 'cannot delete yourself' }, 400);
    const { error } = await admin.auth.admin.deleteUser(body.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'unknown action' }, 400);
});
