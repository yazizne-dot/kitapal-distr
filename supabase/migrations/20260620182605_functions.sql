-- Helper functions + order_code trigger

create or replace function public.half_year_of(d date)
returns text language sql immutable as $$
  select extract(year from d)::int::text || '-H' ||
         case when extract(month from d) <= 6 then '1' else '2' end;
$$;

create or replace function public.current_half_year()
returns text language sql stable as $$
  select public.half_year_of(current_date);
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_distributor_id()
returns bigint language sql stable security definer set search_path = public as $$
  select distributor_id from public.profiles where id = auth.uid();
$$;

-- single source of truth for distributor-scoped visibility, reused by RLS
create or replace function public.can_access_distributor(d_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then true
    when 'manager' then exists (
      select 1 from public.distributors d where d.id = d_id and d.manager_id = auth.uid())
    when 'distributor' then d_id = public.my_distributor_id()
    else false
  end;
$$;

-- city -> 3-letter code for human-readable order codes
create or replace function public.city_code(p_city text)
returns text language sql immutable as $$
  select case p_city
    when 'Астана' then 'AST' when 'Шымкент' then 'SHY' when 'Ақтау' then 'AKT'
    when 'Қызылорда' then 'KYZ' when 'Тараз' then 'TAR' when 'Жезқазған' then 'JEZ'
    when 'Павлодар' then 'PAV' when 'Орал' then 'ORL' when 'Барахолка' then 'BAR'
    when 'Алматы' then 'ALA' when 'Атырау' then 'ATR' else 'XXX'
  end;
$$;

create or replace function public.set_order_code()
returns trigger language plpgsql as $$
declare
  v_city text;
  v_seq  int;
begin
  if new.order_code is not null then
    return new;
  end if;
  select city into v_city from public.distributors where id = new.distributor_id;
  select count(*) + 1 into v_seq
    from public.orders o
    join public.distributors d on d.id = o.distributor_id
    where d.city = v_city
      and to_char(o.created_at, 'YYMM') = to_char(now(), 'YYMM');
  new.order_code := 'KP-' || public.city_code(v_city) || '-' ||
                    to_char(now(), 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

create trigger trg_set_order_code
  before insert on public.orders
  for each row execute function public.set_order_code();
