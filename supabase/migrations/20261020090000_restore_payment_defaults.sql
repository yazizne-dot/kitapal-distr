-- Also repair databases that already applied the payment-ID migration.
begin;

alter table public.payments
  alter column created_at set default now(),
  alter column paid_at set default current_date,
  alter column note set default '';

notify pgrst, 'reload schema';
commit;
