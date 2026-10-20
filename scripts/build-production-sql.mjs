import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL('supabase/migrations/'+name,root),'utf8');
const body=sql=>sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'').trim();
let base=read('20260924110000_monthly_opening_debt.sql')
  .replace('select private.capture_monthly_opening_debts();','')
  .replace('create table public.monthly_opening_debts','create table if not exists public.monthly_opening_debts')
  .replaceAll('create function ','create or replace function ')
  .replace('create policy monthly_opening_debts_read',
    'drop policy if exists monthly_opening_debts_read on public.monthly_opening_debts;\ncreate policy monthly_opening_debts_read')
  .replace(/create trigger (\w+) (before [^\n]+ on (public\.\w+))/g,
    'drop trigger if exists $1 on $3;\ncreate trigger $1 $2');
const parts=[
  '-- Run the whole file in the PRODUCTION Supabase SQL Editor as postgres.\n'+
  '-- Existing rows are preserved. The script runs in one transaction and can be rerun.\n'+
  '-- Requires the existing Kitapal tables/views and private role/access helpers.\n'+
  '-- pg_cron is required; enable it in Database > Extensions if CREATE EXTENSION is denied.\n'+
  '-- This script does not deploy Edge Functions or change Auth accounts.\n\nbegin;\n'+
  'alter table public.distributors add column if not exists debt_adjustment numeric(14,2) not null default 0;',
  '-- Ensure live debt and credit checks include submitted orders and manual adjustments.\n'+read('20260921100000_include_pending_orders_in_debt.sql'),
  '-- Idempotent setup of the existing monthly opening system.\n'+body(base),
];
for(const name of [
  '20261014090000_repair_payment_id_generation.sql',
  '20261020090000_restore_payment_defaults.sql',
  '20261020100000_monthly_debt_reports.sql',
  '20261020110000_edit_month_opening_debt.sql',
  '20261020120000_align_current_month_debt.sql',
])parts.push('-- '+name+'\n'+body(read(name)));
parts.push("notify pgrst, 'reload schema';\ncommit;\n\n"+
  "-- Verification: this job must exist and be active.\n"+
  "select jobname, schedule, active from cron.job where jobname='monthly-debt-opening';\n"+
  "select to_regprocedure('public.monthly_debt_report(date)') as monthly_report,\n"+
  "       to_regprocedure('public.set_month_opening_debt(bigint,date,numeric,numeric)') as opening_editor;\n");
const output=new URL('outputs/prod-db/20261020-production-update.sql',root);
mkdirSync(new URL('outputs/prod-db/',root),{recursive:true});
writeFileSync(output,parts.join('\n\n'));
console.log('Created outputs/prod-db/20261020-production-update.sql');
