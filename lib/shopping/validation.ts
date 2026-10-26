import { z } from "zod";
import { categories, units } from "@/lib/inventory/validation";
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,3})?$/, "数量最多三位小数")
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 1e9,
    "待买数量需要大于 0 且不超过十亿",
  );
export const shoppingAdd = z
  .object({
    ingredient_id: z.union([z.uuid(), z.literal("")]),
    name: z.string().trim().max(80),
    category: z.enum(categories),
    unit: z.enum(units),
    quantity,
  })
  .refine((v) => !!v.ingredient_id || !!v.name, {
    message: "请输入商品名称",
    path: ["name"],
  });
export const shoppingChange = z
  .object({
    item_id: z.uuid(),
    expected_version: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    item_action: z.enum(["purchased", "open", "cancel", "quantity"]),
    remaining_quantity: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.item_action === "quantity") {
      const parsed = quantity.safeParse(v.remaining_quantity);
      if (!parsed.success)
        ctx.addIssue({
          code: "custom",
          message: parsed.error.issues[0].message,
          path: ["remaining_quantity"],
        });
    }
  });
