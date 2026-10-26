import Link from "next/link";
import { kitchenContext } from "@/lib/kitchen/context";
import { supabaseServer } from "@/lib/supabase/server";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
export const dynamic = "force-dynamic";
export default async function Shopping() {
  const context = await kitchenContext();
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">A BASKET OF GOOD THINGS</span>
          <h1>把期待，带回家</h1>
          <p>
            {context.status === "ready"
              ? `${context.householdName} · 把采购和新鲜一起记下来。`
              : "少一份遗漏，多一份刚刚好。"}
          </p>
        </div>
        {context.status === "ready" && (
          <Link href="/shopping/new" className="button button-primary">
            ＋ 记一笔采购
          </Link>
        )}
      </header>
      {context.status !== "ready" ? (
        <KitchenGate context={context} />
      ) : (
        await History(context.householdId)
      )}
    </>
  );
}
async function History(householdId: string) {
  try {
    const client = await supabaseServer();
    const { data, error } = await client
      .from("purchases")
      .select("id,purchased_on,store_name,note,created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error)
      return (
        <section className="panel">
          <p role="alert">
            采购记录读取失败，请确认库存迁移已执行，或稍后重试。已有家庭资料不会受影响。
          </p>
        </section>
      );
    return (
      <>
        <div className="form-actions">
          <Link href="/shopping/list" className="button button-primary">
            打开共享购物清单 →
          </Link>
        </div>
        <section className="together">
          <div>
            <h2>从一笔真实采购开始</h2>
            <p>
              先把待买需求放进两个人的共享清单，实际采购后再核对入库。也支持直接手动填写或粘贴文字。
            </p>
          </div>
          <Link href="/shopping/new" className="button button-primary">
            开始入库 →
          </Link>
        </section>
        <section className="panel ledger-panel">
          <h2>最近 20 笔采购</h2>
          {data.length ? (
            <ul className="purchase-history">
              {data.map((p) => (
                <li key={p.id}>
                  <Link href={`/shopping/history/${p.id}`}>
                    <strong>{p.store_name || "未填写商店"}</strong>
                    <span>{p.purchased_on}</span>
                    <p>{p.note || "查看这笔采购的明细与价格"}</p>
                    <span className="text-link">查看采购单 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <h3>还没有采购记录</h3>
              <p>录入第一笔后，两位家庭成员都能在这里看到。</p>
              <Link className="button button-primary" href="/shopping/new">
                记一笔采购
              </Link>
            </div>
          )}
        </section>
      </>
    );
  } catch {
    return (
      <section className="panel">
        <p role="alert">采购服务无法连接，请稍后刷新重试。</p>
      </section>
    );
  }
}
