-- ============================================================
-- Kitapal — auth.users триггері
-- ТЕК Supabase SQL Editor-да жүргізіңіз!
-- (DBeaver / pgAdmin-де auth схемасына рұқсат жоқ — қате береді)
--
-- Суpabase → SQL Editor → New query → осыны қойып → Run
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'distributor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
