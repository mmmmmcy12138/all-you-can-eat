-- Phase 2: all privileged mutations are atomic RPCs. No service-role key in the app.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check (char_length(display_name) <= 60),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null check (char_length(btrim(name)) between 1 and 60),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.household_members (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 role text not null check (role in ('owner','member')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(household_id,user_id)
);
create unique index one_owner_per_household on public.household_members(household_id) where role='owner';
create index members_by_household on public.household_members(household_id);
create table public.household_invitations (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 token_hash text not null unique, created_by uuid not null references public.profiles(id),
 expires_at timestamptz not null default now() + interval '48 hours', used_by uuid references public.profiles(id),
 used_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((used_at is null) = (used_by is null)), check(expires_at > created_at)
);
create index invitations_by_household on public.household_invitations(household_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now(); return new; end$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();
create trigger households_updated before update on public.households for each row execute function public.touch_updated_at();
create trigger members_updated before update on public.household_members for each row execute function public.touch_updated_at();
create trigger invitations_updated before update on public.household_invitations for each row execute function public.touch_updated_at();
create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),60)); return new; end$$;
create trigger auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();
insert into public.profiles(id,display_name) select id,left(coalesce(raw_user_meta_data->>'display_name',''),60) from auth.users on conflict do nothing;
create function public.my_household_id() returns uuid language sql stable security definer set search_path='' as $$ select household_id from public.household_members where user_id=auth.uid() $$;
create function public.is_household_owner(hid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.household_members where user_id=auth.uid() and household_id=hid and role='owner') $$;
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
create policy profiles_visible on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.household_members m where m.user_id=profiles.id and m.household_id=public.my_household_id()));
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy household_visible on public.households for select to authenticated using(id=public.my_household_id());
create policy members_visible on public.household_members for select to authenticated using(household_id=public.my_household_id());
create policy invitations_visible on public.household_invitations for select to authenticated using(public.is_household_owner(household_id));
-- Lock the caller's profile first to serialize concurrent create/join requests for one user.
create function public.create_household(household_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare hid uuid; uid uuid:=auth.uid();
begin
 if uid is null then raise exception '请先登录'; end if;
 perform 1 from public.profiles where id=uid for update;
 if exists(select 1 from public.household_members where user_id=uid) then raise exception '你已经加入家庭'; end if;
 if char_length(btrim(household_name)) not between 1 and 60 then raise exception '家庭名称需要 1–60 个字符'; end if;
 insert into public.households(name,created_by) values(btrim(household_name),uid) returning id into hid;
 insert into public.household_members(household_id,user_id,role) values(hid,uid,'owner'); return hid;
end$$;
create function public.create_household_invitation() returns text language plpgsql security definer set search_path='' as $$
declare hid uuid; token text;
begin
 hid:=public.my_household_id();
 perform 1 from public.households where id=hid for update;
 if not public.is_household_owner(hid) then raise exception '只有 Owner 可以邀请成员'; end if;
 if (select count(*) from public.household_members where household_id=hid)>=2 then raise exception 'V1 家庭最多两名成员'; end if;
 update public.household_invitations set revoked_at=now() where household_id=hid and used_at is null and revoked_at is null;
 token:=gen_random_uuid()::text || gen_random_uuid()::text;
 insert into public.household_invitations(household_id,token_hash,created_by) values(hid,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
 return token;
end$$;
create function public.accept_household_invitation(invitation_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.household_invitations; hid uuid; uid uuid:=auth.uid();
begin
 if uid is null then raise exception '请先登录'; end if;
 if char_length(invitation_token)<>72 then raise exception '邀请无效或已失效'; end if;
 perform 1 from public.profiles where id=uid for update;
 if exists(select 1 from public.household_members where user_id=uid) then raise exception '你已经加入家庭'; end if;
 select household_id into hid from public.household_invitations where token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex');
 -- All invitation/member operations lock the household before the invitation row.
 perform 1 from public.households where id=hid for update;
 select * into inv from public.household_invitations where token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex') for update;
 if inv.id is null or inv.used_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception '邀请无效或已失效'; end if;
 if (select count(*) from public.household_members where household_id=hid)>=2 then raise exception '家庭已满'; end if;
 insert into public.household_members(household_id,user_id,role) values(hid,uid,'member');
 update public.household_invitations set used_at=now(),used_by=uid where id=inv.id; return hid;
end$$;
create function public.revoke_household_invitation(invitation_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare hid uuid:=public.my_household_id();
begin
 perform 1 from public.households where id=hid for update;
 if not public.is_household_owner(hid) then raise exception '只有 Owner 可以撤销邀请'; end if;
 update public.household_invitations set revoked_at=now() where id=invitation_id and household_id=hid and used_at is null;
end$$;
create function public.rename_household(household_name text) returns void language plpgsql security definer set search_path='' as $$
declare hid uuid:=public.my_household_id();
begin
 perform 1 from public.households where id=hid for update;
 if not public.is_household_owner(hid) then raise exception '只有 Owner 可以修改家庭'; end if;
 if char_length(btrim(household_name)) not between 1 and 60 then raise exception '家庭名称需要 1–60 个字符'; end if;
 update public.households set name=btrim(household_name) where id=hid;
end$$;
create function public.remove_household_member(member_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare hid uuid:=public.my_household_id();
begin
 perform 1 from public.households where id=hid for update;
 if not public.is_household_owner(hid) then raise exception '只有 Owner 可以移除成员'; end if;
 delete from public.household_members where id=member_id and household_id=hid and role='member';
end$$;
-- Explicit grants: direct household/member/invitation writes and token hash reads are denied.
revoke all on public.profiles,public.households,public.household_members,public.household_invitations from anon,authenticated;
grant select on public.profiles,public.households,public.household_members to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant select(id,household_id,created_by,expires_at,used_by,used_at,revoked_at,created_at,updated_at) on public.household_invitations to authenticated;
revoke all on function public.touch_updated_at(),public.on_auth_user_created(),public.my_household_id(),public.is_household_owner(uuid),public.create_household(text),public.create_household_invitation(),public.accept_household_invitation(text),public.revoke_household_invitation(uuid),public.rename_household(text),public.remove_household_member(uuid) from public,anon;
grant execute on function public.my_household_id(),public.is_household_owner(uuid),public.create_household(text),public.create_household_invitation(),public.accept_household_invitation(text),public.revoke_household_invitation(uuid),public.rename_household(text),public.remove_household_member(uuid) to authenticated;
