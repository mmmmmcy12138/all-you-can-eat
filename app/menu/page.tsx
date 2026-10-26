import { kitchenContext } from "@/lib/kitchen/context";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { EmptyState } from "@/components/empty-state";
export const dynamic = "force-dynamic";
export default async function Menu() {
  const context = await kitchenContext();
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">MADE WITH LOVE</span>
          <h1>今天，想吃什么？</h1>
          <p>
            {context.status === "ready"
              ? `${context.householdName} · 两个人的口味，一份共同的期待。`
              : "两个人的口味，一份共同的期待。"}
          </p>
        </div>
      </header>
      {context.status !== "ready" ? (
        <KitchenGate context={context} />
      ) : (
        <>
          <div className="phase-notice">
            家庭已连接 · 菜谱和点菜功能尚未开放，库存与采购可以先用起来。
          </div>
          <section className="panel large-empty">
            <EmptyState
              title="收藏你们一起喜欢的味道"
              description="后续将接入家庭菜谱、双方点菜和用餐计划。当前点菜不产生库存扣减。"
              action="先看看真实库存"
              href="/fridge"
            />
          </section>
        </>
      )}
    </>
  );
}
