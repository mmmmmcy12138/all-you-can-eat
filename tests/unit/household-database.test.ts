import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003",
  D = "00000000-0000-4000-8000-000000000004";
let db: PGlite;
async function asUser<T>(id: string, sql: string, params: unknown[] = []) {
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
async function create(id = A, name = "我们的厨房") {
  const rows = await asUser<{ id: string }>(
    id,
    "select public.create_household($1) as id",
    [name],
  );
  return rows[0].id;
}
async function invite(id = A) {
  return (
    await asUser<{ token: string }>(
      id,
      "select public.create_household_invitation() as token",
    )
  )[0].token;
}
async function join(token: string, id = B) {
  return asUser(id, "select public.accept_household_invitation($1)", [token]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/202610260001_households.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("truncate auth.users cascade");
  for (const [id, name] of [
    [A, "Owner"],
    [B, "伴侣"],
    [C, "外人"],
    [D, "另一人"],
  ])
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [id, JSON.stringify({ display_name: name })],
    );
});
describe("household PostgreSQL migration and RLS", () => {
  it("creates profiles from auth user trigger", async () => {
    expect(
      await asUser<{ display_name: string }>(
        A,
        "select display_name from public.profiles",
      ),
    ).toEqual([{ display_name: "Owner" }]);
  });
  it("joins two independent accounts into one household", async () => {
    const hid = await create();
    await join(await invite());
    const members = await asUser<{ user_id: string }>(
      B,
      "select user_id from public.household_members",
    );
    expect(members).toHaveLength(2);
    expect(
      (await asUser<{ id: string }>(B, "select id from public.households"))[0]
        .id,
    ).toBe(hid);
    expect(await asUser(B, "select * from public.profiles")).toHaveLength(2);
  });
  it("hides household, members, profiles and invitations from outsiders", async () => {
    await create();
    await invite();
    for (const table of ["households", "household_members"])
      expect(await asUser(C, `select * from public.${table}`)).toHaveLength(0);
    expect(
      await asUser(C, "select id from public.household_invitations"),
    ).toHaveLength(0);
    expect(await asUser(C, "select id from public.profiles")).toHaveLength(1);
  });
  it("does not expose raw invitation token or hashes to authenticated users", async () => {
    await create();
    const token = await invite();
    const row = (
      await db.query<{ token_hash: string }>(
        "select token_hash from public.household_invitations",
      )
    ).rows[0];
    expect(row.token_hash).toHaveLength(64);
    expect(row.token_hash).not.toBe(token);
    await expect(
      asUser(A, "select token_hash from public.household_invitations"),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies anonymous reads and RPC calls", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.households")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.query("select public.create_household('bad')"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
  it("prevents direct insertion with forged household references", async () => {
    const hid = await create();
    await expect(
      asUser(
        C,
        "insert into public.household_members(household_id,user_id,role) values($1,$2,'owner')",
        [hid, C],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("prevents role escalation and direct household edits", async () => {
    await create();
    await join(await invite());
    await expect(
      asUser(
        B,
        "update public.household_members set role='owner' where user_id=$1",
        [B],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(B, "update public.households set name='hacked'"),
    ).rejects.toThrow(/permission denied/);
  });
  it("prevents member and outsider from owner management RPCs", async () => {
    await create();
    await join(await invite());
    for (const id of [B, C]) {
      await expect(invite(id)).rejects.toThrow(/Owner/);
      await expect(
        asUser(id, "select public.rename_household('hacked')"),
      ).rejects.toThrow(/Owner/);
    }
  });
  it("keeps profile edits scoped to the logged-in user", async () => {
    await create();
    await join(await invite());
    expect(
      await asUser(
        B,
        "update public.profiles set display_name='hacked' where id=$1 returning id",
        [A],
      ),
    ).toHaveLength(0);
    expect(
      await asUser(
        B,
        "update public.profiles set display_name='新名字' where id=$1 returning id",
        [B],
      ),
    ).toHaveLength(1);
  });
  it("rejects expired invitations", async () => {
    await create();
    const token = await invite();
    await db.exec(
      "update public.household_invitations set created_at=now()-interval '3 days',expires_at=now()-interval '1 day'",
    );
    await expect(join(token)).rejects.toThrow(/失效/);
  });
  it("only allows a token to be used once", async () => {
    await create();
    const token = await invite();
    await join(token);
    await expect(join(token, C)).rejects.toThrow(/失效/);
  });
  it("invalidates old invites when a new one is issued", async () => {
    await create();
    const old = await invite();
    const fresh = await invite();
    await expect(join(old)).rejects.toThrow(/失效/);
    await join(fresh);
  });
  it("lets owner revoke an outstanding invitation", async () => {
    await create();
    const token = await invite();
    const id = (
      await asUser<{ id: string }>(
        A,
        "select id from public.household_invitations",
      )
    )[0].id;
    await asUser(A, "select public.revoke_household_invitation($1)", [id]);
    await expect(join(token)).rejects.toThrow(/失效/);
  });
  it("limits V1 to two members", async () => {
    await create();
    await join(await invite());
    await expect(invite()).rejects.toThrow(/最多两名/);
    expect(
      await asUser(A, "select * from public.household_members"),
    ).toHaveLength(2);
  });
  it("limits each user to one household", async () => {
    await create();
    await expect(create(A)).rejects.toThrow(/已经加入/);
    await create(B, "另一个家");
    await expect(join(await invite(), B)).rejects.toThrow(/已经加入/);
  });
  it("rejects invalid tokens without leaking household data", async () => {
    await create();
    await expect(join("x")).rejects.toThrow(/失效/);
    await expect(join("a".repeat(72))).rejects.toThrow(/失效/);
  });
  it("rolls back invalid create without leaving partial household", async () => {
    await expect(create(A, " ")).rejects.toThrow(/名称/);
    expect(
      (await db.query("select * from public.households")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.household_members")).rows,
    ).toHaveLength(0);
  });
  it("prevents removing another household member by forged id", async () => {
    await create();
    await join(await invite());
    const foreignId = (
      await asUser<{ id: string }>(
        B,
        "select id from public.household_members where user_id=$1",
        [B],
      )
    )[0].id;
    await create(C);
    await asUser(C, "select public.remove_household_member($1)", [foreignId]);
    expect(
      await asUser(B, "select * from public.household_members"),
    ).toHaveLength(2);
  });
  it("removes a member and immediately revokes their read access", async () => {
    await create();
    await join(await invite());
    const id = (
      await asUser<{ id: string }>(
        A,
        "select id from public.household_members where user_id=$1",
        [B],
      )
    )[0].id;
    await asUser(A, "select public.remove_household_member($1)", [id]);
    expect(await asUser(B, "select * from public.households")).toHaveLength(0);
    expect(
      await asUser(B, "select * from public.household_members"),
    ).toHaveLength(0);
  });
  it("cannot remove the owner through the member-removal RPC", async () => {
    await create();
    const id = (
      await asUser<{ id: string }>(A, "select id from public.household_members")
    )[0].id;
    await asUser(A, "select public.remove_household_member($1)", [id]);
    expect(
      await asUser(A, "select * from public.household_members"),
    ).toHaveLength(1);
  });
});
