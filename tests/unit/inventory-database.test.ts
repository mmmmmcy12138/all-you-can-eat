import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { parsePurchaseText } from "../../lib/purchase-parser";
import type { Ingredient } from "../../lib/inventory/types";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
let house: string;
const expectedByKey = new Map<string, string>();
async function user<T = Record<string, unknown>>(
  id: string,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec("begin;set local role authenticated;");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const result = await db.query<T>(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const item = (patch: Record<string, unknown> = {}) => ({
  ingredient_id: "",
  name: "牛肉",
  category: "肉类",
  quantity: "300",
  unit: "g",
  total_cost: "8.99",
  expires_on: "",
  storage_location: "冷藏",
  ...patch,
});
const payload = (items = [item()]) => ({
  purchased_on: "2026-10-26",
  store_name: "H Mart",
  note: "晚餐食材",
  items,
});
async function buy(
  data: ReturnType<typeof payload> & { household_id?: string } = payload(),
  key = randomUUID(),
  actor = A,
) {
  return (
    await user<{ id: string }>(
      actor,
      "select public.record_purchase($1,$2::jsonb) as id",
      [key, JSON.stringify(data)],
    )
  )[0].id;
}
async function lot() {
  return (
    await db.query<{
      id: string;
      ingredient_id: string;
      current_quantity: string;
    }>(
      "select id,ingredient_id,current_quantity from public.stock_lots order by created_at,id limit 1",
    )
  ).rows[0];
}
async function adjust(
  id: string,
  target: string,
  kind = "ADJUSTMENT",
  key = randomUUID(),
  actor = A,
  note = "盘点校正",
) {
  if (!expectedByKey.has(key)) {
    const rows = await db.query<{ current_quantity: string }>(
      "select current_quantity from public.stock_lots where id=$1",
      [id],
    );
    expectedByKey.set(key, rows.rows[0]?.current_quantity ?? "0");
  }
  return (
    await user<{ id: string }>(
      actor,
      "select public.adjust_stock($1,$2,$3,$4,$5,$6) as id",
      [key, id, target, expectedByKey.get(key)!, kind, note],
    )
  )[0].id;
}
async function counts() {
  const out: Record<string, number> = {};
  for (const table of [
    "ingredients",
    "purchases",
    "purchase_items",
    "stock_lots",
    "stock_movements",
  ])
    out[table] = Number(
      (
        await db.query<{ n: string }>(
          `select count(*) as n from public.${table}`,
        )
      ).rows[0].n,
    );
  return out;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const name of [
    "202610260001_households.sql",
    "202610260002_inventory.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  expectedByKey.clear();
  await db.exec("truncate auth.users cascade");
  for (const id of [A, B, C])
    await db.query("insert into auth.users(id) values($1)", [id]);
  house = (
    await user<{ id: string }>(
      A,
      "select public.create_household('我们的厨房') as id",
    )
  )[0].id;
  const token = (
    await user<{ token: string }>(
      A,
      "select public.create_household_invitation() as token",
    )
  )[0].token;
  await user(B, "select public.accept_household_invitation($1)", [token]);
  await user(C, "select public.create_household('另一个家庭')");
});
describe("transactional procurement and inventory", () => {
  it("creates purchase, item, lot and immutable purchase audit together", async () => {
    await buy();
    expect(await counts()).toEqual({
      ingredients: 1,
      purchases: 1,
      purchase_items: 1,
      stock_lots: 1,
      stock_movements: 1,
    });
    const rows = (
      await db.query<{
        quantity_delta: string;
        quantity_after: string;
        actor_id: string;
        kind: string;
      }>(
        "select quantity_delta,quantity_after,actor_id,kind from public.stock_movements",
      )
    ).rows;
    expect(rows[0]).toMatchObject({
      quantity_delta: "300.000",
      quantity_after: "300.000",
      actor_id: A,
      kind: "PURCHASE",
    });
  });
  it("preserves null expiry and unknown price", async () => {
    await buy(payload([item({ total_cost: "" })]));
    expect(
      (await db.query("select expires_on,total_cost from public.stock_lots"))
        .rows[0],
    ).toEqual({ expires_on: null, total_cost: null });
  });
  it("reuses the same food id for multiple lots, with a correct sum", async () => {
    await buy();
    await buy(
      payload([
        item({ name: " 牛肉 ", quantity: "500", expires_on: "2026-11-02" }),
      ]),
    );
    expect((await counts()).ingredients).toBe(1);
    expect((await counts()).stock_lots).toBe(2);
    expect(
      (
        await db.query<{ total: string }>(
          "select sum(current_quantity) as total from public.stock_lots",
        )
      ).rows[0].total,
    ).toBe("800.000");
  });
  it("allows another member to purchase and share the same records", async () => {
    await buy(payload(), randomUUID(), B);
    for (const table of [
      "ingredients",
      "purchases",
      "purchase_items",
      "stock_lots",
      "stock_movements",
    ])
      expect(await user(A, `select id from public.${table}`)).toHaveLength(1);
    expect(
      (
        await db.query<{ actor_id: string }>(
          "select actor_id from public.stock_movements",
        )
      ).rows[0].actor_id,
    ).toBe(B);
  });
  it("deduplicates the same request, even after another request or actor retry", async () => {
    const key = randomUUID();
    const id = await buy(payload(), key);
    await buy(payload([item({ name: "番茄", category: "蔬菜" })]));
    expect(await buy(payload(), key, B)).toBe(id);
    expect((await counts()).purchases).toBe(2);
    expect((await counts()).stock_movements).toBe(2);
  });
  it("rejects a reused purchase id with changed data", async () => {
    const key = randomUUID();
    await buy(payload(), key);
    await expect(
      buy(payload([item({ quantity: "500" })]), key),
    ).rejects.toThrow(/不同内容/);
    expect((await lot()).current_quantity).toBe("300.000");
  });
  it("rolls back the ENTIRE purchase when a later row is invalid", async () => {
    await expect(
      buy(payload([item(), item({ name: "番茄", quantity: "-1" })])),
    ).rejects.toThrow();
    expect(await counts()).toEqual({
      ingredients: 0,
      purchases: 0,
      purchase_items: 0,
      stock_lots: 0,
      stock_movements: 0,
    });
  });
  it("rejects zero quantity and excessive precision rather than rounding", async () => {
    for (const quantity of ["0", "1.0001", "1e3", "NaN", "1000000001"])
      await expect(buy(payload([item({ quantity })]))).rejects.toThrow();
    expect((await counts()).purchases).toBe(0);
  });
  it("rejects negative money and fractional cents", async () => {
    for (const total_cost of ["-1", "1.234", "100000001"])
      await expect(buy(payload([item({ total_cost })]))).rejects.toThrow();
  });
  it("does not mix incompatible units under the same ingredient name", async () => {
    await buy();
    await expect(buy(payload([item({ unit: "个" })]))).rejects.toThrow(
      /基础单位/,
    );
    expect((await counts()).ingredients).toBe(1);
  });
  it("validates an explicit ingredient id belongs to the caller household", async () => {
    await buy(payload(), randomUUID(), C);
    const foreign = (await lot()).ingredient_id;
    await expect(
      buy(payload([item({ ingredient_id: foreign })])),
    ).rejects.toThrow(/不属于/);
    expect((await counts()).purchases).toBe(1);
  });
  it("ignores an attacker supplied household_id and derives caller membership", async () => {
    await buy({
      ...payload(),
      household_id: "00000000-0000-4000-8000-000000000099",
    });
    expect(
      (
        await db.query<{ household_id: string }>(
          "select household_id from public.purchases",
        )
      ).rows[0].household_id,
    ).toBe(house);
  });
  it("enforces cross-household foreign keys even on privileged writes", async () => {
    const foreignPurchase = await buy(payload(), randomUUID(), C);
    const food = (await lot()).ingredient_id;
    await expect(
      db.query(
        "insert into public.purchase_items(household_id,purchase_id,line_number,ingredient_id,quantity,unit) values($1,$2,1,$3,1,'g')",
        [house, foreignPurchase, food],
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it("hides every inventory table from another household", async () => {
    await buy();
    for (const table of [
      "ingredients",
      "purchases",
      "purchase_items",
      "stock_lots",
      "stock_movements",
    ])
      expect(await user(C, `select * from public.${table}`)).toHaveLength(0);
  });
  it("denies direct client writes to balances and audit records", async () => {
    await buy();
    await expect(
      user(B, "update public.stock_lots set current_quantity=999"),
    ).rejects.toThrow(/permission denied/);
    await expect(user(B, "delete from public.stock_movements")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      user(
        B,
        "insert into public.ingredients(household_id,name,category,base_unit) values($1,'x','其他','g')",
        [house],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies anonymous reads and purchase/adjustment functions", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.stock_lots")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.query("select public.record_purchase($1,$2)", [
          randomUUID(),
          JSON.stringify(payload()),
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
  it("records adjustment deltas, remaining quantity and actor", async () => {
    await buy();
    const batch = await lot();
    await adjust(batch.id, "250", "ADJUSTMENT", randomUUID(), B);
    expect((await lot()).current_quantity).toBe("250.000");
    expect(
      (
        await db.query(
          "select quantity_delta,quantity_after,actor_id from public.stock_movements where kind='ADJUSTMENT'",
        )
      ).rows[0],
    ).toEqual({
      quantity_delta: "-50.000",
      quantity_after: "250.000",
      actor_id: B,
    });
  });
  it("allows waste only as a decrease and never negative", async () => {
    await buy();
    const batch = await lot();
    await expect(adjust(batch.id, "301", "WASTE")).rejects.toThrow(/只能减少/);
    await expect(adjust(batch.id, "-1", "WASTE")).rejects.toThrow();
    await adjust(batch.id, "0", "WASTE");
    expect((await lot()).current_quantity).toBe("0.000");
  });
  it("rejects a no-op adjustment or empty audit note", async () => {
    await buy();
    const batch = await lot();
    await expect(adjust(batch.id, "300")).rejects.toThrow(/没有变化/);
    await expect(
      adjust(batch.id, "250", "ADJUSTMENT", randomUUID(), A, " "),
    ).rejects.toThrow();
  });
  it("deduplicates adjustment retries after the balance has changed again", async () => {
    await buy();
    const batch = await lot();
    const key = randomUUID();
    const mid = await adjust(batch.id, "250", "WASTE", key);
    await adjust(batch.id, "200");
    expect(await adjust(batch.id, "250", "WASTE", key)).toBe(mid);
    expect((await lot()).current_quantity).toBe("200.000");
  });
  it("rejects an adjustment id reused with a different target or lot", async () => {
    await buy(payload([item(), item({ name: "番茄", category: "蔬菜" })]));
    const lots = (
      await db.query<{ id: string }>("select id from public.stock_lots")
    ).rows;
    const key = randomUUID();
    await adjust(lots[0].id, "250", "ADJUSTMENT", key);
    await expect(adjust(lots[0].id, "200", "ADJUSTMENT", key)).rejects.toThrow(
      /不同内容/,
    );
    await expect(adjust(lots[1].id, "250", "ADJUSTMENT", key)).rejects.toThrow(
      /不同内容/,
    );
  });
  it("rejects request ids reused across purchase and adjustment", async () => {
    const key = randomUUID();
    await buy(payload(), key);
    await expect(
      adjust((await lot()).id, "200", "ADJUSTMENT", key),
    ).rejects.toThrow(/不同内容/);
    const second = randomUUID();
    await adjust((await lot()).id, "250", "ADJUSTMENT", second);
    await expect(buy(payload(), second)).rejects.toThrow(/不同操作/);
  });
  it("rejects adjustments to another household lot", async () => {
    await buy(payload(), randomUUID(), C);
    await expect(adjust((await lot()).id, "100")).rejects.toThrow(/不属于/);
  });
  it("cannot edit or remove ledger entries even through accidental privileged DML", async () => {
    await buy();
    await expect(
      db.exec("update public.stock_movements set note='changed'"),
    ).rejects.toThrow(/不可修改/);
    await expect(db.exec("delete from public.stock_movements")).rejects.toThrow(
      /不可修改/,
    );
  });
  it("rejects expired-before-purchase dates and unsupported units", async () => {
    await expect(
      buy(payload([item({ expires_on: "2026-10-25" })])),
    ).rejects.toThrow(/早于/);
    await expect(buy(payload([item({ unit: "kg" })]))).rejects.toThrow(
      /基础单位/,
    );
    expect((await counts()).purchases).toBe(0);
  });
  it("rejects users whose membership was removed", async () => {
    const id = (
      await user<{ id: string }>(
        A,
        "select id from public.household_members where user_id=$1",
        [B],
      )
    )[0].id;
    await user(A, "select public.remove_household_member($1)", [id]);
    await expect(buy(payload(), randomUUID(), B)).rejects.toThrow(/加入家庭/);
  });
  it("returns one coherent inventory snapshot scoped to the caller household", async () => {
    await buy();
    const shared = (
      await user<{
        snapshot: {
          household_id: string;
          ingredients: unknown[];
          lots: unknown[];
        };
      }>(B, "select public.read_inventory() as snapshot")
    )[0].snapshot;
    expect(shared.household_id).toBe(house);
    expect(shared.ingredients).toHaveLength(1);
    expect(shared.lots).toHaveLength(1);
    const other = (
      await user<{ snapshot: { ingredients: unknown[]; lots: unknown[] } }>(
        C,
        "select public.read_inventory() as snapshot",
      )
    )[0].snapshot;
    expect(other.ingredients).toHaveLength(0);
    expect(other.lots).toHaveLength(0);
  });
  it("rejects non-date expiry values rather than storing infinity", async () => {
    await expect(
      buy(payload([item({ expires_on: "infinity" })])),
    ).rejects.toThrow(/日期无效/);
  });
  it("rejects stale adjustments rather than overwriting another member", async () => {
    await buy();
    const batch = await lot();
    const stale = randomUUID();
    expectedByKey.set(stale, "300.000");
    await adjust(batch.id, "250");
    await expect(
      adjust(batch.id, "200", "ADJUSTMENT", stale, B),
    ).rejects.toThrow(/另一位成员/);
    expect((await lot()).current_quantity).toBe("250.000");
  });
  it("imports parsed IDs and scaled quantities through the existing atomic purchase function", async () => {
    await buy();
    const ingredients = (
      await db.query<Ingredient>(
        "select id,name,name_en,category,base_unit from public.ingredients",
      )
    ).rows;
    const parsed = parsePurchaseText(
      "牛肉 | 0.68 | kg | 11.49\n鸡蛋 | 12 | 个 | 4.99",
      ingredients,
    );
    expect(parsed.issues).toEqual([]);
    const data = payload(parsed.rows.map((row) => row.item));
    const key = randomUUID();
    const id = await buy(data, key);
    expect(await buy(data, key, B)).toBe(id);
    expect((await counts()).ingredients).toBe(2);
    expect((await counts()).purchases).toBe(2);
    const beef = (
      await db.query<{ total: string }>(
        "select sum(current_quantity) as total from public.stock_lots where ingredient_id=(select id from public.ingredients where name='牛肉')",
      )
    ).rows[0];
    expect(beef.total).toBe("980.000");
    expect(
      (
        await db.query<{ total_cost: string }>(
          "select total_cost from public.purchase_items where purchase_id=$1 and line_number=1",
          [id],
        )
      ).rows[0].total_cost,
    ).toBe("11.49");
  });
});
