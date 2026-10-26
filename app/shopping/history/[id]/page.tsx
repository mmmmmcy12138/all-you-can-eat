import Link from "next/link";
import { notFound } from "next/navigation";
import { kitchenContext } from "@/lib/kitchen/context";
import { supabaseServer } from "@/lib/supabase/server";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { formatQuantity } from "@/lib/inventory/quantities";
export const dynamic = "force-dynamic";
export default async function PurchaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await kitchenContext();
  if (context.status !== "ready") return <KitchenGate context={context} />;
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const client = await supabaseServer();
  const [purchase, items] = await Promise.all([
    client
      .from("purchases")
      .select("id,store_name,purchased_on,note")
      .eq("household_id", context.householdId)
      .eq("id", id)
      .maybeSingle(),
    client
      .from("purchase_items")
      .select("id,ingredient_id,quantity,unit,total_cost,ingredients(name)")
      .eq("household_id", context.householdId)
      .eq("purchase_id", id)
      .order("line_number")
      .limit(50),
  ]);
  if (purchase.error || items.error)
    return (
      <section className="panel">
        <p role="alert">采购单读取失败，请稍后重试。</p>
      </section>
    );
  if (!purchase.data) notFound();
  const completePrice = items.data.every((i) => i.total_cost !== null);
  const cents = items.data.reduce(
    (total, item) =>
      total +
      (item.total_cost === null
        ? 0
        : Math.round(Number(item.total_cost) * 100)),
    0,
  );
  return (
    <>
      <Link href="/shopping" className="text-link">
        ← 采购历史
      </Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">PURCHASE RECEIPT</span>
          <h1>{purchase.data.store_name || "采购记录"}</h1>
          <p>
            {purchase.data.purchased_on} · {items.data.length} 项商品
          </p>
        </div>
      </header>
      <section className="panel">
        <p>{purchase.data.note || "没有采购备注"}</p>
        <ul className="purchase-history">
          {items.data.map((item) => {
            const embedded = item.ingredients as unknown as {
              name: string;
            } | null;
            return (
              <li key={item.id}>
                <Link href={`/fridge/${item.ingredient_id}`}>
                  <strong>{embedded?.name || "食材"}</strong>
                  <span>
                    {formatQuantity(Number(item.quantity))} {item.unit}
                  </span>
                  <p>
                    {item.total_cost === null
                      ? "价格未记录"
                      : `商品行总价 $${Number(item.total_cost).toFixed(2)}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
        <p>
          <strong>
            {completePrice ? "总价" : "已记录价格小计"}：$
            {(cents / 100).toFixed(2)} USD
          </strong>
        </p>
        {!completePrice && (
          <p className="form-hint">
            部分商品价格未知，小计不代表整张采购单总价。
          </p>
        )}
      </section>
    </>
  );
}
