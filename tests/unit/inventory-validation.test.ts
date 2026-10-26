import { describe, it, expect } from "vitest";
import {
  purchaseSchema,
  adjustmentSchema,
} from "../../lib/inventory/validation";
import { sumQuantities, expiryState } from "../../lib/inventory/quantities";
const valid = {
  purchased_on: "2026-10-26",
  store_name: " Costco ",
  note: "",
  items: [
    {
      ingredient_id: "",
      name: " 鸡蛋 ",
      category: "蛋奶",
      quantity: "12",
      unit: "个",
      total_cost: "4.99",
      expires_on: "",
      storage_location: "冷藏",
    },
  ],
};
describe("purchase input validation", () => {
  it("trims names but preserves unknown dates", () => {
    const result = purchaseSchema.parse(valid);
    expect(result.store_name).toBe("Costco");
    expect(result.items[0].name).toBe("鸡蛋");
    expect(result.items[0].expires_on).toBe("");
  });
  it("rejects nonexistent dates", () => {
    expect(
      purchaseSchema.safeParse({ ...valid, purchased_on: "2026-02-30" })
        .success,
    ).toBe(false);
  });
  it("rejects negative amounts, zero quantity and extra precision", () => {
    for (const change of [
      { quantity: "-1" },
      { quantity: "0" },
      { quantity: "1.0001" },
      { total_cost: "1.999" },
      { total_cost: "-1" },
    ])
      expect(
        purchaseSchema.safeParse({
          ...valid,
          items: [{ ...valid.items[0], ...change }],
        }).success,
      ).toBe(false);
  });
  it("allows explicitly free items and unknown prices", () => {
    for (const price of ["0", ""])
      expect(
        purchaseSchema.safeParse({
          ...valid,
          items: [{ ...valid.items[0], total_cost: price }],
        }).success,
      ).toBe(true);
  });
  it("requires at least one row and a valid food name", () => {
    expect(purchaseSchema.safeParse({ ...valid, items: [] }).success).toBe(
      false,
    );
    expect(
      purchaseSchema.safeParse({
        ...valid,
        items: [{ ...valid.items[0], name: "" }],
      }).success,
    ).toBe(false);
  });
  it("reports the row containing an invalid date", () => {
    const result = purchaseSchema.safeParse({
      ...valid,
      items: [valid.items[0], { ...valid.items[0], expires_on: "2026-10-25" }],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(["items", 1, "expires_on"]);
  });
  it("requires a reason for manual adjustment", () => {
    expect(
      adjustmentSchema.safeParse({
        lot_id: "00000000-0000-4000-8000-000000000001",
        new_quantity: "0",
        movement_kind: "WASTE",
        movement_note: "",
      }).success,
    ).toBe(false);
  });
});
describe("inventory numbers and expiry", () => {
  it("sums three-decimal quantities without visible floating point drift", () => {
    expect(
      sumQuantities([{ current_quantity: 0.1 }, { current_quantity: 0.2 }]),
    ).toBe(0.3);
  });
  it("separates expired, soon, fresh and unknown", () => {
    expect(expiryState(null, "2026-10-26")).toBe("unknown");
    expect(expiryState("2026-10-25", "2026-10-26")).toBe("expired");
    expect(expiryState("2026-10-26", "2026-10-26")).toBe("soon");
    expect(expiryState("2026-10-29", "2026-10-26")).toBe("soon");
    expect(expiryState("2026-10-30", "2026-10-26")).toBe("fresh");
  });
});
