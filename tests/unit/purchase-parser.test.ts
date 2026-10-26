import { describe, it, expect } from "vitest";
import { parsePurchaseText } from "../../lib/purchase-parser";
import { purchaseSchema } from "../../lib/inventory/validation";
import type { Ingredient } from "../../lib/inventory/types";
const eggs: Ingredient = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "鸡蛋",
  name_en: "Eggs",
  category: "蛋奶",
  base_unit: "个",
};
describe("receipt text parsing", () => {
  it("parses the standard multi-line receipt and trims columns", () => {
    const result = parsePurchaseText(
      " 鸡蛋 | 12 | 个 | 4.99\n牛肉 | 680 | g | 11.49\n番茄 | 4 | 个 | 2.99",
      [eggs],
    );
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].item).toMatchObject({
      ingredient_id: eggs.id,
      name: "鸡蛋",
      category: "蛋奶",
      quantity: "12",
      unit: "个",
      total_cost: "4.99",
      expires_on: "",
    });
    expect(result.rows[1].matched).toBe(false);
    expect(result.rows[1].item.category).toBe("其他");
  });
  it("matches existing English aliases without guessing translations", () => {
    const result = parsePurchaseText(" eGgS | 12 | pcs | 4.99", [eggs]);
    expect(result.rows[0].item.ingredient_id).toBe(eggs.id);
    const unmatched = parsePurchaseText("Tomato | 2 | each | 1.99", [eggs]);
    expect(unmatched.rows[0].item.name).toBe("Tomato");
    expect(unmatched.rows[0].item.ingredient_id).toBe("");
  });
  it("handles CRLF, BOM, whitespace, blank lines and fullwidth pipes", () => {
    const result = parsePurchaseText(
      "\uFEFF鸡蛋 ｜ １２ ｜ 个 ｜ ４.９９\r\n  \r\n牛肉 | 2 | kg | 12\r\n",
    );
    expect(result.issues).toEqual([]);
    expect(result.sourceCount).toBe(2);
    expect(result.blankCount).toBe(2);
    expect(result.rows.map((r) => r.line)).toEqual([1, 3]);
    expect(result.rows[0].item.quantity).toBe("12");
  });
  it.each([
    ["kg", "0.68", "g", "680"],
    ["公斤", "0.000001", "g", "0.001"],
    ["L", "1.25", "ml", "1250"],
    ["毫升", "250", "ml", "250"],
    ["grams", "12.50", "g", "12.5"],
    ["bottles", "2", "瓶", "2"],
    ["pack", "3", "包", "3"],
  ])("normalizes %s exactly", (alias, quantity, unit, expected) => {
    const result = parsePurchaseText(`食材 | ${quantity} | ${alias} | 1`);
    expect(result.issues).toEqual([]);
    expect(result.rows[0].item).toMatchObject({ quantity: expected, unit });
  });
  it("does not invent dates or prices", () => {
    const result = parsePurchaseText("青菜 | 1 | 包 |");
    expect(result.issues).toEqual([]);
    expect(result.rows[0].item.expires_on).toBe("");
    expect(result.rows[0].item.total_cost).toBe("");
  });
  it("accepts free items and dollar-prefixed line totals", () => {
    expect(parsePurchaseText("食材 | 1 | g | 0").rows[0].item.total_cost).toBe(
      "0",
    );
    expect(
      parsePurchaseText("食材 | 1 | g | $ 4.99").rows[0].item.total_cost,
    ).toBe("4.99");
    expect(
      parsePurchaseText("食材 | 1 | g | USD 4.99").rows[0].item.total_cost,
    ).toBe("4.99");
  });
  it.each(["0", "-1", "1e3", "NaN", "Infinity", "1/2", "0.0001", "1000000001"])(
    "rejects invalid quantity %s",
    (quantity) => {
      const result = parsePurchaseText(`食材 | ${quantity} | g | 1`);
      expect(result.rows).toHaveLength(0);
      expect(result.issues[0].line).toBe(1);
    },
  );
  it("rejects lossy kg conversion instead of rounding", () => {
    expect(
      parsePurchaseText("食材 | 0.0000001 | kg | 1").issues[0].message,
    ).toContain("不会自动四舍五入");
  });
  it.each(["-1", "1.999", "NaN", "1,000.00", "$", "100000001"])(
    "rejects invalid cost %s",
    (price) => {
      const result = parsePurchaseText(`食材 | 1 | g | ${price}`);
      expect(result.rows).toHaveLength(0);
      expect(result.issues[0].message).toContain("总价");
    },
  );
  it("does not silently skip malformed rows or misnumber errors", () => {
    const result = parsePurchaseText(
      "鸡蛋 | 12 | 个 | 4.99\n\n缺少分隔符\n牛肉 | -2 | g | 1\n番茄 | 2 | 个 | 2",
    );
    expect(result.rows.map((r) => r.line)).toEqual([1, 5]);
    expect(result.issues.map((i) => i.line)).toEqual([3, 4]);
  });
  it("requires exactly four columns", () => {
    for (const line of ["牛肉 | 2 | g", "牛肉 | 2 | g | 1 | extra"])
      expect(parsePurchaseText(line).issues[0].message).toContain("四列");
  });
  it("rejects unsupported or prototype-like unit names", () => {
    for (const unit of ["oz", "lb", "__proto__", "constructor"])
      expect(
        parsePurchaseText(`食材 | 1 | ${unit} | 1`).issues[0].message,
      ).toContain("不支持单位");
  });
  it("does not attach an existing ingredient with incompatible units", () => {
    const result = parsePurchaseText("鸡蛋 | 300 | g | 5", [eggs]);
    expect(result.issues[0].message).toContain("不兼容");
    expect(result.rows).toHaveLength(0);
  });
  it("refuses ambiguous English alias matches", () => {
    const result = parsePurchaseText("eggs | 1 | 个 | 1", [
      eggs,
      { ...eggs, id: "different", name: "鸭蛋" },
    ]);
    expect(result.issues[0].message).toContain("多个食材");
  });
  it("counts each existing ingredient only once if its Chinese and English name normalize identically", () => {
    const result = parsePurchaseText("EGGS | 1 | 个 | 1", [
      { ...eggs, name: "eggs", name_en: "EGGS" },
    ]);
    expect(result.issues).toEqual([]);
  });
  it("rejects empty input, too many rows and excessive text", () => {
    expect(parsePurchaseText(" \n ").issues[0].message).toContain("至少一行");
    expect(
      parsePurchaseText(
        Array(51).fill("牛肉 | 1 | g | 1").join("\n"),
      ).issues.at(-1)?.message,
    ).toContain("最多 50");
    expect(parsePurchaseText("x".repeat(20001)).issues[0].message).toContain(
      "文字过长",
    );
  });
  it("produces payloads accepted by the server validation schema", () => {
    const result = parsePurchaseText(
      "鸡蛋 | 12 | 个 | 4.99\n牛肉 | 0.68 | kg | 11.49",
      [eggs],
    );
    expect(
      purchaseSchema.safeParse({
        purchased_on: "2026-10-26",
        store_name: "H Mart",
        note: "",
        items: result.rows.map((row) => row.item),
      }).success,
    ).toBe(true);
  });
});
