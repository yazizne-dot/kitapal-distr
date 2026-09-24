begin;
alter table public.products add column if not exists cover_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('book-covers','book-covers',true,5242880,array['image/jpeg','image/png'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png'];

drop policy if exists book_covers_staff_insert on storage.objects;
create policy book_covers_staff_insert on storage.objects for insert to authenticated
with check (bucket_id='book-covers' and private.my_role() in ('admin','manager')
  and exists(select 1 from public.products p where p.id::text=(storage.foldername(storage.objects.name))[1]));
drop policy if exists book_covers_staff_delete on storage.objects;
create policy book_covers_staff_delete on storage.objects for delete to authenticated
using (bucket_id='book-covers' and private.my_role() in ('admin','manager'));
drop policy if exists book_covers_staff_select on storage.objects;
create policy book_covers_staff_select on storage.objects for select to authenticated
using (bucket_id='book-covers' and private.my_role() in ('admin','manager'));

-- Managers can change only the cover, without granting access to price edits.
create or replace function public.set_product_cover(product_id bigint, object_path text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(private.my_role(),'') not in ('admin','manager') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if object_path is not null and (
    split_part(object_path,'/',1) <> product_id::text
    or not exists(select 1 from storage.objects where bucket_id='book-covers' and name=object_path)
  ) then raise exception 'Invalid cover'; end if;
  update public.products set cover_path=object_path where id=product_id;
  if not found then raise exception 'Product not found'; end if;
end $$;
revoke all on function public.set_product_cover(bigint,text) from public,anon;
grant execute on function public.set_product_cover(bigint,text) to authenticated;
commit;
