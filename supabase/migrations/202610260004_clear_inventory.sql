-- Additive: preserve ingredients, lots, purchase history and immutable audit rows.
create table public.inventory_clear_requests (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 request_key uuid not null,payload_hash text not null,cleared_lots integer not null check(cleared_lots>=0),
 actor_id uuid not null references public.profiles(id),reason text not null check(char_length(btrim(reason)) between 1 and 500),
 created_at timestamptz not null default now(),unique(household_id,request_key)
);
alter table public.inventory_clear_requests enable row level security;
revoke all on public.inventory_clear_requests from anon,authenticated;
create or replace function public.read_inventory() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'household_id',public.my_household_id(),
  'ingredients',coalesce((select jsonb_agg(to_jsonb(i) order by i.name,i.id) from public.ingredients i where i.household_id=public.my_household_id()),'[]'::jsonb),
  'lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc,l.id) from public.stock_lots l where l.household_id=public.my_household_id()),'[]'::jsonb),
  'clear_fingerprint',encode(sha256(convert_to(coalesce((select jsonb_agg(jsonb_build_array(l.id,l.current_quantity,extract(epoch from l.updated_at)) order by l.id) from public.stock_lots l where l.household_id=public.my_household_id() and l.current_quantity>0),'[]'::jsonb)::text,'UTF8')),'hex'),
  'positive_lot_count',(select count(*) from public.stock_lots l where l.household_id=public.my_household_id() and l.current_quantity>0)
 )
$$;
create function public.clear_inventory(request_id uuid,expected_fingerprint text,clear_reason text,confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();hid uuid;previous public.inventory_clear_requests;digest text;fingerprint text;entry public.stock_lots;cleared integer:=0;result_id uuid;
begin
 if uid is null then raise exception '请先登录';end if;
 select household_id into hid from public.household_members where user_id=uid;
 perform 1 from public.households where id=hid for update;
 if hid is null or not exists(select 1 from public.household_members where user_id=uid and household_id=hid) then raise exception '请先加入家庭';end if;
 if request_id is null or expected_fingerprint is null or expected_fingerprint !~ '^[0-9a-f]{64}$' or clear_reason is null or char_length(btrim(clear_reason)) not between 1 and 500 or confirmation is distinct from '清空库存' then raise exception '请填写清空原因并输入“清空库存”确认';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('fingerprint',expected_fingerprint,'reason',btrim(clear_reason))::text,'UTF8')),'hex');
 select * into previous from public.inventory_clear_requests where household_id=hid and request_key=request_id;
 if found then
  if previous.payload_hash<>digest then raise exception '同一请求编号不能提交不同内容';end if;
  return jsonb_build_object('id',previous.id,'cleared_lots',previous.cleared_lots);
 end if;
 if exists(select 1 from public.stock_movements where household_id=hid and request_key=request_id) or exists(select 1 from public.purchases where household_id=hid and request_key=request_id) then raise exception '请求编号已用于其他库存操作';end if;
 select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(l.id,l.current_quantity,extract(epoch from l.updated_at)) order by l.id),'[]'::jsonb)::text,'UTF8')),'hex') into fingerprint from public.stock_lots l where l.household_id=hid and l.current_quantity>0;
 if fingerprint<>expected_fingerprint then raise exception '库存已变化，请刷新冰箱并重新确认；此次未清空任何库存';end if;
 for entry in select * from public.stock_lots where household_id=hid and current_quantity>0 order by id for update loop
  update public.stock_lots set current_quantity=0 where id=entry.id;
  insert into public.stock_movements(household_id,stock_lot_id,actor_id,kind,quantity_delta,quantity_after,source,note,request_key,payload_hash)
   values(hid,entry.id,uid,'ADJUSTMENT',-entry.current_quantity,0,'clear-inventory',btrim(clear_reason),request_id,digest);
  cleared:=cleared+1;
 end loop;
 insert into public.inventory_clear_requests(household_id,request_key,payload_hash,cleared_lots,actor_id,reason) values(hid,request_id,digest,cleared,uid,btrim(clear_reason)) returning id into result_id;
 return jsonb_build_object('id',result_id,'cleared_lots',cleared);
end$$;
revoke all on function public.clear_inventory(uuid,text,text,text) from public,anon;
grant execute on function public.clear_inventory(uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
