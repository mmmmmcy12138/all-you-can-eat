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
import { recordPurchase, adjustStock } from "../../app/shopping/actions";
const key = "00000000-0000-4000-8000-000000000001";
const payload = {
  purchased_on: "2026-10-26",
  store_name: "H Mart",
  note: "",
  items: [
    {
      ingredient_id: "",
      name: "牛肉",
      category: "肉类",
      quantity: "300",
      unit: "g",
      total_cost: "8.99",
      expires_on: "",
      storage_location: "冷藏",
    },
  ],
};
function form(p = payload, request = key) {
  const data = new FormData();
  data.set("payload", JSON.stringify(p));
  data.set("request_id", request);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "caller" } } });
  mocks.rpc.mockResolvedValue({ data: "purchase-id", error: null });
});
describe("inventory server actions", () => {
  it("passes an authenticated validated payload and request key to the atomic RPC", async () => {
    const result = await recordPurchase({}, form());
    expect(mocks.rpc).toHaveBeenCalledWith("record_purchase", {
      request_id: key,
      payload,
    });
    expect(result).toMatchObject({ resultId: "purchase-id", requestKey: key });
    expect(mocks.revalidate).toHaveBeenCalledWith("/fridge");
  });
  it("does not call the RPC for invalid lines and identifies the row", async () => {
    const invalid = {
      ...payload,
      items: [payload.items[0], { ...payload.items[0], quantity: "-1" }],
    };
    expect((await recordPurchase({}, form(invalid))).error).toContain(
      "第 2 行",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires an authenticated session before recording a purchase", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await recordPurchase({}, form())).error).toContain("登录");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not pretend success on an RPC or connection failure", async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: "P0001", message: "同一请求编号不能提交不同内容" },
    });
    expect((await recordPurchase({}, form())).error).toContain("不同内容");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    mocks.rpc.mockRejectedValue(new Error("network"));
    expect((await recordPurchase({}, form())).resultId).toBeUndefined();
  });
  it("rejects an invalid or missing request id", async () => {
    expect((await recordPurchase({}, form(payload, ""))).error).toContain(
      "编号",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("only forwards whitelisted adjustment parameters", async () => {
    const data = new FormData();
    for (const [k, v] of Object.entries({
      request_id: key,
      lot_id: key,
      new_quantity: "0",
      expected_quantity: "300",
      movement_kind: "WASTE",
      movement_note: "变质",
      household_id: "forged",
      actor_id: "forged",
    }))
      data.set(k, v);
    await adjustStock({}, data);
    expect(mocks.rpc).toHaveBeenCalledWith("adjust_stock", {
      request_id: key,
      lot_id: key,
      new_quantity: "0",
      expected_quantity: "300",
      movement_kind: "WASTE",
      movement_note: "变质",
    });
  });
  it("routes linked purchase rows to the atomic list-completion function", async () => {
    const linked = {
      ...payload,
      items: [
        {
          ...payload.items[0],
          shopping_item_id: key,
          shopping_item_version: 3,
        },
      ],
    };
    await recordPurchase({}, form(linked));
    expect(mocks.rpc).toHaveBeenCalledWith("record_purchase_from_list", {
      request_id: key,
      payload: linked,
      shopping_links: [{ item_id: key, version: 3, line_number: 1 }],
    });
  });
});
