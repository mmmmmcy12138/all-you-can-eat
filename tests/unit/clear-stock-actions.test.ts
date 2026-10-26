import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: mocks.user },
    rpc: mocks.rpc,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { clearInventory } from "../../app/shopping/actions";
const key = "00000000-0000-4000-8000-000000000001";
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [k, v] of Object.entries({
    request_id: key,
    expected_fingerprint: "a".repeat(64),
    clear_reason: "盘点清空",
    confirmation: "清空库存",
    ...overrides,
  }))
    data.set(k, v);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "caller" } } });
  mocks.rpc.mockResolvedValue({
    data: { id: "clear-result", cleared_lots: 2 },
    error: null,
  });
});
describe("clear inventory server action", () => {
  it("requires confirmation before calling the database", async () => {
    expect(
      (await clearInventory({}, form({ confirmation: "yes" }))).error,
    ).toContain("确认");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("derives auth from session and does not forward a fake household", async () => {
    const result = await clearInventory({}, form({ household_id: "foreign" }));
    expect(result.resultId).toBe("clear-result");
    expect(mocks.rpc).toHaveBeenCalledWith("clear_inventory", {
      request_id: key,
      expected_fingerprint: "a".repeat(64),
      clear_reason: "盘点清空",
      confirmation: "清空库存",
    });
  });
  it("rejects missing auth and surfaces stale snapshot errors without success", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await clearInventory({}, form())).error).toContain("登录");
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ data: { user: { id: "caller" } } });
    mocks.rpc.mockResolvedValue({
      error: { code: "P0001", message: "库存已变化" },
    });
    expect((await clearInventory({}, form())).error).toContain("库存已变化");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("never invents success after a transport failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("network"));
    const result = await clearInventory({}, form());
    expect(result.resultId).toBeUndefined();
    expect(result.error).toContain("尚未确认");
  });
});
