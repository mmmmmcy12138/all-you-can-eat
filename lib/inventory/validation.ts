import { z } from "zod";
export const categories = [
  "肉类",
  "海鲜",
  "蔬菜",
  "水果",
  "蛋奶",
  "主食",
  "调味料",
  "饮料",
  "其他",
] as const;
export const units = ["g", "ml", "个", "包", "袋", "瓶", "盒", "份"] as const;
export const locations = ["冷藏", "冷冻", "常温"] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "请输入有效日期")
  .refine((value) => {
    const day = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value
    );
  }, "日期不存在");
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,3})?$/, "数量最多三位小数")
  .refine(
    (value) => Number(value) > 0 && Number(value) <= 1e9,
    "数量必须大于 0 且不超过十亿",
  );
const cost = z
  .string()
  .trim()
  .regex(/^(|\d{1,9}(\.\d{1,2})?)$/, "金额最多两位小数")
  .refine((value) => value === "" || Number(value) <= 1e8, "金额超出范围");
export const purchaseItem = z
  .object({
    ingredient_id: z.union([z.uuid(), z.literal("")]),
    name: z.string().trim().max(80, "名称最多 80 字"),
    category: z.enum(categories),
    quantity,
    unit: z.enum(units),
    total_cost: cost,
    expires_on: z.union([date, z.literal("")]),
    storage_location: z.enum(locations),
  })
  .refine((item) => !!item.ingredient_id || !!item.name, {
    message: "请选择现有食材或输入新食材名称",
    path: ["name"],
  });
export const purchaseSchema = z
  .object({
    purchased_on: date,
    store_name: z.string().trim().max(80),
    note: z.string().trim().max(500),
    items: z.array(purchaseItem).min(1).max(50),
  })
  .superRefine((value, ctx) => {
    value.items.forEach((item, index) => {
      if (item.expires_on && item.expires_on < value.purchased_on)
        ctx.addIssue({
          code: "custom",
          message: "到期日期不能早于采购日期",
          path: ["items", index, "expires_on"],
        });
    });
  });
export type PurchasePayload = z.infer<typeof purchaseSchema>;
export const adjustmentSchema = z.object({
  lot_id: z.uuid(),
  expected_quantity: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,3})?$/, "原库存数量无效"),
  new_quantity: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,3})?$/, "数量最多三位小数")
    .refine((v) => Number(v) <= 1e9, "数量超出范围"),
  movement_kind: z.enum(["WASTE", "ADJUSTMENT"]),
  movement_note: z.string().trim().min(1, "请填写调整原因").max(500),
});
