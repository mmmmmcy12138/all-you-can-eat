import { describe, it, expect } from "vitest";
import {
  appendPurchaseDraft,
  type PurchaseDraft,
} from "../../lib/shopping/draft";
import { purchaseSchema } from "../../lib/inventory/validation";
const item = {
  ingredient_id: "",
  name: "鸡蛋",
  category: "蛋奶" as const,
  quantity: "12",
  unit: "个" as const,
  total_cost: "",
  expires_on: "",
  storage_location: "冷藏" as const,
};
const incoming = {
  purchased_on: "",
  store_name: "H Mart",
  note: "",
  items: [item],
};
const base: PurchaseDraft = {
  requestId: "original-request",
  payload: {
    purchased_on: "2026-10-26",
    store_name: "Costco",
    note: "原备注",
    items: [{ ...item, name: "原有商品", total_cost: "1.99" }],
  },
  selected: [false],
  sourceLines: [3],
};
describe("shopping/repurchase review drafts", () => {
  it("starts a new request without copying old dates or inventing prices", () => {
    const result = appendPurchaseDraft(null, incoming, "new-request");
    expect(result).toEqual({ requestId: "new-request", payload: incoming });
    expect(result.payload.purchased_on).toBe("");
    expect(result.payload.items[0].total_cost).toBe("");
  });
  it("appends and preserves original draft id, metadata and checkbox state", () => {
    const result = appendPurchaseDraft(base, incoming, "unused-request");
    expect(result.requestId).toBe("original-request");
    expect(result.payload.items).toHaveLength(2);
    expect(result.payload.store_name).toBe("Costco");
    expect(result.payload.note).toBe("原备注");
    expect(result.selected).toEqual([false, true]);
    expect(result.sourceLines).toEqual([3, 0]);
  });
  it("never overwrites a completed purchase with unselected leftovers", () => {
    expect(() =>
      appendPurchaseDraft(
        { ...base, resultId: "old-purchase" },
        incoming,
        "next",
      ),
    ).toThrow(/未勾选/);
  });
  it("uses a fresh request after a fully completed previous purchase", () => {
    const result = appendPurchaseDraft(
      { ...base, selected: [true], resultId: "old" },
      incoming,
      "fresh",
    );
    expect(result.requestId).toBe("fresh");
    expect(result.resultId).toBeUndefined();
    expect(result.payload.purchased_on).toBe("");
  });
  it("rejects duplicate shopping associations and oversized drafts", () => {
    const linked = {
      ...item,
      shopping_item_id: "00000000-0000-4000-8000-000000000001",
      shopping_item_version: 1,
    };
    expect(() =>
      appendPurchaseDraft(
        { ...base, payload: { ...base.payload, items: [linked] } },
        { ...incoming, items: [linked] },
        "next",
      ),
    ).toThrow(/已包含/);
    expect(() =>
      appendPurchaseDraft(
        base,
        { ...incoming, items: Array(50).fill(item) },
        "next",
      ),
    ).toThrow(/50/);
    expect(() =>
      appendPurchaseDraft(null, { ...incoming, items: [] }, "next"),
    ).toThrow(/1–50/);
  });
  it("requires both shopping id and version in server validation", () => {
    const valid = { ...incoming, purchased_on: "2026-10-26" };
    expect(
      purchaseSchema.safeParse({
        ...valid,
        items: [
          { ...item, shopping_item_id: "00000000-0000-4000-8000-000000000001" },
        ],
      }).success,
    ).toBe(false);
    expect(
      purchaseSchema.safeParse({
        ...valid,
        items: [
          {
            ...item,
            shopping_item_id: "00000000-0000-4000-8000-000000000001",
            shopping_item_version: 1,
          },
        ],
      }).success,
    ).toBe(true);
  });
});
