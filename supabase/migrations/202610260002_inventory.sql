-- Apply after 202610260001_households.sql. No existing household data is changed.
create table public.ingredients (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 80), name_en text check(char_length(name_en)<=100),
 normalized_name text generated always as (lower(btrim(name))) stored,
 category text not null check(category in ('肉类','海鲜','蔬菜','水果','蛋奶','主食','调味料','饮料','其他')),
 base_unit text not null check(base_unit in ('g','ml','个','包','袋','瓶','盒','份')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(household_id,id),unique(household_id,normalized_name)
);
create table public.purchases (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 created_by uuid not null references public.profiles(id), purchased_on date not null,
 store_name text not null default '' check(char_length(store_name)<=80),note text not null default '' check(char_length(note)<=500),
 request_key uuid not null,payload_hash text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(household_id,id),unique(household_id,request_key)
);
create table public.purchase_items (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 purchase_id uuid not null,line_number integer not null check(line_number between 1 and 50),ingredient_id uuid not null,quantity numeric(14,3) not null check(quantity>0 and quantity<=1000000000),
 unit text not null,total_cost numeric(12,2) check(total_cost>=0 and total_cost<=100000000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(household_id,id),unique(household_id,purchase_id,line_number),foreign key(household_id,purchase_id) references public.purchases(household_id,id),
 foreign key(household_id,ingredient_id) references public.ingredients(household_id,id)
);
create table public.stock_lots (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 ingredient_id uuid not null,purchase_item_id uuid not null unique,
 initial_quantity numeric(14,3) not null check(initial_quantity>0 and initial_quantity<=1000000000),
 current_quantity numeric(14,3) not null check(current_quantity>=0 and current_quantity<=1000000000),
 unit text not null,purchased_on date not null,expires_on date,
 total_cost numeric(12,2) check(total_cost>=0 and total_cost<=100000000),
 storage_location text not null default '冷藏' check(storage_location in ('冷藏','冷冻','常温')),
 source text not null default '' check(char_length(source)<=80),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(household_id,id),foreign key(household_id,ingredient_id) references public.ingredients(household_id,id),
 foreign key(household_id,purchase_item_id) references public.purchase_items(household_id,id),
 check(expires_on is null or expires_on>=purchased_on)
);
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(),household_id uuid not null references public.households(id) on delete cascade,
 stock_lot_id uuid not null,actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('PURCHASE','COOK','WASTE','ADJUSTMENT')),
 quantity_delta numeric(14,3) not null check(quantity_delta<>0),quantity_after numeric(14,3) not null check(quantity_after>=0),
 source text not null check(char_length(source) between 1 and 80),note text not null default '' check(char_length(note)<=500),
 request_key uuid not null,payload_hash text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(household_id,stock_lot_id) references public.stock_lots(household_id,id),
 unique(household_id,request_key,stock_lot_id)
);
create index lots_by_ingredient on public.stock_lots(household_id,ingredient_id,expires_on,created_at);
create index purchases_by_date on public.purchases(household_id,purchased_on desc,created_at desc);
create index purchase_items_by_purchase on public.purchase_items(household_id,purchase_id);
create index movements_by_lot on public.stock_movements(household_id,stock_lot_id,created_at desc);
-- Every client-visible row is household-scoped; clients may not bypass the audited RPCs.
alter table public.ingredients enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
create policy ingredients_read on public.ingredients for select to authenticated using(household_id=public.my_household_id());
create policy purchases_read on public.purchases for select to authenticated using(household_id=public.my_household_id());
create policy purchase_items_read on public.purchase_items for select to authenticated using(household_id=public.my_household_id());
create policy stock_lots_read on public.stock_lots for select to authenticated using(household_id=public.my_household_id());
create policy stock_movements_read on public.stock_movements for select to authenticated using(household_id=public.my_household_id());
revoke all on public.ingredients,public.purchases,public.purchase_items,public.stock_lots,public.stock_movements from anon,authenticated;
grant select on public.ingredients,public.purchases,public.purchase_items,public.stock_lots,public.stock_movements to authenticated;
create trigger ingredients_updated before update on public.ingredients for each row execute function public.touch_updated_at();
create trigger purchases_updated before update on public.purchases for each row execute function public.touch_updated_at();
create trigger items_updated before update on public.purchase_items for each row execute function public.touch_updated_at();
create trigger lots_updated before update on public.stock_lots for each row execute function public.touch_updated_at();
-- Ledger rows are append-only even for accidental privileged updates/deletes.
create function public.reject_movement_change() returns trigger language plpgsql set search_path='' as $$begin raise exception '库存流水不可修改或删除';end$$;
create trigger movements_immutable before update or delete on public.stock_movements for each row execute function public.reject_movement_change();
create function public.record_purchase(request_id uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); hid uuid; pid uuid; old_hash text; digest text; item jsonb; iid uuid; item_id uuid; lot_id uuid;
 qty numeric; cost numeric; unit_name text; food_name text; cat text; exp date; day date; shop text; memo text; place text; existing_unit text; line_no integer:=0;
begin
 if uid is null then raise exception '请先登录';end if;
 select household_id into hid from public.household_members where user_id=uid;
 perform 1 from public.households where id=hid for update;
 if hid is null or not exists(select 1 from public.household_members where user_id=uid and household_id=hid) then raise exception '请先加入家庭';end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception '无效采购请求';end if;
 digest:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 select id,payload_hash into pid,old_hash from public.purchases where household_id=hid and request_key=request_id;
 if found then
  if old_hash<>digest then raise exception '同一请求编号不能提交不同内容';end if;
  return pid;
 end if;
 if exists(select 1 from public.stock_movements where household_id=hid and request_key=request_id) then raise exception '同一请求编号不能用于不同操作';end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception '请添加采购明细';end if;
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception '每次采购需要 1–50 项';end if;
 if coalesce(payload->>'purchased_on','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '采购日期无效';end if;
 day:=(payload->>'purchased_on')::date;shop:=btrim(coalesce(payload->>'store_name',''));memo:=btrim(coalesce(payload->>'note',''));
 if char_length(shop)>80 or char_length(memo)>500 then raise exception '商店或备注过长';end if;
 insert into public.purchases(household_id,created_by,purchased_on,store_name,note,request_key,payload_hash) values(hid,uid,day,shop,memo,request_id,digest) returning id into pid;
 for item in select value from jsonb_array_elements(payload->'items') loop
  line_no:=line_no+1;
  if jsonb_typeof(item)<>'object' then raise exception '无效采购明细';end if;
  if coalesce(item->>'quantity','') !~ '^\d{1,10}(\.\d{1,3})?$' then raise exception '数量最多保留三位小数';end if;
  qty:=(item->>'quantity')::numeric;
  if qty<=0 or qty>1000000000 then raise exception '采购数量超出范围';end if;
  cost:=null;
  if coalesce(item->>'total_cost','')<>'' then
   if (item->>'total_cost') !~ '^\d{1,9}(\.\d{1,2})?$' then raise exception '金额最多保留两位小数';end if;
   cost:=(item->>'total_cost')::numeric;if cost>100000000 then raise exception '采购金额超出范围';end if;
  end if;
  unit_name:=item->>'unit';
  if unit_name is null or unit_name not in ('g','ml','个','包','袋','瓶','盒','份') then raise exception '请选择基础单位';end if;
  iid:=nullif(item->>'ingredient_id','')::uuid;
  if iid is not null then
   select base_unit into existing_unit from public.ingredients where id=iid and household_id=hid;
   if not found then raise exception '食材不存在或不属于当前家庭';end if;
   if existing_unit<>unit_name then raise exception '单位必须与食材基础单位一致';end if;
  else
   food_name:=btrim(coalesce(item->>'name',''));cat:=item->>'category';
   if char_length(food_name) not between 1 and 80 then raise exception '食材名称需要 1–80 字';end if;
   if cat is null or cat not in ('肉类','海鲜','蔬菜','水果','蛋奶','主食','调味料','饮料','其他') then raise exception '请选择食材分类';end if;
   select id,base_unit into iid,existing_unit from public.ingredients where household_id=hid and normalized_name=lower(food_name);
   if found then
    if existing_unit<>unit_name then raise exception '同名食材已存在，请使用原基础单位';end if;
   else
    insert into public.ingredients(household_id,name,category,base_unit) values(hid,food_name,cat,unit_name) returning id into iid;
   end if;
  end if;
  if coalesce(item->>'expires_on','')<>'' and (item->>'expires_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '到期日期无效';end if;
  exp:=nullif(item->>'expires_on','')::date;
  if exp is not null and exp<day then raise exception '到期日期不能早于采购日期';end if;
  place:=coalesce(item->>'storage_location','冷藏');
  if place not in ('冷藏','冷冻','常温') then raise exception '无效存放位置';end if;
  insert into public.purchase_items(household_id,purchase_id,line_number,ingredient_id,quantity,unit,total_cost) values(hid,pid,line_no,iid,qty,unit_name,cost) returning id into item_id;
  insert into public.stock_lots(household_id,ingredient_id,purchase_item_id,initial_quantity,current_quantity,unit,purchased_on,expires_on,total_cost,storage_location,source) values(hid,iid,item_id,qty,qty,unit_name,day,exp,cost,place,shop) returning id into lot_id;
  insert into public.stock_movements(household_id,stock_lot_id,actor_id,kind,quantity_delta,quantity_after,source,note,request_key,payload_hash) values(hid,lot_id,uid,'PURCHASE',qty,qty,'manual-purchase',memo,request_id,digest);
 end loop;
 return pid;
end$$;
create function public.adjust_stock(request_id uuid,lot_id uuid,new_quantity text,expected_quantity text,movement_kind text,movement_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();hid uuid;lot public.stock_lots;target numeric;delta numeric;mid uuid;old_hash text;digest text;
begin
 if uid is null then raise exception '请先登录';end if;
 select household_id into hid from public.household_members where user_id=uid;
 perform 1 from public.households where id=hid for update;
 if hid is null or not exists(select 1 from public.household_members where user_id=uid and household_id=hid) then raise exception '请先加入家庭';end if;
 if request_id is null or lot_id is null or new_quantity is null or expected_quantity is null or movement_kind is null or movement_note is null then raise exception '无效调整请求';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('lot',lot_id,'quantity',new_quantity,'expected',expected_quantity,'kind',movement_kind,'note',movement_note)::text,'UTF8')),'hex');
 select id,payload_hash into mid,old_hash from public.stock_movements where household_id=hid and request_key=request_id;
 if found then if old_hash<>digest then raise exception '同一请求编号不能提交不同内容';end if;return mid;end if;
 if expected_quantity !~ '^\d{1,10}(\.\d{1,3})?$' then raise exception '原库存数量无效';end if;
 if new_quantity !~ '^\d{1,10}(\.\d{1,3})?$' then raise exception '数量最多保留三位小数';end if;
 target:=new_quantity::numeric;
 if target<0 or target>1000000000 or movement_kind not in ('WASTE','ADJUSTMENT') or char_length(btrim(movement_note)) not between 1 and 500 then raise exception '请检查调整数量、类型及备注';end if;
 select * into lot from public.stock_lots where id=lot_id and household_id=hid for update;
 if not found then raise exception '批次不存在或不属于当前家庭';end if;
 if lot.current_quantity<>expected_quantity::numeric then raise exception '库存已被另一位成员更新，请刷新后重新核对';end if;
 delta:=target-lot.current_quantity;
 if delta=0 then raise exception '数量没有变化';end if;
 if movement_kind='WASTE' and delta>=0 then raise exception '报损只能减少库存';end if;
 update public.stock_lots set current_quantity=target where id=lot_id;
 insert into public.stock_movements(household_id,stock_lot_id,actor_id,kind,quantity_delta,quantity_after,source,note,request_key,payload_hash) values(hid,lot_id,uid,movement_kind,delta,target,'manual-adjustment',btrim(movement_note),request_id,digest) returning id into mid;
 return mid;
end$$;
revoke all on function public.record_purchase(uuid,jsonb),public.adjust_stock(uuid,uuid,text,text,text,text),public.reject_movement_change() from public,anon;
grant execute on function public.record_purchase(uuid,jsonb),public.adjust_stock(uuid,uuid,text,text,text,text) to authenticated;
-- A single statement reads a consistent household snapshot. JSON aggregates are not
-- silently cut off by PostgREST's top-level row limit; RLS still applies as caller.
create function public.read_inventory() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'household_id',public.my_household_id(),
  'ingredients',coalesce((select jsonb_agg(to_jsonb(i) order by i.name,i.id) from public.ingredients i where i.household_id=public.my_household_id()),'[]'::jsonb),
  'lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc,l.id) from public.stock_lots l where l.household_id=public.my_household_id()),'[]'::jsonb)
 )
$$;
revoke all on function public.read_inventory() from public,anon;
grant execute on function public.read_inventory() to authenticated;

notify pgrst,'reload schema';
