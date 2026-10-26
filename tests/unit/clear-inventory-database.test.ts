import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
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
async function buy(actor = A, quantity = "12") {
  const payload = {
    purchased_on: "2026-10-26",
    store_name: "H Mart",
    note: "",
    items: [
      {
        ingredient_id: "",
        name: "鸡蛋",
        category: "蛋奶",
        unit: "个",
        quantity,
        total_cost: "4.99",
        expires_on: "",
        storage_location: "冷藏",
      },
    ],
  };
  await user(actor, "select public.record_purchase($1,$2::jsonb)", [
    randomUUID(),
    JSON.stringify(payload),
  ]);
}
async function snapshot(actor = A) {
  return (
    await user<{
      value: { clear_fingerprint: string; positive_lot_count: number };
    }>(actor, "select public.read_inventory() as value")
  )[0].value;
}
async function clear(
  fingerprint: string,
  key = randomUUID(),
  actor = A,
  reason = "盘点归零",
  confirmation = "清空库存",
) {
  return (
    await user<{ value: { id: string; cleared_lots: number } }>(
      actor,
      "select public.clear_inventory($1,$2,$3,$4) as value",
      [key, fingerprint, reason, confirmation],
    )
  )[0].value;
}
async function counts() {
  const result: Record<string, number> = {};
  for (const table of [
    "ingredients",
    "purchases",
    "purchase_items",
    "stock_lots",
    "stock_movements",
  ])
    result[table] = Number(
      (
        await db.query<{ n: string }>(
          `select count(*) as n from public.${table}`,
        )
      ).rows[0].n,
    );
  return result;
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
    "202610260004_clear_inventory.sql",
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
  await user(A, "select public.create_household('我们的家')");
  const token = (
    await user<{ token: string }>(
      A,
      "select public.create_household_invitation() as token",
    )
  )[0].token;
  await user(B, "select public.accept_household_invitation($1)", [token]);
  await user(C, "select public.create_household('别人家')");
});
describe("clear inventory safely and atomically", () => {
  it("clears all current lots but preserves ingredients, purchases, batches and old movements", async () => {
    await buy();
    await buy(A, "6");
    const before = await counts();
    const snap = await snapshot();
    expect(snap.positive_lot_count).toBe(2);
    expect((await clear(snap.clear_fingerprint)).cleared_lots).toBe(2);
    const after = await counts();
    expect(after).toEqual({
      ...before,
      stock_movements: before.stock_movements + 2,
    });
    expect((await snapshot()).positive_lot_count).toBe(0);
    expect(
      (
        await db.query(
          "select quantity_delta,quantity_after,kind,source from public.stock_movements where source='clear-inventory' order by quantity_delta",
        )
      ).rows,
    ).toEqual([
      {
        quantity_delta: "-12.000",
        quantity_after: "0.000",
        kind: "ADJUSTMENT",
        source: "clear-inventory",
      },
      {
        quantity_delta: "-6.000",
        quantity_after: "0.000",
        kind: "ADJUSTMENT",
        source: "clear-inventory",
      },
    ]);
  });
  it("lets another household member clear and records their real identity and reason", async () => {
    await buy();
    await clear(
      (await snapshot(B)).clear_fingerprint,
      randomUUID(),
      B,
      "盘点校正",
    );
    expect(
      (
        await db.query(
          "select actor_id,note from public.stock_movements where source='clear-inventory'",
        )
      ).rows[0],
    ).toEqual({ actor_id: B, note: "盘点校正" });
  });
  it("does not affect other households", async () => {
    await buy();
    await buy(C, "99");
    await clear((await snapshot()).clear_fingerprint);
    expect((await snapshot(C)).positive_lot_count).toBe(1);
    expect(
      (
        await user<{ quantity: string }>(
          C,
          "select current_quantity::text as quantity from public.stock_lots",
        )
      )[0].quantity,
    ).toBe("99.000");
  });
  it("rejects a stale snapshot after new stock arrives without partially clearing anything", async () => {
    await buy();
    const stale = await snapshot();
    await buy(A, "6");
    await expect(clear(stale.clear_fingerprint)).rejects.toThrow(/库存已变化/);
    expect((await snapshot()).positive_lot_count).toBe(2);
    expect(
      (
        await db.query(
          "select id from public.stock_movements where source='clear-inventory'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects stale confirmation after a batch is adjusted", async () => {
    await buy();
    const stale = await snapshot();
    const lot = (
      await db.query<{ id: string }>("select id from public.stock_lots")
    ).rows[0].id;
    await user(B, "select public.adjust_stock($1,$2,$3,$4,$5,$6)", [
      randomUUID(),
      lot,
      "10",
      "12",
      "ADJUSTMENT",
      "盘点",
    ]);
    await expect(clear(stale.clear_fingerprint)).rejects.toThrow(/库存已变化/);
    expect((await snapshot()).positive_lot_count).toBe(1);
  });
  it("retries the original request without clearing stock that arrived afterwards", async () => {
    await buy();
    const snap = await snapshot(),
      key = randomUUID();
    const result = await clear(snap.clear_fingerprint, key);
    await buy(A, "3");
    expect(await clear(snap.clear_fingerprint, key, B)).toEqual(result);
    expect((await snapshot()).positive_lot_count).toBe(1);
    expect(
      (
        await db.query(
          "select sum(current_quantity)::text as total from public.stock_lots",
        )
      ).rows[0],
    ).toEqual({ total: "3.000" });
  });
  it("rejects changed content under the same request key", async () => {
    await buy();
    const snap = await snapshot(),
      key = randomUUID();
    await clear(snap.clear_fingerprint, key);
    await expect(
      clear(snap.clear_fingerprint, key, A, "另一种原因"),
    ).rejects.toThrow(/不同内容/);
  });
  it("requires exact typed confirmation and a reason", async () => {
    await buy();
    const snap = await snapshot();
    await expect(
      clear(snap.clear_fingerprint, randomUUID(), A, "", "清空库存"),
    ).rejects.toThrow(/原因/);
    await expect(
      clear(snap.clear_fingerprint, randomUUID(), A, "原因", "yes"),
    ).rejects.toThrow(/确认/);
    expect((await snapshot()).positive_lot_count).toBe(1);
  });
  it("rejects another households fingerprint", async () => {
    await buy();
    await buy(C, "99");
    await expect(clear((await snapshot(C)).clear_fingerprint)).rejects.toThrow(
      /库存已变化/,
    );
    expect((await snapshot()).positive_lot_count).toBe(1);
  });
  it("does not create zero-delta movements for an already-empty fridge", async () => {
    const snap = await snapshot();
    expect((await clear(snap.clear_fingerprint)).cleared_lots).toBe(0);
    expect((await counts()).stock_movements).toBe(0);
  });
  it("rolls back batch updates AND movements if final request logging fails", async () => {
    await buy();
    await db.exec(
      "create function public.test_clear_fail() returns trigger language plpgsql as $$begin raise exception 'injected log failure';end$$;create trigger test_clear_failure before insert on public.inventory_clear_requests for each row execute function public.test_clear_fail();",
    );
    try {
      await expect(clear((await snapshot()).clear_fingerprint)).rejects.toThrow(
        /injected/,
      );
      expect((await snapshot()).positive_lot_count).toBe(1);
      expect((await counts()).stock_movements).toBe(1);
    } finally {
      await db.exec(
        "drop trigger test_clear_failure on public.inventory_clear_requests;drop function public.test_clear_fail();",
      );
    }
  });
  it("denies anonymous calls and direct reads of private clear request logs", async () => {
    await expect(
      user(B, "select * from public.inventory_clear_requests"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select public.clear_inventory($1,$2,$3,$4)", [
          randomUUID(),
          "a".repeat(64),
          "原因",
          "清空库存",
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
