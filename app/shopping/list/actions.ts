"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { shoppingAdd, shoppingChange } from "@/lib/shopping/validation";
export type ShoppingState = {
  error?: string;
  message?: string;
  resultId?: string;
  requestKey?: string;
};
export async function manageShopping(
  _: ShoppingState,
  form: FormData,
): Promise<ShoppingState> {
  const requestId = String(form.get("request_id") ?? "");
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))
    return { error: "请求编号无效，请刷新重试" };
  const operation = form.get("operation");
  const parsed =
    operation === "add"
      ? shoppingAdd.safeParse(Object.fromEntries(form))
      : shoppingChange.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const client = await supabaseServer();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { error: "请先登录" };
    const args =
      operation === "add"
        ? { request_id: requestId, item_payload: parsed.data }
        : { request_id: requestId, ...parsed.data };
    const { data, error } = await client.rpc(
      operation === "add" ? "add_shopping_item" : "change_shopping_item",
      args,
    );
    if (error)
      return {
        error:
          error.code === "P0001"
            ? error.message
            : "清单更新未确认成功，请检查连接或清单迁移。保留原内容重试。",
      };
    revalidatePath("/shopping");
    revalidatePath("/shopping/list");
    revalidatePath("/");
    return {
      resultId: data,
      requestKey: requestId,
      message:
        operation === "add"
          ? "需求已加入共享清单。同名商品取较大的待买量，不重复累加。"
          : "清单已更新。勾选已买不等于库存入库。",
    };
  } catch {
    return { error: "连接中断，尚未确认更新成功。请保留内容重试。" };
  }
}
