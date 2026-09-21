import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../supabase/functions/admin-users/index.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let handler, patch, profileWrites, authError, callerRole = 'admin';
const admin = {
 auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }), admin: {
  updateUserById: async (id, value) => { patch = {id, ...value}; return { error: authError }; }
 } },
 from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: {role: callerRole} }) }) }),
  update: () => { profileWrites++; return {eq: async () => ({error: null})}; } })
};
new Function('require','exports','Deno',js)(() => ({createClient: () => admin}), {}, {
 env: {get: () => 'test'}, serve: fn => handler = fn
});
async function update(extra) {
 patch = undefined; profileWrites = 0;
 const response = await handler(new Request('https://example.test', {method: 'POST',headers: {'Content-Type':'application/json',Authorization:'Bearer test'},body:JSON.stringify({action:'update',id:'user-id',name:'Name',role:'distributor',...extra})}));
 return {status:response.status,body:await response.json()};
}
assert.equal((await update({login:' New.Login ',password:''})).body.login,'new.login');
assert.deepEqual(patch,{id:'user-id',email:'new.login@kitapal.kz',email_confirm:true});
assert.equal(profileWrites,1);
await update({login:'new',password:'new-password'});
assert.equal(patch.password,'new-password');
for(const login of ['', 'with space', 'x@external.test']) {
 assert.equal((await update({login})).status,400); assert.equal(patch,undefined);
}
authError = {code:'email_exists',message:'already registered'};
assert.equal((await update({login:'duplicate'})).body.error,'Бұл логин басқа пайдаланушыда бар.');
assert.equal(profileWrites,0);
authError = null;
callerRole = 'distributor';
assert.equal((await update({login:'blocked'})).status,403);
assert.equal(patch,undefined);
console.log('Login update: normalized Auth email, unchanged password, duplicate/invalid login and admin access passed');
