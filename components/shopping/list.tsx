"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShoppingItem } from "@/lib/shopping/types";
import type { Ingredient } from "@/lib/inventory/types";
import type { PurchasePayload } from "@/lib/inventory/validation";
import { formatQuantity } from "@/lib/inventory/quantities";
import { Button } from "@/components/ui/button";
import { ChangeShoppingForm } from "./list-forms";
import { DraftLauncher } from "./draft-launcher";
export function ShoppingList({
  active,
  recent,
  ingredients,
  draftKey,
  requests,
}: {
  active: ShoppingItem[];
  recent: ShoppingItem[];
  ingredients: Ingredient[];
  draftKey: string;
  requests: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();
  const chosen = active.filter((i) => selected.includes(i.id));
  const payload: PurchasePayload = {
    purchased_on: "",
    store_name: "",
    note: "",
    items: chosen.map((item) => ({
      ingredient_id: item.ingredient_id ?? "",
      name: item.name,
      category: (ingredients.find((i) => i.id === item.ingredient_id)
        ?.category ??
        item.category) as PurchasePayload["items"][number]["category"],
      quantity: String(
        Math.round(
          (Number(item.quantity) - Number(item.stocked_quantity)) * 1000,
        ) / 1000,
      ),
      unit: item.unit as PurchasePayload["items"][number]["unit"],
      total_cost: "",
      expires_on: "",
      storage_location: "冷藏",
      shopping_item_id: item.id,
      shopping_item_version: item.version,
    })),
  };
  return (
    <>
      <section className="panel shopping-toolbar">
        <div>
          <h2>待处理 {active.length} 项</h2>
          <p className="form-hint">
            已买 {active.filter((i) => i.status === "purchased").length}{" "}
            项待入库。勾选清单不会增加冰箱库存。
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>
          刷新共享清单
        </Button>
      </section>
      <div className="form-actions">
        <DraftLauncher
          draftKey={draftKey}
          payload={payload}
          title={`将选中 ${chosen.length} 项转入采购核对`}
          disabled={!chosen.length || chosen.length > 50}
        />
      </div>
      <p className="form-hint">
        最多选 50
        项；入库前填写实际数量、价格和保质期。部分采购会保留剩余需求，完整入库才归档。
      </p>
      <div className="inventory-grid">
        {active.map((item) => (
          <section
            className="panel shopping-card"
            key={item.id + "-" + item.version}
          >
            <label className="import-selection">
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              选择 {item.name} 进行入库核对
            </label>
            <h2>{item.name}</h2>
            <p className="inventory-quantity">
              {formatQuantity(
                Math.max(
                  0,
                  Number(item.quantity) - Number(item.stocked_quantity),
                ),
              )}{" "}
              <small>
                {item.unit} {item.status === "purchased" ? "待入库" : "待买"}
              </small>
            </p>
            <p className="form-hint">
              {item.status === "purchased" ? "已买，尚未入库" : "等待购买"}
              {Number(item.stocked_quantity) > 0
                ? ` · 已入库 ${formatQuantity(Number(item.stocked_quantity))} ${item.unit}`
                : ""}
            </p>
            <details>
              <summary>修改数量 / 标记已买 / 移除</summary>
              <ChangeShoppingForm item={item} requestId={requests[item.id]} />
            </details>
          </section>
        ))}
      </div>
      {!active.length && (
        <section className="panel empty-state">
          <h2>购物清单空空的</h2>
          <p>添加下一餐需要的食材，两个人刷新后都能看到。</p>
        </section>
      )}
      <section className="panel ledger-panel">
        <h2>最近 20 项已处理需求</h2>
        {recent.length ? (
          <ul className="purchase-history">
            {recent.map((i) => (
              <li key={i.id}>
                <strong>{i.name}</strong>
                <p>
                  {i.status === "stocked" ? "已完成入库" : "已移除"} · 已入库{" "}
                  {formatQuantity(Number(i.stocked_quantity))} {i.unit}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-hint">还没有处理记录。</p>
        )}
      </section>
    </>
  );
}
