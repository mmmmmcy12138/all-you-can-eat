// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ purchase: vi.fn() }));
vi.mock("../../app/shopping/actions", () => ({
  recordPurchase: mocks.purchase,
}));
import { PurchaseForm } from "../../components/inventory/purchase-form";
const id = "00000000-0000-4000-8000-000000000001";
const props = {
  ingredients: [
    { id, name: "鸡蛋", name_en: "Eggs", category: "蛋奶", base_unit: "个" },
  ],
  draftKey: "import-household-user",
  initialRequestId: id,
};
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
async function parse(text: string) {
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText("采购文字"), {
    target: { value: text },
  });
  await user.click(screen.getByRole("button", { name: "解析并检查" }));
  return user;
}
function draft() {
  return JSON.parse(sessionStorage.getItem(props.draftKey)!);
}
describe("text purchase review and submission", () => {
  it("reports exact invalid lines and never partially transfers valid ones", async () => {
    render(<PurchaseForm {...props} />);
    await parse("鸡蛋 | 12 | 个 | 4.99\n牛肉 | -2 | g | 1");
    expect(screen.getByRole("alert").textContent).toContain("第 2 行");
    expect(screen.queryByRole("button", { name: /加入核对单/ })).toBeNull();
    expect(mocks.purchase).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(props.draftKey)).toBeNull();
  });
  it("matches ingredient IDs, converts units and prevents a double transfer", async () => {
    render(<PurchaseForm {...props} />);
    const user = await parse(
      "Eggs | 12 | pcs | 4.99\n牛肉 | 0.68 | kg | 11.49",
    );
    expect(screen.getByText("已匹配现有食材")).toBeTruthy();
    await user.dblClick(
      screen.getByRole("button", { name: "将 2 项加入核对单" }),
    );
    expect(draft().payload.items).toHaveLength(2);
    expect(draft().payload.items[0].ingredient_id).toBe(id);
    expect(draft().payload.items[1].quantity).toBe("680");
    expect(draft().sourceLines).toEqual([1, 2]);
    expect(mocks.purchase).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "解析并检查" }));
    expect(
      (
        screen.getByRole("button", {
          name: "已加入核对单",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("submits only checked, edited items and can start a new request for the rest", async () => {
    mocks.purchase.mockImplementation(async (_: unknown, form: FormData) => ({
      resultId: "purchase",
      requestKey: form.get("request_id"),
    }));
    render(<PurchaseForm {...props} />);
    const user = await parse("鸡蛋 | 12 | 个 | 4.99\n牛肉 | 0.68 | kg | 11.49");
    await user.click(screen.getByRole("button", { name: "将 2 项加入核对单" }));
    fireEvent.change(screen.getByLabelText("采购日期"), {
      target: { value: "2026-10-26" },
    });
    await user.click(screen.getByRole("checkbox", { name: "将商品 1 入库" }));
    fireEvent.change(screen.getAllByLabelText("入库数量")[1], {
      target: { value: "700" },
    });
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    await screen.findByRole("heading", { name: "这笔采购，已经放进冰箱" });
    expect(mocks.purchase).toHaveBeenCalledTimes(1);
    const submitted = mocks.purchase.mock.calls[0][1] as FormData;
    const payload = JSON.parse(String(submitted.get("payload")));
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: "牛肉",
      quantity: "700",
      unit: "g",
    });
    await user.click(
      screen.getByRole("button", { name: "继续处理未勾选商品" }),
    );
    expect(draft().payload.items).toHaveLength(1);
    expect(draft().payload.items[0].ingredient_id).toBe(id);
    expect(draft().requestId).not.toBe(submitted.get("request_id"));
  });
  it("appends instead of overwriting a manual draft and preserves receipt metadata", async () => {
    render(<PurchaseForm {...props} />);
    fireEvent.change(screen.getByLabelText("食材名称"), {
      target: { value: "原有食材" },
    });
    fireEvent.change(screen.getByLabelText("商店（可空）"), {
      target: { value: "Costco" },
    });
    const user = await parse("鸡蛋 | 12 | 个 | 4.99");
    await user.click(screen.getByRole("button", { name: "将 1 项加入核对单" }));
    expect(draft().payload.items.map((i: { name: string }) => i.name)).toEqual([
      "原有食材",
      "鸡蛋",
    ]);
    expect(draft().payload.store_name).toBe("Costco");
  });
  it("refuses to append above 50 rows without deleting the existing draft", async () => {
    render(<PurchaseForm {...props} />);
    fireEvent.change(screen.getByLabelText("食材名称"), {
      target: { value: "原有食材" },
    });
    const user = await parse(Array(50).fill("鸡蛋 | 1 | 个 | 1").join("\n"));
    await user.click(
      screen.getByRole("button", { name: "将 50 项加入核对单" }),
    );
    expect(screen.getByRole("alert").textContent).toContain("超过 50");
    expect(draft().payload.items).toHaveLength(1);
  });
  it("preserves imported selection, request id and source rows across refresh", async () => {
    render(<PurchaseForm {...props} />);
    const user = await parse("鸡蛋 | 12 | 个 | 4.99\n\n牛肉 | 1 | kg |");
    await user.click(screen.getByRole("button", { name: "将 2 项加入核对单" }));
    await user.click(screen.getByRole("checkbox", { name: "将商品 2 入库" }));
    cleanup();
    render(
      <PurchaseForm
        {...props}
        initialRequestId="00000000-0000-4000-8000-000000000099"
      />,
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "将商品 2 入库",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(draft().sourceLines).toEqual([1, 3]);
    expect(draft().requestId).toBe(id);
    await user.click(screen.getByRole("checkbox", { name: "将商品 1 入库" }));
    expect(
      (
        screen.getByRole("button", {
          name: "确认整单入库",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("does not allow edits or additional imports while a purchase is pending", async () => {
    let finish!: (v: unknown) => void;
    mocks.purchase.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PurchaseForm {...props} />);
    const user = await parse("鸡蛋 | 12 | 个 | 4.99");
    await user.click(screen.getByRole("button", { name: "将 1 项加入核对单" }));
    fireEvent.change(screen.getByLabelText("采购日期"), {
      target: { value: "2026-10-26" },
    });
    await user.click(screen.getByRole("button", { name: "确认整单入库" }));
    await waitFor(() => expect(mocks.purchase).toHaveBeenCalledTimes(1));
    expect(
      (
        screen.getByRole("button", { name: "解析并检查" }) as HTMLButtonElement
      ).closest("fieldset")?.disabled,
    ).toBe(true);
    finish({ error: "请重试" });
    await screen.findByRole("alert");
  });
});
