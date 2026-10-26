import Link from "next/link";
import { randomUUID } from "node:crypto";
import { kitchenContext } from "@/lib/kitchen/context";
import { readInventory } from "@/lib/inventory/read";
import { supabaseServer } from "@/lib/supabase/server";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { AddShoppingForm } from "@/components/shopping/list-forms";
import { ShoppingList } from "@/components/shopping/list";
import type { ShoppingItem } from "@/lib/shopping/types";
export const dynamic = "force-dynamic";
export default async function ListPage() {
  const context = await kitchenContext();
  if (context.status !== "ready")
    return (
      <>
        <h1>两个人的购物清单</h1>
        <KitchenGate context={context} />
      </>
    );
  const client = await supabaseServer();
  const [inventory, result] = await Promise.all([
    readInventory(context.householdId),
    client.rpc("read_shopping_list"),
  ]);
  const header = (
    <header className="page-header">
      <div>
        <span className="eyebrow">A SHARED LITTLE LIST</span>
        <h1>两个人的购物清单</h1>
        <p>{context.householdName} · 缺什么，一起记。</p>
      </div>
      <Link href="/shopping" className="button button-outline">
        返回采购
      </Link>
    </header>
  );
  if (
    !inventory.ok ||
    result.error ||
    result.data?.household_id !== context.householdId ||
    !Array.isArray(result.data?.active) ||
    !Array.isArray(result.data?.recent)
  )
    return (
      <>
        {header}
        <section className="panel">
          <p role="alert">
            购物清单暂时无法读取，请确认清单迁移已执行，或稍后重试。原有采购和库存功能仍可使用。
          </p>
        </section>
      </>
    );
  const active = result.data.active as ShoppingItem[];
  const recent = result.data.recent as ShoppingItem[];
  return (
    <>
      {header}
      <AddShoppingForm
        ingredients={inventory.ingredients}
        requestId={randomUUID()}
      />
      <ShoppingList
        active={active}
        recent={recent}
        ingredients={inventory.ingredients}
        draftKey={`ayce-purchase-${context.householdId}-${context.userId}`}
        requests={Object.fromEntries(active.map((i) => [i.id, randomUUID()]))}
      />
    </>
  );
}
