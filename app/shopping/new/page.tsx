import { randomUUID } from "node:crypto";
import { kitchenContext } from "@/lib/kitchen/context";
import { readInventory } from "@/lib/inventory/read";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { PurchaseForm } from "@/components/inventory/purchase-form";
export const dynamic = "force-dynamic";
export default async function NewPurchase() {
  const context = await kitchenContext();
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">BRING GOOD THINGS HOME</span>
          <h1>记一笔采购</h1>
          <p>新鲜入库，也把每一笔记清楚。</p>
        </div>
      </header>
      {context.status !== "ready" ? (
        <KitchenGate context={context} />
      ) : (
        await Content(context.householdId, context.userId)
      )}
    </>
  );
}
async function Content(householdId: string, userId: string) {
  const inventory = await readInventory(householdId);
  if (!inventory.ok)
    return (
      <section className="panel">
        <p role="alert">{inventory.message}</p>
      </section>
    );
  return (
    <PurchaseForm
      ingredients={inventory.ingredients}
      draftKey={`ayce-purchase-${householdId}-${userId}`}
      initialRequestId={randomUUID()}
    />
  );
}
