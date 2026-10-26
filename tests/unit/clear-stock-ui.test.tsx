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
const mocks = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("../../app/shopping/actions", () => ({ clearInventory: mocks.clear }));
import { ClearStock } from "../../components/inventory/clear-stock";
import { FridgeList } from "../../components/inventory/fridge-list";
const props = {
  fingerprint: "a".repeat(64),
  lotCount: 2,
  requestId: "stable-key",
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByText("清空当前库存", { exact: true }));
  return user;
}
describe("clear stock confirmation UI", () => {
  it("requires the exact confirmation and a reason before enabling submission", async () => {
    render(<ClearStock {...props} />);
    const user = await open();
    expect(
      (
        screen.getByRole("button", {
          name: "确认清空当前库存",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText("输入“清空库存”确认"), "清空库存");
    expect(
      (
        screen.getByRole("button", {
          name: "确认清空当前库存",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("keeps the same request and typed data after a network failure", async () => {
    mocks.clear.mockResolvedValue({ error: "网络错误" });
    render(<ClearStock {...props} />);
    const user = await open();
    await user.type(screen.getByLabelText("输入“清空库存”确认"), "清空库存");
    await user.click(screen.getByRole("button", { name: "确认清空当前库存" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "确认清空当前库存" }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledTimes(2));
    const first = mocks.clear.mock.calls[0][1] as FormData,
      second = mocks.clear.mock.calls[1][1] as FormData;
    expect(second.get("request_id")).toBe(first.get("request_id"));
    expect(second.get("expected_fingerprint")).toBe(props.fingerprint);
  });
  it("blocks an offline clear and does not claim success", async () => {
    render(<ClearStock {...props} />);
    const user = await open();
    await user.type(screen.getByLabelText("输入“清空库存”确认"), "清空库存");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await user.click(screen.getByRole("button", { name: "确认清空当前库存" }));
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("未提交");
  });
  it("does not offer a clear submit for an empty fridge", async () => {
    render(<ClearStock {...props} lotCount={0} />);
    await open();
    expect(
      screen.queryByRole("button", { name: "确认清空当前库存" }),
    ).toBeNull();
  });
  it("hides empty inventory by default but keeps history accessible", async () => {
    render(
      <FridgeList
        ingredients={[
          { id: "food", name: "鸡蛋", category: "蛋奶", base_unit: "个" },
        ]}
        lots={[]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "鸡蛋" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "当前冰箱没有库存" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "显示零库存食材与历史批次" }),
    );
    expect(screen.getByRole("heading", { name: "鸡蛋" })).toBeTruthy();
  });
});
