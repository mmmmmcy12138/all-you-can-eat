// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ purchase: vi.fn() }));
vi.mock("../../app/shopping/actions", () => ({
  recordPurchase: mocks.purchase,
}));
import { PurchaseForm } from "../../components/inventory/purchase-form";
const key = "test-household-user";
const first = "00000000-0000-4000-8000-000000000001";
const props = { ingredients: [], draftKey: key, initialRequestId: first };
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
async function complete() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("采购日期"), "2026-10-26");
  await user.type(screen.getByLabelText("食材名称"), "鸡蛋");
  await user.type(screen.getByLabelText("入库数量"), "12");
  return user;
}
describe("purchase drafts and retry UX", () => {
  it("preserves the draft and SAME request key across a remount", async () => {
    render(<PurchaseForm {...props} />);
    await complete();
    const value = JSON.parse(sessionStorage.getItem(key)!);
    expect(value.requestId).toBe(first);
    expect(value.payload.items[0].name).toBe("鸡蛋");
    cleanup();
    render(
      <PurchaseForm
        {...props}
        initialRequestId="00000000-0000-4000-8000-000000000002"
      />,
    );
    expect((screen.getByLabelText("食材名称") as HTMLInputElement).value).toBe(
      "鸡蛋",
    );
    expect(
      (document.querySelector("[name=request_id]") as HTMLInputElement).value,
    ).toBe(first);
  });
  it("does not change the request key after a failed submission", async () => {
    mocks.purchase.mockResolvedValue({ error: "网络中断，请重试" });
    render(<PurchaseForm {...props} />);
    const user = await complete();
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(2));
    const a = mocks.purchase.mock.calls[0][1] as FormData,
      b = mocks.purchase.mock.calls[1][1] as FormData;
    expect(a.get("request_id")).toBe(b.get("request_id"));
    expect(a.get("payload")).toBe(b.get("payload"));
  });
  it("shows success without resubmitting on refresh, then allows a NEW purchase key", async () => {
    mocks.purchase.mockImplementation(async (_: unknown, form: FormData) => ({
      resultId: "saved-purchase",
      requestKey: form.get("request_id"),
      message: "成功",
    }));
    render(<PurchaseForm {...props} />);
    const user = await complete();
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    await screen.findByRole("heading", { name: "这笔采购，已经放进冰箱" });
    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem(key)!).resultId).toBe(
        "saved-purchase",
      ),
    );
    cleanup();
    render(<PurchaseForm {...props} />);
    expect(
      screen.getByRole("link", { name: "查看采购单" }).getAttribute("href"),
    ).toBe("/shopping/history/saved-purchase");
    expect(mocks.purchase).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "再记一笔采购" }));
    expect(screen.getByLabelText("食材名称")).toBeTruthy();
    expect(
      (document.querySelector("[name=request_id]") as HTMLInputElement).value,
    ).not.toBe(first);
  });
  it("keeps another household draft separate", () => {
    sessionStorage.setItem(
      "another-household",
      JSON.stringify({
        requestId: first,
        payload: { items: [{ name: "别家的食材" }] },
      }),
    );
    render(<PurchaseForm {...props} />);
    expect((screen.getByLabelText("食材名称") as HTMLInputElement).value).toBe(
      "",
    );
  });
  it("adds and removes rows before confirming the entire order", async () => {
    render(<PurchaseForm {...props} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "＋ 再加一项" }));
    expect(screen.getAllByLabelText("食材名称")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "移除此行" })[1]);
    expect(screen.getAllByLabelText("食材名称")).toHaveLength(1);
  });
  it("blocks offline submission without claiming the purchase succeeded", async () => {
    render(<PurchaseForm {...props} />);
    const user = await complete();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    expect(mocks.purchase).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("已阻止提交");
  });
  it("blocks submission if draft persistence fails", async () => {
    render(<PurchaseForm {...props} />);
    const user = await complete();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    expect(mocks.purchase).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("暂存草稿");
  });
});
