// Optional isolated PostgreSQL verification; pg_cron scheduling is stubbed.
const {PGlite}=await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
import {readFileSync} from 'node:fs';
const db=new PGlite();
const read=p=>readFileSync(p,'utf8');
const apply=async (label,sql)=>{try{await db.exec(sql);console.log('PASS '+label);}catch(e){console.error('FAIL '+label+': '+e.message);process.exit(1);}};
await apply('isolated Auth and roles',`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema cron; create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare j bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into j;return j;end$$;
create function cron.unschedule(text) returns boolean language plpgsql as $$begin delete from cron.job where jobname=$1;return found;end$$;`);
for(const file of ['20260620182537_core_tables.sql','20260620182551_transaction_tables.sql','20260620182605_functions.sql','20260620182618_views.sql','20260620182631_rls.sql','20260621100930_private_helpers.sql','20260703230100_manager_sees_unassigned_distributors.sql'])await apply(file,read('supabase/migrations/'+file));
const bundle=read('outputs/prod-db/20261020-production-update.sql').replace('create extension if not exists pg_cron;','-- Scheduler DDL is stubbed in this isolated engine.');
await apply('production SQL first execution',bundle);
await apply('production SQL idempotent rerun',bundle);
for(const file of ['pending_order_debt.sql','monthly_debt_rollover.sql','edit_month_opening_debt.sql'])await apply(file,read('supabase/tests/'+file));
await apply('missing-month backfill on production rerun',`begin;
insert into public.distributors(company,city,credit_limit,debt_adjustment) values('Gap regression','Test',1000,100);
insert into public.monthly_opening_debts(distributor_id,month_start,amount,credit_limit)
select id,(date_trunc('month',now() at time zone 'Asia/Almaty')-interval '3 months')::date,100,1000 from public.distributors where company='Gap regression';`+bundle.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'')+`
do $$begin assert(select count(*)=4 from public.monthly_opening_debts m join public.distributors d on d.id=m.distributor_id where d.company='Gap regression'),'Missing intervening months';end$$;
rollback;`);
await db.close();
