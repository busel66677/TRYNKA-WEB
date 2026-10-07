-- TRYNKA v89 auth/profile repair (applied live 2026-10-07)
create schema if not exists private;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_fallback text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'nickname','')), '');
  if v_name is null then v_name := nullif(split_part(coalesce(new.email,''),'@',1),''); end if;
  if v_name is null then v_name := 'Гравець'; end if;

  insert into public.profiles(id,nickname)
  values(new.id,left(v_name,20))
  on conflict do nothing;

  if not exists(select 1 from public.profiles where id=new.id) then
    v_fallback := left(v_name,15)||'_'||substr(replace(new.id::text,'-',''),1,4);
    insert into public.profiles(id,nickname)
    values(new.id,v_fallback)
    on conflict do nothing;
  end if;

  if not exists(select 1 from public.profiles where id=new.id) then
    insert into public.profiles(id,nickname)
    values(new.id,'Гравець_'||substr(replace(new.id::text,'-',''),1,8))
    on conflict do nothing;
  end if;

  return new;
end
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();
