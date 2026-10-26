import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
let house: string;
async function user<T = Record<string, unknown>>(
  actor: string,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec("begin;set local role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      actor,
    ]);
    const result = await db.query<T>(sql, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
const entry = (overrides: Record<string, unknown> = {}) => ({
  ingredient_id: "",
  name: "鸡蛋",
  category: "蛋奶",
  unit: "个",
  quantity: "12",
  ...overrides,
});
async function add(data = entry(), key = randomUUID(), actor = A) {
  return (
    await user<{ id: string }>(
      actor,
      "select public.add_shopping_item($1,$2::jsonb) as id",
      [key, JSON.stringify(data)],
    )
  )[0].id;
}
async function row(id: string) {
  return (
    await db.query<{
      id: string;
      quantity: string;
      stocked_quantity: string;
      status: string;
      version: number;
      ingredient_id: string | null;
    }>(
      "select id,quantity,stocked_quantity,status,version,ingredient_id from public.shopping_items where id=$1",
      [id],
    )
  ).rows[0];
}
async function change(
  id: string,
  version: number,
  action: string,
  quantity: string | null = null,
  key = randomUUID(),
  actor = A,
) {
  return user(actor, "select public.change_shopping_item($1,$2,$3,$4,$5)", [
    key,
    id,
    version,
    action,
    quantity,
  ]);
}
const payload = (quantity = "12", name = "鸡蛋", unit = "个") => ({
  purchased_on: "2026-10-26",
  store_name: "H Mart",
  note: "",
  items: [
    {
      ingredient_id: "",
      name,
      category: "蛋奶",
      unit,
      quantity,
      total_cost: "4.99",
      expires_on: "",
      storage_location: "冷藏",
    },
  ],
});
async function purchase(
  id: string,
  version: number,
  data = payload(),
  key = randomUUID(),
  actor = A,
  links: unknown[] | null = null,
) {
  return (
    await user<{ id: string }>(
      actor,
      "select public.record_purchase_from_list($1,$2::jsonb,$3::jsonb) as id",
      [
        key,
        JSON.stringify(data),
        JSON.stringify(links ?? [{ item_id: id, version, line_number: 1 }]),
      ],
    )
  )[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const file of [
    "202610260001_households.sql",
    "202610260002_inventory.sql",
    "202610260003_shopping_list.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("truncate auth.users cascade");
  for (const id of [A, B, C])
    await db.query("insert into auth.users(id) values($1)", [id]);
  house = (
    await user<{ id: string }>(
      A,
      "select public.create_household('我们的家') as id",
    )
  )[0].id;
  const token = (
    await user<{ token: string }>(
      A,
      "select public.create_household_invitation() as token",
    )
  )[0].token;
  await user(B, "select public.accept_household_invitation($1)", [token]);
  await user(C, "select public.create_household('别人家')");
});
describe("shared shopping list and atomic purchase completion", () => {
  it("shares pending items between members without changing stock", async () => {
    await add();
    expect(await user(B, "select id from public.shopping_items")).toHaveLength(
      1,
    );
    expect(
      (await db.query("select id from public.stock_lots")).rows,
    ).toHaveLength(0);
  });
  it("merges duplicate needs using max remaining demand instead of addition", async () => {
    const id = await add();
    expect(await add(entry({ quantity: "6" }), randomUUID(), B)).toBe(id);
    expect((await row(id)).quantity).toBe("12.000");
    await add(entry({ quantity: "18" }));
    expect((await row(id)).quantity).toBe("18.000");
  });
  it("deduplicates add requests and rejects same-key changed contents", async () => {
    const key = randomUUID(),
      id = await add(entry(), key);
    await add(entry({ quantity: "24" }));
    expect(await add(entry(), key, B)).toBe(id);
    expect((await row(id)).quantity).toBe("24.000");
    await expect(add(entry({ quantity: "6" }), key)).rejects.toThrow(
      /不同内容/,
    );
  });
  it("marking purchased does not create stock or purchase records", async () => {
    const id = await add();
    await change(id, 1, "purchased");
    expect((await row(id)).status).toBe("purchased");
    expect(
      (await db.query("select id from public.purchases")).rows,
    ).toHaveLength(0);
  });
  it("updates desired remaining quantity with version protection", async () => {
    const id = await add();
    await change(id, 1, "quantity", "6");
    expect((await row(id)).quantity).toBe("6.000");
    await expect(
      change(id, 1, "quantity", "99", randomUUID(), B),
    ).rejects.toThrow(/另一位成员/);
  });
  it("deduplicates status changes after later edits", async () => {
    const id = await add();
    const key = randomUUID();
    await change(id, 1, "purchased", null, key);
    await change(id, 2, "open");
    await change(id, 1, "purchased", null, key, B);
    expect((await row(id)).status).toBe("open");
    expect((await row(id)).version).toBe(3);
  });
  it("atomically records purchases, stock, movements and completed demand", async () => {
    const id = await add();
    await purchase(id, 1);
    expect(await row(id)).toMatchObject({
      status: "stocked",
      stocked_quantity: "12.000",
    });
    expect(
      (await db.query("select id from public.purchases")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select id from public.stock_movements")).rows,
    ).toHaveLength(1);
    expect((await row(id)).ingredient_id).toBeTruthy();
  });
  it("keeps partial demand and completes only when remaining stock arrives", async () => {
    const id = await add();
    await purchase(id, 1, payload("5"));
    expect(await row(id)).toMatchObject({
      status: "open",
      stocked_quantity: "5.000",
      quantity: "12.000",
    });
    await purchase(id, 2, payload("7"), randomUUID(), B);
    expect(await row(id)).toMatchObject({
      status: "stocked",
      stocked_quantity: "12.000",
    });
  });
  it("allows an actual purchase larger than remaining demand without negative pending values", async () => {
    const id = await add();
    await purchase(id, 1, payload("15"));
    expect(await row(id)).toMatchObject({
      status: "stocked",
      stocked_quantity: "15.000",
      quantity: "12.000",
    });
  });
  it("never duplicates stock or demand completion on a retry", async () => {
    const id = await add(),
      key = randomUUID();
    const pid = await purchase(id, 1, payload(), key);
    expect(await purchase(id, 1, payload(), key, B)).toBe(pid);
    expect((await row(id)).stocked_quantity).toBe("12.000");
    expect(
      (await db.query("select id from public.stock_lots")).rows,
    ).toHaveLength(1);
  });
  it("rejects a second request to fulfill an already completed list item", async () => {
    const id = await add();
    await purchase(id, 1);
    await expect(purchase(id, 1)).rejects.toThrow(/已变化/);
    expect(
      (await db.query("select id from public.purchases")).rows,
    ).toHaveLength(1);
  });
  it("rolls back the entire purchase when linked food is incorrect", async () => {
    const id = await add();
    await expect(purchase(id, 1, payload("12", "鸭蛋"))).rejects.toThrow(
      /不一致/,
    );
    expect(
      (await db.query("select id from public.purchases")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.ingredients")).rows,
    ).toHaveLength(0);
    expect((await row(id)).stocked_quantity).toBe("0.000");
  });
  it("rejects duplicate link IDs, duplicate line numbers and missing purchase lines", async () => {
    const id = await add();
    await expect(
      purchase(id, 1, payload(), randomUUID(), A, [
        { item_id: id, version: 1, line_number: 1 },
        { item_id: id, version: 1, line_number: 2 },
      ]),
    ).rejects.toThrow(/重复/);
    await expect(
      purchase(id, 1, payload(), randomUUID(), A, [
        { item_id: id, version: 1, line_number: 2 },
      ]),
    ).rejects.toThrow(/明细/);
    expect(
      (await db.query("select id from public.purchases")).rows,
    ).toHaveLength(0);
  });
  it("rejects links to another household and does not write partial inventory", async () => {
    const foreign = await add(entry(), randomUUID(), C);
    await expect(purchase(foreign, 1)).rejects.toThrow(/不属于/);
    expect(
      (await db.query("select id from public.purchases")).rows,
    ).toHaveLength(0);
  });
  it("rejects foreign ingredient IDs on additions", async () => {
    const sid = await add(entry(), randomUUID(), C);
    await purchase(sid, 1, payload(), randomUUID(), C);
    const foreign = (await row(sid)).ingredient_id;
    await expect(add(entry({ ingredient_id: foreign }))).rejects.toThrow(
      /不属于/,
    );
  });
  it("rejects same-name incompatible units rather than creating duplicate active entries", async () => {
    await add();
    await expect(add(entry({ unit: "g" }))).rejects.toThrow(/单位不一致/);
    expect(
      (await db.query("select id from public.shopping_items")).rows,
    ).toHaveLength(1);
  });
  it("cancels demand without deleting audit/history or changing stock", async () => {
    const id = await add();
    await change(id, 1, "cancel");
    expect((await row(id)).status).toBe("cancelled");
    expect(await add()).not.toBe(id);
  });
  it("safely re-adds after completion as a new demand", async () => {
    const id = await add();
    await purchase(id, 1);
    const next = await add();
    expect(next).not.toBe(id);
    expect((await row(next)).stocked_quantity).toBe("0.000");
  });
  it("merges against the remaining amount after partial fulfillment", async () => {
    const id = await add();
    await purchase(id, 1, payload("5"));
    await add(entry({ quantity: "10" }));
    expect(await row(id)).toMatchObject({
      quantity: "15.000",
      stocked_quantity: "5.000",
    });
  });
  it("isolates list reads, writes and snapshots across households", async () => {
    const id = await add();
    expect(await user(C, "select * from public.shopping_items")).toHaveLength(
      0,
    );
    await expect(
      change(id, 1, "cancel", null, randomUUID(), C),
    ).rejects.toThrow(/不属于/);
    const snapshot = (
      await user<{ snapshot: { active: unknown[] } }>(
        C,
        "select public.read_shopping_list() as snapshot",
      )
    )[0].snapshot;
    expect(snapshot.active).toHaveLength(0);
    await expect(
      user(B, "update public.shopping_items set status='stocked'"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      user(B, "select * from public.shopping_requests"),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies anonymous list access and mutations", async () => {
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select * from public.shopping_items"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select public.read_shopping_list()"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select public.add_shopping_item($1,$2)", [
          randomUUID(),
          JSON.stringify(entry()),
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
  it("requires positive valid quantity and preserves cross-household foreign keys", async () => {
    for (const quantity of ["0", "-1", "1.0001"])
      await expect(add(entry({ quantity }))).rejects.toThrow();
    const foreign = await add(entry(), randomUUID(), C);
    await purchase(foreign, 1, payload(), randomUUID(), C);
    const foreignIngredient = (await row(foreign)).ingredient_id;
    await expect(
      db.query(
        "insert into public.shopping_items(household_id,ingredient_id,name,category,unit,quantity,created_by,updated_by) values($1,$2,'x','其他','个',1,$3,$3)",
        [house, foreignIngredient, A],
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it("rejects a retry that changes linked metadata or amounts", async () => {
    const id = await add(),
      key = randomUUID();
    await purchase(id, 1, payload(), key);
    await expect(purchase(id, 2, payload(), key)).rejects.toThrow(/不同内容/);
    await expect(purchase(id, 1, payload("6"), key)).rejects.toThrow(
      /不同内容/,
    );
    expect((await row(id)).stocked_quantity).toBe("12.000");
  });
  it("keeps mixed manual and linked lines in one atomic purchase", async () => {
    const id = await add();
    const data = {
      ...payload(),
      items: [
        { ...payload().items[0], name: "牛奶", unit: "ml", quantity: "1000" },
        payload().items[0],
      ],
    };
    await purchase(id, 1, data, randomUUID(), A, [
      { item_id: id, version: 1, line_number: 2 },
    ]);
    expect(
      (await db.query("select id from public.stock_lots")).rows,
    ).toHaveLength(2);
    expect((await row(id)).status).toBe("stocked");
  });
  it("rolls back list fulfillment if any manual row is invalid", async () => {
    const id = await add();
    const data = {
      ...payload(),
      items: [payload().items[0], { ...payload().items[0], quantity: "-1" }],
    };
    await expect(purchase(id, 1, data)).rejects.toThrow();
    expect(
      (await db.query("select id from public.stock_movements")).rows,
    ).toHaveLength(0);
    expect((await row(id)).status).toBe("open");
  });
});
