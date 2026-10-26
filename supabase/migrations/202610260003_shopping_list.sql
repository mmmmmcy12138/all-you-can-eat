-- Additive migration after 001/002; existing inventory and households are preserved.
create table public.shopping_items (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 ingredient_id uuid,name text not null check(char_length(btrim(name)) between 1 and 80),
 normalized_name text generated always as (lower(btrim(name))) stored,
 category text not null check(category in ('肉类','海鲜','蔬菜','水果','蛋奶','主食','调味料','饮料','其他')),
 unit text not null check(unit in ('g','ml','个','包','袋','瓶','盒','份')),
 quantity numeric(14,3) not null check(quantity>0 and quantity<=1000000000),
 stocked_quantity numeric(14,3) not null default 0 check(stocked_quantity>=0 and stocked_quantity<=2000000000),
 status text not null default 'open' check(status in ('open','purchased','stocked','cancelled')),
 version bigint not null default 1 check(version>0),created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(household_id,id),foreign key(household_id,ingredient_id) references public.ingredients(household_id,id),
 check((status='stocked' and stocked_quantity>=quantity) or status<>'stocked'),
 check(status not in ('open','purchased') or stocked_quantity<quantity)
);
create unique index shopping_active_food on public.shopping_items(household_id,normalized_name) where status in ('open','purchased');
create index shopping_by_status on public.shopping_items(household_id,status,created_at);
create table public.shopping_requests (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 request_key uuid not null,operation text not null,payload_hash text not null,result_id uuid not null,
 created_at timestamptz not null default now(),unique(household_id,request_key),
 foreign key(household_id,result_id) references public.shopping_items(household_id,id)
);
alter table public.shopping_items enable row level security;
alter table public.shopping_requests enable row level security;
create policy shopping_read on public.shopping_items for select to authenticated using(household_id=public.my_household_id());
revoke all on public.shopping_items,public.shopping_requests from anon,authenticated;
grant select on public.shopping_items to authenticated;
create trigger shopping_updated before update on public.shopping_items for each row execute function public.touch_updated_at();
create function public.add_shopping_item(request_id uuid,item_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();hid uuid;sid uuid;previous public.shopping_requests;digest text;food_name text;food_unit text;cat text;iid uuid;need numeric;existing public.shopping_items;food public.ingredients;
begin
 if uid is null then raise exception '请先登录';end if;
 select household_id into hid from public.household_members where user_id=uid;
 perform 1 from public.households where id=hid for update;
 if hid is null or not exists(select 1 from public.household_members where user_id=uid and household_id=hid) then raise exception '请先加入家庭';end if;
 if request_id is null or item_payload is null or jsonb_typeof(item_payload)<>'object' then raise exception '无效购物请求';end if;
 digest:=encode(sha256(convert_to(item_payload::text,'UTF8')),'hex');
 select * into previous from public.shopping_requests where household_id=hid and request_key=request_id;
 if found then if previous.operation<>'add' or previous.payload_hash<>digest then raise exception '同一请求编号不能提交不同内容';end if;return previous.result_id;end if;
 if coalesce(item_payload->>'quantity','') !~ '^\d{1,10}(\.\d{1,3})?$' then raise exception '待买数量最多三位小数';end if;
 need:=(item_payload->>'quantity')::numeric;if need<=0 or need>1000000000 then raise exception '待买数量超出范围';end if;
 iid:=nullif(item_payload->>'ingredient_id','')::uuid;
 food_name:=btrim(coalesce(item_payload->>'name',''));food_unit:=item_payload->>'unit';cat:=item_payload->>'category';
 if iid is not null then
  select * into food from public.ingredients where id=iid and household_id=hid;
  if not found then raise exception '食材不存在或不属于当前家庭';end if;
  if food.base_unit is distinct from food_unit then raise exception '单位必须与食材基础单位一致';end if;
  food_name:=food.name;cat:=food.category;
 else
  if char_length(food_name) not between 1 and 80 then raise exception '名称需要 1–80 字';end if;
  select * into food from public.ingredients where household_id=hid and normalized_name=lower(food_name);
  if found then
   if food.base_unit is distinct from food_unit then raise exception '同名食材单位不一致';end if;
   iid:=food.id;food_name:=food.name;cat:=food.category;
  end if;
 end if;
 if food_unit is null or food_unit not in ('g','ml','个','包','袋','瓶','盒','份') or cat is null or cat not in ('肉类','海鲜','蔬菜','水果','蛋奶','主食','调味料','饮料','其他') then raise exception '无效单位或分类';end if;
 select * into existing from public.shopping_items where household_id=hid and normalized_name=lower(food_name) and status in ('open','purchased') for update;
 if found then
  if existing.unit<>food_unit then raise exception '同名清单商品单位不一致，请先核对';end if;
  -- The input is the desired remaining demand, not an increment. Repeats take max.
  update public.shopping_items set quantity=stocked_quantity+greatest(quantity-stocked_quantity,need),ingredient_id=coalesce(ingredient_id,iid),status=case when need>quantity-stocked_quantity then 'open' else status end,updated_by=uid,version=version+1 where id=existing.id returning id into sid;
 else
  insert into public.shopping_items(household_id,ingredient_id,name,category,unit,quantity,created_by,updated_by) values(hid,iid,food_name,cat,food_unit,need,uid,uid) returning id into sid;
 end if;
 insert into public.shopping_requests(household_id,request_key,operation,payload_hash,result_id) values(hid,request_id,'add',digest,sid);return sid;
end$$;
create function public.change_shopping_item(request_id uuid,item_id uuid,expected_version bigint,item_action text,remaining_quantity text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();hid uuid;previous public.shopping_requests;digest text;entry public.shopping_items;need numeric;
begin
 if uid is null then raise exception '请先登录';end if;
 select household_id into hid from public.household_members where user_id=uid;
 perform 1 from public.households where id=hid for update;
 if hid is null or not exists(select 1 from public.household_members where user_id=uid and household_id=hid) then raise exception '请先加入家庭';end if;
 if request_id is null or item_id is null or expected_version is null then raise exception '无效清单请求';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('id',item_id,'version',expected_version,'action',item_action,'remaining',remaining_quantity)::text,'UTF8')),'hex');
 select * into previous from public.shopping_requests where household_id=hid and request_key=request_id;
 if found then if previous.operation<>'change' or previous.payload_hash<>digest then raise exception '同一请求编号不能提交不同内容';end if;return previous.result_id;end if;
 select * into entry from public.shopping_items where id=item_id and household_id=hid for update;
 if not found then raise exception '清单商品不存在或不属于当前家庭';end if;
 if entry.version<>expected_version then raise exception '清单已被另一位成员更新，请刷新后重试';end if;
 if entry.status not in ('open','purchased') then raise exception '该需求已完成或已移除，请重新添加需求';end if;
 if item_action='purchased' then update public.shopping_items set status='purchased',version=version+1,updated_by=uid where id=item_id;
 elsif item_action='open' then update public.shopping_items set status='open',version=version+1,updated_by=uid where id=item_id;
 elsif item_action='cancel' then update public.shopping_items set status='cancelled',version=version+1,updated_by=uid where id=item_id;
 elsif item_action='quantity' then
  if coalesce(remaining_quantity,'') !~ '^\d{1,10}(\.\d{1,3})?$' then raise exception '待买数量最多三位小数';end if;
  need:=remaining_quantity::numeric;if need<=0 or need>1000000000 then raise exception '待买数量必须大于 0；不需要了可移除';end if;
  update public.shopping_items set quantity=stocked_quantity+need,status='open',version=version+1,updated_by=uid where id=item_id;
 else raise exception '无效清单操作';end if;
 insert into public.shopping_requests(household_id,request_key,operation,payload_hash,result_id) values(hid,request_id,'change',digest,item_id);return item_id;
end$$;
create function public.record_purchase_from_list(request_id uuid,payload jsonb,shopping_links jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();hid uuid;pid uuid;link jsonb;entry public.shopping_items;line public.purchase_items;food public.ingredients;decorated jsonb;ids uuid[]:='{}';positions integer[]:='{}';sid uuid;pos integer;version_expected bigint;
begin
 if uid is null then raise exception '请先登录';end if;
 select household_id into hid from public.household_members where user_id=uid;
 perform 1 from public.households where id=hid for update;
 if hid is null or not exists(select 1 from public.household_members where user_id=uid and household_id=hid) then raise exception '请先加入家庭';end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' or shopping_links is null or jsonb_typeof(shopping_links)<>'array' then raise exception '无效清单入库请求';end if;
 if jsonb_array_length(shopping_links) not between 1 and 50 then raise exception '请选择清单商品';end if;
 decorated:=payload||jsonb_build_object('_shopping_links',shopping_links);
 if exists(select 1 from public.purchases where household_id=hid and request_key=request_id) then return public.record_purchase(request_id,decorated);end if;
 for link in select value from jsonb_array_elements(shopping_links) loop
  sid:=(link->>'item_id')::uuid;pos:=(link->>'line_number')::integer;version_expected:=(link->>'version')::bigint;
  if sid is null or pos is null or version_expected is null or pos<1 or pos>50 or sid=any(ids) or pos=any(positions) then raise exception '清单商品或行号重复/无效';end if;
  ids:=array_append(ids,sid);positions:=array_append(positions,pos);
  select * into entry from public.shopping_items where household_id=hid and id=sid for update;
  if not found then raise exception '清单商品不存在或不属于当前家庭';end if;
  if entry.status not in ('open','purchased') or entry.version<>version_expected then raise exception '清单已变化或已入库，请刷新后重新核对';end if;
 end loop;
 pid:=public.record_purchase(request_id,decorated);
 for link in select value from jsonb_array_elements(shopping_links) loop
  sid:=(link->>'item_id')::uuid;pos:=(link->>'line_number')::integer;
  select * into entry from public.shopping_items where id=sid and household_id=hid;
  select * into line from public.purchase_items where household_id=hid and purchase_id=pid and line_number=pos;
  if not found then raise exception '未找到清单对应采购明细';end if;
  select * into food from public.ingredients where household_id=hid and id=line.ingredient_id;
  if line.unit<>entry.unit or (entry.ingredient_id is not null and entry.ingredient_id<>line.ingredient_id) or (entry.ingredient_id is null and entry.normalized_name<>food.normalized_name) then raise exception '采购食材与清单不一致，请解除关联或重新核对';end if;
  update public.shopping_items set ingredient_id=line.ingredient_id,stocked_quantity=stocked_quantity+line.quantity,status=case when stocked_quantity+line.quantity>=quantity then 'stocked' else 'open' end,version=version+1,updated_by=uid where id=sid;
 end loop;
 return pid;
end$$;
revoke all on function public.add_shopping_item(uuid,jsonb),public.change_shopping_item(uuid,uuid,bigint,text,text),public.record_purchase_from_list(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.add_shopping_item(uuid,jsonb),public.change_shopping_item(uuid,uuid,bigint,text,text),public.record_purchase_from_list(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
create function public.read_shopping_list() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('household_id',public.my_household_id(),
 'active',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id) from public.shopping_items s where s.household_id=public.my_household_id() and s.status in ('open','purchased')),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(history) order by history.updated_at desc,history.id) from (select * from public.shopping_items where household_id=public.my_household_id() and status in ('stocked','cancelled') order by updated_at desc,id limit 20) history),'[]'::jsonb));
$$;
revoke all on function public.read_shopping_list() from public,anon;
grant execute on function public.read_shopping_list() to authenticated;
notify pgrst,'reload schema';
