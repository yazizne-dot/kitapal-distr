-- Pin search_path on functions that lacked it (Supabase advisor 0011_function_search_path_mutable).
-- The SECURITY DEFINER helpers (my_role, my_distributor_id, can_access_distributor) already set it.

alter function public.half_year_of(date)   set search_path = public;
alter function public.current_half_year()   set search_path = public;
alter function public.city_code(text)        set search_path = public;
alter function public.set_order_code()       set search_path = public;
