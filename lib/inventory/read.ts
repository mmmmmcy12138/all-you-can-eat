import { supabaseServer } from "@/lib/supabase/server";
import type { Ingredient, StockLot } from "./types";
export async function readInventory(householdId: string) {
  try {
    const client = await supabaseServer();
    const { data, error } = await client.rpc("read_inventory");
    if (
      error ||
      !data ||
      data.household_id !== householdId ||
      !Array.isArray(data.ingredients) ||
      !Array.isArray(data.lots)
    )
      return {
        ok: false as const,
        message:
          "库存读取失败。如果刚升级应用，请确认库存迁移已执行；现有账号和家庭不会受影响。",
      };
    return {
      ok: true as const,
      ingredients: data.ingredients as Ingredient[],
      lots: data.lots as StockLot[],
    };
  } catch {
    return {
      ok: false as const,
      message: "无法读取库存，请检查网络后刷新重试。",
    };
  }
}
