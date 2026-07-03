-- Managers should see distributors that aren't assigned to any manager yet
-- (manager_id IS NULL), in addition to their own assigned distributors.
-- Distributors assigned to a *different* manager remain hidden.
create or replace function private.can_access_distributor(d_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case private.my_role()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from public.distributors d
      where d.id = d_id and (d.manager_id = auth.uid() or d.manager_id is null))
    when 'distributor' then d_id = private.my_distributor_id()
    else false
  end;
$$;
