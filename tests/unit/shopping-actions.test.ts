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
import { manageShopping } from "../../app/shopping/list/actions";
const key = "00000000-0000-4000-8000-000000000001";
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [k, v] of Object.entries({
    request_id: key,
    operation: "add",
    ingredient_id: "",
    name: "鸡蛋",
    category: "蛋奶",
    unit: "个",
    quantity: "12",
    ...overrides,
  }))
    data.set(k, v);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "caller" } } });
  mocks.rpc.mockResolvedValue({ data: "list-id", error: null });
});
describe("shopping actions use authenticated RPCs", () => {
  it("does not accept caller-supplied household or role", async () => {
    expect(
      (
        await manageShopping(
          {},
          form({ household_id: "forged", role: "owner" }),
        )
      ).resultId,
    ).toBe("list-id");
    expect(mocks.rpc).toHaveBeenCalledWith("add_shopping_item", {
      request_id: key,
      item_payload: {
        ingredient_id: "",
        name: "鸡蛋",
        category: "蛋奶",
        unit: "个",
        quantity: "12",
      },
    });
  });
  it("rejects missing auth or invalid quantities before a mutation", async () => {
    expect(
      (await manageShopping({}, form({ quantity: "-1" }))).error,
    ).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await manageShopping({}, form())).error).toContain("登录");
  });
  it("does not report success when RPC fails", async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: "P0001", message: "清单已变化" },
    });
    expect((await manageShopping({}, form())).error).toBe("清单已变化");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
