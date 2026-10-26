import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { kitchenContext } from "@/lib/kitchen/context";
import { readInventory } from "@/lib/inventory/read";
import { formatQuantity, sumQuantities } from "@/lib/inventory/quantities";
import type { StockMovement } from "@/lib/inventory/types";
import { supabaseServer } from "@/lib/supabase/server";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { AdjustForm } from "@/components/inventory/adjust-form";
export const dynamic = "force-dynamic";
export default async function IngredientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await kitchenContext();
  if (context.status !== "ready") return <KitchenGate context={context} />;
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const inventory = await readInventory(context.householdId);
  if (!inventory.ok)
    return (
      <section className="panel">
        <p role="alert">{inventory.message}</p>
      </section>
    );
  const food = inventory.ingredients.find((i) => i.id === id);
  if (!food) notFound();
  const lots = inventory.lots
    .filter((l) => l.ingredient_id === id)
    .sort(
      (a, b) =>
        (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999") ||
        a.created_at.localeCompare(b.created_at),
    );
  const client = await supabaseServer();
  const movements = await client
    .from("stock_movements")
    .select(
      "id,stock_lot_id,actor_id,kind,quantity_delta,quantity_after,note,created_at,stock_lots!inner(ingredient_id)",
    )
    .eq("household_id", context.householdId)
    .eq("stock_lots.ingredient_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  const profiles = await client.from("profiles").select("id,display_name");
  const names = new Map(
    (profiles.data ?? []).map((p) => [p.id, p.display_name]),
  );
  return (
    <>
      <Link className="text-link" href="/fridge">
        ← 返回冰箱
      </Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">{food.category}</span>
          <h1>{food.name}</h1>
          <p>
            当前总量 {formatQuantity(sumQuantities(lots))} {food.base_unit} ·{" "}
            {lots.length} 个历史批次
          </p>
        </div>
      </header>
      <div className="inventory-grid">
        {lots.map((lot, index) => (
          <section className="panel" key={lot.id}>
            <h2>
              批次 {index + 1} · {formatQuantity(Number(lot.current_quantity))}{" "}
              {lot.unit}
            </h2>
            <dl className="lot-facts">
              <div>
                <dt>原始入库</dt>
                <dd>
                  {formatQuantity(Number(lot.initial_quantity))} {lot.unit}
                </dd>
              </div>
              <div>
                <dt>采购日期</dt>
                <dd>{lot.purchased_on}</dd>
              </div>
              <div>
                <dt>到期日期</dt>
                <dd>{lot.expires_on ?? "未知"}</dd>
              </div>
              <div>
                <dt>存放位置</dt>
                <dd>{lot.storage_location}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{lot.source || "未填写"}</dd>
              </div>
              <div>
                <dt>商品行总价</dt>
                <dd>
                  {lot.total_cost === null
                    ? "未记录"
                    : `$${Number(lot.total_cost).toFixed(2)}`}
                </dd>
              </div>
            </dl>
            <details>
              <summary>盘点调整 / 报损</summary>
              <AdjustForm
                key={lot.id}
                lotId={lot.id}
                quantity={Number(lot.current_quantity)}
                unit={lot.unit}
                requestId={randomUUID()}
              />
            </details>
          </section>
        ))}
      </div>
      <section className="panel ledger-panel">
        <h2>最近 100 条库存流水</h2>
        {profiles.error && (
          <p className="form-hint">成员昵称暂时无法加载，显示操作用户编号。</p>
        )}
        {movements.error ? (
          <p role="alert">流水读取失败，请稍后重试。</p>
        ) : (
          <ul className="ledger-list">
            {(movements.data as unknown as StockMovement[]).map((m) => (
              <li key={m.id}>
                <div>
                  <strong>
                    {
                      (
                        {
                          PURCHASE: "采购入库",
                          ADJUSTMENT: "盘点调整",
                          WASTE: "报损",
                          COOK: "烹饪消耗",
                        } as Record<string, string>
                      )[m.kind]
                    }
                  </strong>
                  <span>
                    {Number(m.quantity_delta) > 0 ? "+" : ""}
                    {formatQuantity(Number(m.quantity_delta))} {food.base_unit}{" "}
                    → 剩余 {formatQuantity(Number(m.quantity_after))}
                  </span>
                </div>
                <p>{m.note || "无备注"}</p>
                <small>
                  {names.get(m.actor_id) || `用户 ${m.actor_id.slice(0, 8)}`} ·{" "}
                  {new Date(m.created_at)
                    .toISOString()
                    .replace("T", " ")
                    .slice(0, 19)}{" "}
                  UTC · 批次 {m.stock_lot_id.slice(0, 8)}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
