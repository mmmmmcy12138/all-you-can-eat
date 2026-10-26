// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  manage: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("../../app/shopping/list/actions", () => ({
  manageShopping: mocks.manage,
}));
import { DraftLauncher } from "../../components/shopping/draft-launcher";
import {
  AddShoppingForm,
  ChangeShoppingForm,
} from "../../components/shopping/list-forms";
import { ShoppingList } from "../../components/shopping/list";
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
const payload = { purchased_on: "", store_name: "", note: "", items: [item] };
const shopping = {
  id: "00000000-0000-4000-8000-000000000001",
  ingredient_id: null,
  name: "鸡蛋",
  category: "蛋奶",
  unit: "个",
  quantity: 12,
  stocked_quantity: 5,
  status: "purchased" as const,
  version: 2,
  created_at: "",
  updated_at: "",
};
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("shared shopping UI", () => {
  it("opens a local review draft without performing a stock write", async () => {
    render(<DraftLauncher draftKey="draft" payload={payload} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "加入采购核对单" }));
    expect(
      JSON.parse(sessionStorage.getItem("draft")!).payload.items[0].name,
    ).toBe("鸡蛋");
    expect(mocks.push).toHaveBeenCalledWith("/shopping/new");
    expect(mocks.manage).not.toHaveBeenCalled();
  });
  it("does not overwrite malformed existing drafts", async () => {
    sessionStorage.setItem("draft", "not-json");
    render(<DraftLauncher draftKey="draft" payload={payload} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "加入采购核对单" }));
    expect(screen.getByRole("alert").textContent).toContain("不会覆盖");
    expect(sessionStorage.getItem("draft")).toBe("not-json");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("creates a review with remaining quantity, empty price/date and list version", async () => {
    render(
      <ShoppingList
        active={[shopping]}
        recent={[]}
        ingredients={[]}
        draftKey="draft"
        requests={{ [shopping.id]: "request" }}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("checkbox", { name: "选择 鸡蛋 进行入库核对" }),
    );
    await user.click(
      screen.getByRole("button", { name: "将选中 1 项转入采购核对" }),
    );
    const draft = JSON.parse(sessionStorage.getItem("draft")!);
    expect(draft.payload.items[0]).toMatchObject({
      quantity: "7",
      total_cost: "",
      expires_on: "",
      shopping_item_id: shopping.id,
      shopping_item_version: 2,
    });
    expect(draft.payload.purchased_on).toBe("");
    expect(mocks.manage).not.toHaveBeenCalled();
  });
  it("submits a mark-purchased action rather than an inventory write", async () => {
    mocks.manage.mockResolvedValue({ message: "已标记" });
    render(<ChangeShoppingForm item={shopping} requestId="key" />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "改回待买" }));
    await waitFor(() => expect(mocks.manage).toHaveBeenCalledTimes(1));
    const form = mocks.manage.mock.calls[0][1] as FormData;
    expect(form.get("item_action")).toBe("open");
    expect(form.get("expected_version")).toBe("2");
  });
  it("reuses the add-request key after a connection error", async () => {
    mocks.manage.mockResolvedValue({ error: "网络错误" });
    render(<AddShoppingForm ingredients={[]} requestId="stable" />);
    fireEvent.change(screen.getByLabelText("商品名称"), {
      target: { value: "鸡蛋" },
    });
    fireEvent.change(screen.getByLabelText("还需要购买的数量"), {
      target: { value: "12" },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "加入共享清单" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "加入共享清单" }));
    await waitFor(() => expect(mocks.manage).toHaveBeenCalledTimes(2));
    expect((mocks.manage.mock.calls[0][1] as FormData).get("request_id")).toBe(
      (mocks.manage.mock.calls[1][1] as FormData).get("request_id"),
    );
  });
  it("does not append a draft twice when the launch button is double clicked", async () => {
    render(<DraftLauncher draftKey="draft" payload={payload} />);
    await userEvent
      .setup()
      .dblClick(screen.getByRole("button", { name: "加入采购核对单" }));
    expect(
      JSON.parse(sessionStorage.getItem("draft")!).payload.items,
    ).toHaveLength(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
});
