import Link from "next/link";
import { kitchenContext } from "@/lib/kitchen/context";
import { readInventory } from "@/lib/inventory/read";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { FridgeList } from "@/components/inventory/fridge-list";
export const dynamic = "force-dynamic";
export default async function Fridge() {
  const context = await kitchenContext();
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">FRESH & ORGANIZED</span>
          <h1>我们的冰箱</h1>
          <p>
            {context.status === "ready"
              ? `${context.householdName} · 每一份新鲜，都有自己的位置。`
              : "让每一份新鲜，都有自己的位置。"}
          </p>
        </div>
        {context.status === "ready" && (
          <Link href="/shopping/new" className="button button-primary">
            ＋ 采购入库
          </Link>
        )}
      </header>
      {context.status !== "ready" ? (
        <KitchenGate context={context} />
      ) : (
        await Content(context.householdId)
      )}
    </>
  );
}
async function Content(householdId: string) {
  const inventory = await readInventory(householdId);
  if (!inventory.ok)
    return (
      <section className="panel">
        <p role="alert">{inventory.message}</p>
        <p className="form-hint">读取失败不代表冰箱为空，请稍后刷新重试。</p>
      </section>
    );
  return (
    <FridgeList ingredients={inventory.ingredients} lots={inventory.lots} />
  );
}
