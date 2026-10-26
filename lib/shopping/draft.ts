import type { PurchasePayload } from "@/lib/inventory/validation";
export type PurchaseDraft = {
  requestId: string;
  payload: PurchasePayload;
  resultId?: string;
  selected?: boolean[];
  sourceLines?: number[];
  purchaseDateTouched?: boolean;
};
export function appendPurchaseDraft(
  current: PurchaseDraft | null,
  incoming: PurchasePayload,
  requestId: string,
): PurchaseDraft {
  if (incoming.items.length < 1 || incoming.items.length > 50)
    throw new Error("每笔采购需要 1–50 项，请重新选择。");
  const incomingLinks = incoming.items
    .map((item) => item.shopping_item_id)
    .filter(Boolean);
  if (new Set(incomingLinks).size !== incomingLinks.length)
    throw new Error("同一个清单商品不能在核对单中重复关联。");
  if (
    current?.resultId &&
    current.payload.items.some(
      (_, index) => current.selected?.[index] === false,
    )
  )
    throw new Error(
      "上一笔采购还有未勾选商品，请先到采购核对单处理，或明确开始新采购后再添加。",
    );
  if (!current || current.resultId) return { requestId, payload: incoming };
  const blank =
    current.payload.items.length === 1 &&
    !current.payload.items[0].ingredient_id &&
    !current.payload.items[0].name &&
    !current.payload.items[0].quantity &&
    !current.payload.items[0].total_cost &&
    !current.payload.items[0].expires_on &&
    current.payload.items[0].category === "其他" &&
    current.payload.items[0].unit === "g" &&
    current.payload.items[0].storage_location === "冷藏" &&
    (current.selected?.[0] ?? true);
  const kept = blank ? [] : current.payload.items;
  if (kept.length + incoming.items.length > 50)
    throw new Error("追加后超过每单 50 项，请先处理当前采购草稿。");
  const linked = new Set(
    kept.map((row) => row.shopping_item_id).filter(Boolean),
  );
  if (
    incoming.items.some(
      (row) => row.shopping_item_id && linked.has(row.shopping_item_id),
    )
  )
    throw new Error(
      "当前草稿已包含此清单商品。若版本已变化，请先移除旧草稿中的该行，再从清单重新选择。",
    );
  return {
    ...current,
    payload: {
      ...current.payload,
      store_name: current.payload.store_name || incoming.store_name,
      items: [...kept, ...incoming.items],
    },
    selected: [
      ...kept.map((_, i) => current.selected?.[i] ?? true),
      ...incoming.items.map(() => true),
    ],
    sourceLines: [
      ...kept.map((_, i) => current.sourceLines?.[i] ?? 0),
      ...incoming.items.map(() => 0),
    ],
  };
}
