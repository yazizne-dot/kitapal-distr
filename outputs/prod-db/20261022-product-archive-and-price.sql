-- Apply after the existing product pack-size migration. No order rows are removed or repriced.
begin;

-- Keep product IDs and metadata available to historical order joins.
alter table public.products add column if not exists archived_at timestamptz;

-- A stale price list must not add an archived book to a new/unshipped order.
-- Existing lines remain editable; shipped-order rewrites retain historical books.
create or replace function private.check_active_order_product()
returns trigger language plpgsql security definer set search_path='' as $$
declare archived timestamptz; order_status text;
begin
  if tg_op='UPDATE' then
    if new.product_id=old.product_id and new.order_id=old.order_id then return new; end if;
  end if;
  select p.archived_at into archived from public.products p where p.id=new.product_id for share;
  if archived is not null then
    select o.status into order_status from public.orders o where o.id=new.order_id;
    if coalesce(order_status,'') not in ('shipped','delivered') then
      raise exception 'Book is no longer available in the price list' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_active_order_product() from public,anon,authenticated;
drop trigger if exists check_active_order_product on public.order_items;
create trigger check_active_order_product before insert or update of product_id,order_id
on public.order_items for each row execute function private.check_active_order_product();

create or replace function public.archive_product(p_product_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(private.my_role(),'') not in ('admin','manager') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.products set archived_at=now()
    where id=p_product_id and archived_at is null and barcode <> 'OPENING-BALANCE';
  if not found then raise exception 'Book not found, already archived or protected' using errcode='22023'; end if;
end $$;
revoke all on function public.archive_product(bigint) from public,anon;
grant execute on function public.archive_product(bigint) to authenticated;

-- Managers may change only price and pack size through this operation.
create or replace function public.set_product_price_and_pack_size(
  p_product_id bigint, p_base_price numeric, p_pack_size integer
) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(private.my_role(),'') not in ('admin','manager') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_base_price is null or p_base_price::text in ('NaN','Infinity','-Infinity')
    or round(p_base_price,2) <= 0 or p_base_price > 9999999999.99
    or (p_pack_size is not null and p_pack_size <= 0) then
    raise exception 'Invalid price or pack size' using errcode='22023';
  end if;
  update public.products set base_price=round(p_base_price,2),pack_size=p_pack_size
    where id=p_product_id and archived_at is null and barcode <> 'OPENING-BALANCE';
  if not found then raise exception 'Book not found, archived or protected' using errcode='22023'; end if;
end $$;
revoke all on function public.set_product_price_and_pack_size(bigint,numeric,integer) from public,anon;
grant execute on function public.set_product_price_and_pack_size(bigint,numeric,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
