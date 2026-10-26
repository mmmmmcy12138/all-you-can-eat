import type { Ingredient } from "@/lib/inventory/types";
import type { PurchasePayload } from "@/lib/inventory/validation";
export type ImportRow = {
  line: number;
  item: PurchasePayload["items"][number];
  matched: boolean;
  originalUnit: string;
};
export type ImportIssue = { line: number; message: string };
export type ImportResult = {
  rows: ImportRow[];
  issues: ImportIssue[];
  sourceCount: number;
  blankCount: number;
};
const aliases: Record<
  string,
  { unit: PurchasePayload["items"][number]["unit"]; factor: bigint }
> = {};
for (const [unit, factor, names] of [
  ["g", 1n, ["g", "克", "公克", "gram", "grams"]],
  ["g", 1000n, ["kg", "千克", "公斤", "kilogram", "kilograms"]],
  [
    "ml",
    1n,
    ["ml", "毫升", "milliliter", "milliliters", "millilitre", "millilitres"],
  ],
  ["ml", 1000n, ["l", "升", "liter", "liters", "litre", "litres"]],
  ["个", 1n, ["个", "只", "枚", "pc", "pcs", "piece", "pieces", "each", "ea"]],
  ["包", 1n, ["包", "pack", "packs", "packet", "packets"]],
  ["袋", 1n, ["袋", "bag", "bags"]],
  ["瓶", 1n, ["瓶", "bottle", "bottles"]],
  ["盒", 1n, ["盒", "box", "boxes", "carton", "cartons"]],
  ["份", 1n, ["份", "serving", "servings", "portion", "portions"]],
] as const)
  for (const alias of names) aliases[alias] = { unit, factor };
function normalized(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
// Exact decimal scaling; refuse precision loss instead of silently rounding inventory.
function decimal(
  raw: string,
  factor: bigint,
  places: number,
  maximum: bigint,
  positive: boolean,
): string | null {
  const value = raw.normalize("NFKC").trim();
  if (value.length > 32 || !/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const denominator = 10n ** BigInt(fraction.length),
    scale = 10n ** BigInt(places);
  const numerator = BigInt(whole + fraction) * factor * scale;
  if (numerator % denominator !== 0n) return null;
  const amount = numerator / denominator;
  if (amount > maximum * scale || (positive && amount === 0n)) return null;
  const remainder = (amount % scale)
    .toString()
    .padStart(places, "0")
    .replace(/0+$/, "");
  return (amount / scale).toString() + (remainder ? "." + remainder : "");
}
export function parsePurchaseText(
  text: string,
  ingredients: Ingredient[] = [],
): ImportResult {
  const result: ImportResult = {
    rows: [],
    issues: [],
    sourceCount: 0,
    blankCount: 0,
  };
  if (text.length > 20000) {
    result.issues.push({
      line: 0,
      message: "文字过长，请控制在 20,000 字符内并分批导入。",
    });
    return result;
  }
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const index = new Map<string, Ingredient[]>();
  for (const ingredient of ingredients) {
    for (const name of new Set(
      [ingredient.name, ingredient.name_en ?? ""]
        .filter(Boolean)
        .map(normalized),
    )) {
      const matches = index.get(name) ?? [];
      matches.push(ingredient);
      index.set(name, matches);
    }
  }
  for (let n = 0; n < lines.length; n++) {
    if (!lines[n].trim()) {
      result.blankCount++;
      continue;
    }
    result.sourceCount++;
    const line = n + 1,
      columns = lines[n].split(/[|｜]/).map((part) => part.trim());
    if (columns.length !== 4) {
      result.issues.push({
        line,
        message:
          "需要四列：食材名称 | 数量 | 单位 | 商品行总价（未知价格可留空第四列）。",
      });
      continue;
    }
    const [name, rawQuantity, rawUnit, rawPrice] = columns;
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      result.issues.push({
        line,
        message: "食材名称需要 1–80 个字符，且不能含控制字符。",
      });
      continue;
    }
    const unit = Object.hasOwn(aliases, normalized(rawUnit))
      ? aliases[normalized(rawUnit)]
      : undefined;
    if (!unit) {
      result.issues.push({
        line,
        message: `不支持单位“${rawUnit.length > 32 ? rawUnit.slice(0, 32) + "…" : rawUnit}”，请使用 g/kg、ml/L、个、包、袋、瓶、盒、份及常用英文别名。`,
      });
      continue;
    }
    const quantity = decimal(rawQuantity, unit.factor, 3, 1000000000n, true);
    if (quantity === null) {
      result.issues.push({
        line,
        message:
          "数量必须大于 0，换算后不超过十亿，且基础单位最多保留三位小数；不会自动四舍五入。",
      });
      continue;
    }
    const priceText = rawPrice
      .normalize("NFKC")
      .trim()
      .replace(/^(?:\$|USD\s+)/i, "")
      .trim();
    const totalCost =
      priceText === "" && rawPrice.trim() === ""
        ? ""
        : decimal(priceText, 1n, 2, 100000000n, false);
    if (totalCost === null) {
      result.issues.push({
        line,
        message:
          "商品行总价必须为非负美元金额、最多两位有效小数；未知价格请留空。",
      });
      continue;
    }
    const matches = index.get(normalized(name)) ?? [];
    if (matches.length > 1) {
      result.issues.push({
        line,
        message: "名称匹配了多个食材，请改用明确的食材名称后重新解析。",
      });
      continue;
    }
    const existing = matches[0];
    if (existing && existing.base_unit !== unit.unit) {
      result.issues.push({
        line,
        message: `已匹配“${existing.name}”，其基础单位为 ${existing.base_unit}，与本行的 ${unit.unit} 不兼容，请先修正单位或明确使用另一种食材名称。`,
      });
      continue;
    }
    result.rows.push({
      line,
      matched: !!existing,
      originalUnit: rawUnit,
      item: {
        ingredient_id: existing?.id ?? "",
        name: existing?.name ?? name,
        category:
          (existing?.category as PurchasePayload["items"][number]["category"]) ??
          "其他",
        quantity,
        unit: unit.unit,
        total_cost: totalCost,
        expires_on: "",
        storage_location: "冷藏",
      },
    });
  }
  if (result.sourceCount === 0)
    result.issues.push({ line: 0, message: "请先粘贴至少一行采购内容。" });
  if (result.sourceCount > 50)
    result.issues.push({
      line: 0,
      message: `共 ${result.sourceCount} 个商品行，每单最多 50 项，请分批导入。`,
    });
  return result;
}
