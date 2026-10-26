// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
vi.mock("../../app/shopping/actions", () => ({ recordPurchase: vi.fn() }));
import { PurchaseForm } from "../../components/inventory/purchase-form";
import { localPurchaseDate } from "../../lib/inventory/date";
const props = {
  ingredients: [],
  draftKey: "date-draft",
  initialRequestId: "00000000-0000-4000-8000-000000000001",
};
const item = {
  ingredient_id: "",
  name: "鸡蛋",
  category: "蛋奶",
  quantity: "12",
  unit: "个",
  total_cost: "4.99",
  expires_on: "",
  storage_location: "冷藏",
};
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function dateValue() {
  return (screen.getByLabelText("采购日期") as HTMLInputElement).value;
}
describe("device-local default purchase date", () => {
  it("defaults a new purchase to the device calendar date", () => {
    render(<PurchaseForm {...props} />);
    expect(dateValue()).toBe(localPurchaseDate());
  });
  it("preserves a manually edited past date across refresh", () => {
    render(<PurchaseForm {...props} />);
    fireEvent.change(screen.getByLabelText("采购日期"), {
      target: { value: "2025-03-04" },
    });
    cleanup();
    render(<PurchaseForm {...props} />);
    expect(dateValue()).toBe("2025-03-04");
  });
  it("preserves a previously saved draft date even without new metadata", () => {
    sessionStorage.setItem(
      props.draftKey,
      JSON.stringify({
        requestId: props.initialRequestId,
        payload: {
          purchased_on: "2025-03-04",
          store_name: "",
          note: "",
          items: [item],
        },
      }),
    );
    render(<PurchaseForm {...props} />);
    expect(dateValue()).toBe("2025-03-04");
  });
  it("fills a blank historical/repurchase/list draft with today, without copying the original old date", () => {
    sessionStorage.setItem(
      props.draftKey,
      JSON.stringify({
        requestId: props.initialRequestId,
        payload: { purchased_on: "", store_name: "", note: "", items: [item] },
      }),
    );
    render(<PurchaseForm {...props} />);
    expect(dateValue()).toBe(localPurchaseDate());
  });
  it("does not silently undo an explicitly cleared date", () => {
    render(<PurchaseForm {...props} />);
    fireEvent.change(screen.getByLabelText("采购日期"), {
      target: { value: "" },
    });
    cleanup();
    render(<PurchaseForm {...props} />);
    expect(dateValue()).toBe("");
  });
  it("uses local calendar parts even when UTC represents another date", () => {
    const date = new Date("2026-01-01T10:30:00Z");
    vi.spyOn(date, "getFullYear").mockReturnValue(2026);
    vi.spyOn(date, "getMonth").mockReturnValue(0);
    vi.spyOn(date, "getDate").mockReturnValue(2);
    expect(localPurchaseDate(date)).toBe("2026-01-02");
  });
  it("defaults another explicitly new purchase to today after a completed historical receipt", () => {
    sessionStorage.setItem(
      props.draftKey,
      JSON.stringify({
        requestId: props.initialRequestId,
        resultId: "saved",
        payload: {
          purchased_on: "2025-03-04",
          store_name: "",
          note: "",
          items: [item],
        },
      }),
    );
    render(<PurchaseForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "再记一笔采购" }));
    expect(dateValue()).toBe(localPurchaseDate());
  });
});
