begin;
alter table public.products add column pack_size integer check (pack_size > 0);
create function public.set_product_pack_size(product_id bigint,new_size integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(private.my_role(),'') not in ('admin','manager') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if new_size is not null and new_size<=0 then raise exception 'Invalid pack size'; end if;
  update public.products set pack_size=new_size where id=product_id;
  if not found then raise exception 'Product not found'; end if;
end $$;
revoke all on function public.set_product_pack_size(bigint,integer) from public,anon;
grant execute on function public.set_product_pack_size(bigint,integer) to authenticated;
commit;
