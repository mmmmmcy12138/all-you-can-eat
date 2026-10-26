// Isolated real PostgreSQL concurrency checks. Never connects to a user database.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const name = `ayce-test-${randomUUID()}`;
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const prefix = ["--host=unix:///var/run/docker.sock"];
const docker = (args, input) =>
  execFileSync("docker", [...prefix, ...args], {
    env,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const psqlArgs = [
  "exec",
  "-i",
  name,
  "psql",
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "postgres",
];
const sql = (text) => docker(psqlArgs, text);
function asyncSQL(text) {
  return new Promise((resolve, reject) => {
    const process = spawn("docker", [...prefix, ...psqlArgs], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      error = "";
    process.stdout.on("data", (value) => (out += value));
    process.stderr.on("data", (value) => (error += value));
    process.on("error", reject);
    process.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(error.trim())),
    );
    process.stdin.end(text);
  });
}
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
const asUser = (id, query) =>
  `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);${query};commit;`;
const payload = {
  purchased_on: "2026-10-26",
  store_name: "Test store",
  note: "test fixture",
  items: [
    {
      name: "测试牛肉",
      ingredient_id: "",
      category: "肉类",
      quantity: "300",
      unit: "g",
      total_cost: "8.99",
      expires_on: "",
      storage_location: "冷藏",
    },
  ],
};
const purchase = (key, data = payload) =>
  `select public.record_purchase('${key}','${JSON.stringify(data)}'::jsonb)`;
const lastUUID = (output) =>
  output
    .split("\n")
    .filter((line) => /^[a-f0-9-]{36}$/.test(line))
    .at(-1);
let started = false;
try {
  docker(["info", "--format", "{{.ServerVersion}}"]);
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "none",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=256m",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(ready, "PostgreSQL startup timed out");
  sql(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const file of [
    "202610260001_households.sql",
    "202610260002_inventory.sql",
    "202610260003_shopping_list.sql",
  ])
    sql(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  sql(`insert into auth.users(id) values('${A}'),('${B}');`);
  sql(asUser(A, "select public.create_household('Concurrency fixture')"));
  const token = sql(asUser(A, "select public.create_household_invitation()"))
    .split("\n")
    .at(-1);
  sql(asUser(B, `select public.accept_household_invitation('${token}')`));
  const key = randomUUID();
  const duplicates = await Promise.all([
    asyncSQL(asUser(A, purchase(key) + ";select pg_sleep(0.3)")),
    asyncSQL(asUser(B, purchase(key))),
  ]);
  assert.equal(lastUUID(duplicates[0]), lastUUID(duplicates[1]));
  assert.equal(sql("select count(*) from public.purchases"), "1");
  assert.equal(sql("select count(*) from public.stock_movements"), "1");
  console.log(
    "PASS concurrent same-key purchases create one purchase and one audit row",
  );
  const collision = randomUUID();
  const conflicting = await Promise.allSettled([
    asyncSQL(asUser(A, purchase(collision) + ";select pg_sleep(0.3)")),
    asyncSQL(
      asUser(
        B,
        purchase(collision, {
          ...payload,
          items: [{ ...payload.items[0], quantity: "500" }],
        }),
      ),
    ),
  ]);
  assert.equal(conflicting.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(conflicting.filter((r) => r.status === "rejected").length, 1);
  assert.equal(sql("select count(*) from public.purchases"), "2");
  console.log(
    "PASS concurrent same-key different payload rejects one whole request",
  );
  const lot = sql(
    `select id from public.stock_lots where purchase_item_id in (select id from public.purchase_items where purchase_id=(select id from public.purchases where request_key='${key}'))`,
  );
  const adjust = (request, target) =>
    `select public.adjust_stock('${request}','${lot}','${target}','300','WASTE','concurrency fixture')`;
  const adjustments = await Promise.allSettled([
    asyncSQL(asUser(A, adjust(randomUUID(), "200") + ";select pg_sleep(0.3)")),
    asyncSQL(asUser(B, adjust(randomUUID(), "250"))),
  ]);
  assert.equal(adjustments.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(adjustments.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    sql(
      `select count(*) from public.stock_movements where stock_lot_id='${lot}' and kind='WASTE'`,
    ),
    "1",
  );
  assert.equal(
    sql("select count(*) from public.stock_lots where current_quantity<0"),
    "0",
  );
  console.log(
    "PASS concurrent stale adjustments reject one writer; no negative balances or duplicate waste",
  );
  const before = sql("select count(*) from public.purchases");
  const invalid = {
    ...payload,
    items: [payload.items[0], { ...payload.items[0], quantity: "-1" }],
  };
  await assert.rejects(asyncSQL(asUser(A, purchase(randomUUID(), invalid))));
  assert.equal(sql("select count(*) from public.purchases"), before);
  console.log(
    "PASS real PostgreSQL rolls back the entire invalid multi-line purchase",
  );
  const shoppingPayload = (quantity) =>
    JSON.stringify({
      ingredient_id: "",
      name: "测试鸡蛋",
      category: "蛋奶",
      unit: "个",
      quantity,
    });
  const addList = (request, quantity) =>
    `select public.add_shopping_item('${request}','${shoppingPayload(quantity)}'::jsonb)`;
  const merges = await Promise.all([
    asyncSQL(asUser(A, addList(randomUUID(), "12") + ";select pg_sleep(0.3)")),
    asyncSQL(asUser(B, addList(randomUUID(), "24"))),
  ]);
  assert.equal(lastUUID(merges[0]), lastUUID(merges[1]));
  const sid = lastUUID(merges[0]);
  assert.equal(
    sql(`select quantity from public.shopping_items where id='${sid}'`),
    "24.000",
  );
  console.log(
    "PASS concurrent shopping additions merge to max demand, not duplicate purchases",
  );
  const listVersion = sql(
    `select version from public.shopping_items where id='${sid}'`,
  );
  const listPayload = {
    ...payload,
    items: [
      {
        ...payload.items[0],
        name: "测试鸡蛋",
        category: "蛋奶",
        unit: "个",
        quantity: "24",
      },
    ],
  };
  const buyList = (request, data = listPayload) =>
    `select public.record_purchase_from_list('${request}','${JSON.stringify(data)}'::jsonb,'${JSON.stringify([{ item_id: sid, version: Number(listVersion), line_number: 1 }])}'::jsonb)`;
  const purchasesBefore = Number(sql("select count(*) from public.purchases"));
  const completions = await Promise.allSettled([
    asyncSQL(asUser(A, buyList(randomUUID()) + ";select pg_sleep(0.3)")),
    asyncSQL(asUser(B, buyList(randomUUID()))),
  ]);
  assert.equal(completions.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(completions.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    Number(sql("select count(*) from public.purchases")),
    purchasesBefore + 1,
  );
  assert.equal(
    sql(`select stocked_quantity from public.shopping_items where id='${sid}'`),
    "24.000",
  );
  console.log(
    "PASS concurrent completion with different request IDs stocks one shopping demand once",
  );
  const nextSid = lastUUID(sql(asUser(A, addList(randomUUID(), "12"))));
  const changeList = (request, action, quantity) =>
    `select public.change_shopping_item('${request}','${nextSid}',1,'${action}',${quantity === null ? "null" : "'" + quantity + "'"})`;
  const changes = await Promise.allSettled([
    asyncSQL(
      asUser(
        A,
        changeList(randomUUID(), "purchased", null) + ";select pg_sleep(0.3)",
      ),
    ),
    asyncSQL(asUser(B, changeList(randomUUID(), "quantity", "20"))),
  ]);
  assert.equal(changes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(changes.filter((r) => r.status === "rejected").length, 1);
  console.log(
    "PASS concurrent shopping edits reject stale version rather than overwrite",
  );
  const wrongBefore = sql("select count(*) from public.purchases");
  const nextVersion = sql(
    `select version from public.shopping_items where id='${nextSid}'`,
  );
  await assert.rejects(
    asyncSQL(
      asUser(
        A,
        `select public.record_purchase_from_list('${randomUUID()}','${JSON.stringify({ ...listPayload, items: [{ ...listPayload.items[0], name: "错误食材" }] })}'::jsonb,'${JSON.stringify([{ item_id: nextSid, version: Number(nextVersion), line_number: 1 }])}'::jsonb)`,
      ),
    ),
  );
  assert.equal(sql("select count(*) from public.purchases"), wrongBefore);
  assert.equal(
    sql(
      `select stocked_quantity from public.shopping_items where id='${nextSid}'`,
    ),
    "0.000",
  );
  console.log(
    "PASS linked-food validation failure rolls back stock and shopping fulfillment together",
  );
  console.log(
    "8 real PostgreSQL integration checks passed; fixture container will be removed.",
  );
} finally {
  if (started) docker(["rm", "-f", name]);
}
