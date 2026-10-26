import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: true,
  user: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../lib/supabase/config", () => ({
  supabaseConfig: () =>
    mocks.configured ? { url: "https://example.test", key: "public" } : null,
}));
vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: mocks.user },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
import { kitchenContext } from "../../lib/kitchen/context";
import { readInventory } from "../../lib/inventory/read";
function query(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
});
describe("real household-aware page states", () => {
  it("distinguishes missing configuration from signed-out state", async () => {
    mocks.configured = false;
    expect((await kitchenContext()).status).toBe("unconfigured");
    mocks.configured = true;
    mocks.user.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    expect((await kitchenContext()).status).toBe("signed-out");
  });
  it("distinguishes an authenticated user with no household", async () => {
    mocks.from.mockImplementation((table: string) =>
      query(
        table === "profiles"
          ? { data: { display_name: "小厨师" }, error: null }
          : { data: null, error: null },
      ),
    );
    expect((await kitchenContext()).status).toBe("no-household");
  });
  it("never interprets read errors as an absent household", async () => {
    mocks.from.mockReturnValue(
      query({ data: null, error: { message: "network" } }),
    );
    expect((await kitchenContext()).status).toBe("error");
  });
  it("uses the database household name, nickname and member count", async () => {
    mocks.from.mockImplementation((table: string) =>
      query(
        (
          {
            profiles: { data: { display_name: "真实昵称" }, error: null },
            household_members: {
              data: { household_id: "house" },
              count: 2,
              error: null,
            },
            households: { data: { name: "真实家庭" }, error: null },
          } as Record<string, unknown>
        )[table],
      ),
    );
    expect(await kitchenContext()).toMatchObject({
      status: "ready",
      householdName: "真实家庭",
      displayName: "真实昵称",
      members: 2,
    });
  });
  it("does not expose zero inventory when a migration or read fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect((await readInventory("house")).ok).toBe(false);
  });
  it("rejects snapshots for a changed or removed household membership", async () => {
    mocks.rpc.mockResolvedValue({
      data: { household_id: "other-house", ingredients: [], lots: [] },
      error: null,
    });
    expect((await readInventory("house")).ok).toBe(false);
  });
  it("uses a single database snapshot and preserves genuine empty data", async () => {
    mocks.rpc.mockResolvedValue({
      data: { household_id: "house", ingredients: [], lots: [] },
      error: null,
    });
    expect(await readInventory("house")).toEqual({
      ok: true,
      ingredients: [],
      lots: [],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("read_inventory");
  });
});
