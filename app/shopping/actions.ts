"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { adjustmentSchema, purchaseSchema } from "@/lib/inventory/validation";
export type InventoryActionState = {
  error?: string;
  message?: string;
  resultId?: string;
  requestKey?: string;
};
export async function recordPurchase(
  _: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  const requestId = String(form.get("request_id") ?? "");
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))
    return { error: "请求编号无效，请刷新页面重试。" };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload")));
  } catch {
    return { error: "采购内容无法解析，请重新检查。" };
  }
  const parsed = purchaseSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index =
      issue.path[0] === "items" && typeof issue.path[1] === "number"
        ? `第 ${issue.path[1] + 1} 行：`
        : "";
    return { error: index + issue.message };
  }
  try {
    const client = await supabaseServer();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { error: "请先登录再入库。" };
    const links = parsed.data.items.flatMap((item, index) =>
      item.shopping_item_id
        ? [
            {
              item_id: item.shopping_item_id,
              version: item.shopping_item_version,
              line_number: index + 1,
            },
          ]
        : [],
    );
    const { data, error } = await client.rpc(
      links.length ? "record_purchase_from_list" : "record_purchase",
      {
        request_id: requestId,
        payload: parsed.data,
        ...(links.length ? { shopping_links: links } : {}),
      },
    );
    if (error)
      return {
        error:
          error.code === "P0001"
            ? error.message
            : "入库未确认成功，请检查网络、权限或库存迁移。重试时请保留原采购内容。",
      };
    revalidatePath("/");
    revalidatePath("/fridge");
    revalidatePath("/shopping");
    revalidatePath("/shopping/list");
    return {
      message: "采购已入库，库存与流水已一起保存。",
      resultId: data,
      requestKey: requestId,
    };
  } catch {
    return {
      error:
        "连接中断，尚未确认入库结果。请保留内容并重试，系统会避免同一请求重复入库。",
    };
  }
}
export async function adjustStock(
  _: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  const requestId = String(form.get("request_id") ?? "");
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))
    return { error: "请求编号无效，请刷新重试。" };
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const client = await supabaseServer();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { error: "请先登录" };
    const { data, error } = await client.rpc("adjust_stock", {
      request_id: requestId,
      ...parsed.data,
    });
    if (error)
      return {
        error:
          error.code === "P0001"
            ? error.message
            : "调整未确认成功，请保留内容并重试。",
      };
    revalidatePath("/");
    revalidatePath("/", "layout");
    return {
      message: "库存已调整，并记录操作流水。",
      resultId: data,
      requestKey: requestId,
    };
  } catch {
    return { error: "网络异常，尚未确认保存成功。请保留内容并重试。" };
  }
}
