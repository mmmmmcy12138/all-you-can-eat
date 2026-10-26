import Link from "next/link";
import {
  ArrowRight,
  Heart,
  Sparkles,
  Plus,
  CalendarDays,
  ShoppingBasket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Today } from "@/components/today";
import { EmptyState } from "@/components/empty-state";
import { kitchenContext } from "@/lib/kitchen/context";
import { supabaseServer } from "@/lib/supabase/server";
import { readInventory } from "@/lib/inventory/read";
import { KitchenGate } from "@/components/inventory/kitchen-gate";
import { HomeStats } from "@/components/inventory/home-stats";
export const dynamic = "force-dynamic";
export default async function Home() {
  const context = await kitchenContext();
  const [inventory, shopping] =
    context.status === "ready"
      ? await Promise.all([
          readInventory(context.householdId),
          (await supabaseServer()).rpc("read_shopping_list"),
        ])
      : [null, null];
  const shoppingCounts =
    shopping &&
    !shopping.error &&
    shopping.data?.household_id ===
      (context.status === "ready" ? context.householdId : null) &&
    Array.isArray(shopping.data?.active)
      ? {
          pending: shopping.data.active.filter(
            (item: { status: string }) => item.status === "open",
          ).length,
          unstocked: shopping.data.active.filter(
            (item: { status: string }) => item.status === "purchased",
          ).length,
        }
      : null;
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">
            <span className="status-dot" />
            OUR LITTLE KITCHEN{" "}
            <span className="date">
              <Today />
            </span>
          </div>
          <h1>
            {context.status === "ready"
              ? `${context.displayName}，欢迎回到厨房`
              : "把每一餐，过成小确幸"}
            <span className="heading-leaf"> ✳</span>
          </h1>
          <p>
            {context.status === "ready"
              ? `${context.householdName} · ${context.members}/2 位成员 · 新鲜与期待，一起分享。`
              : "冰箱里的新鲜，餐桌上的期待，都在这里。"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link
            href={context.status === "ready" ? "/shopping/new" : "/profile"}
          >
            <Plus size={17} />
            {context.status === "ready" ? "记一笔采购" : "准备我们的厨房"}
          </Link>
        </Button>
      </header>
      <section className="hero" aria-labelledby="dinner-title">
        <div className="hero-copy">
          <span className="pill">
            <Sparkles size={14} /> 两个人的晚餐时光
          </span>
          <h2 id="dinner-title">
            今晚吃什么？
            <br />
            <span>从一顿好饭开始。</span>
          </h2>
          <p>
            先把新鲜放进冰箱，再慢慢安排喜欢的味道。
            <br />
            一份真实的采购，是下一餐的开始。
          </p>
          <Button asChild>
            <Link
              href={context.status === "ready" ? "/shopping/new" : "/profile"}
            >
              {context.status === "ready" ? "把新鲜带回家" : "开启共享厨房"}
              <ArrowRight size={17} />
            </Link>
          </Button>
          <small>
            <Heart size={13} />
            每一餐，都是一起生活的仪式感
          </small>
        </div>
        <div className="food-art" aria-hidden="true">
          <span className="art-label">FRESH & FULL OF LOVE</span>
          <div className="plate">
            <div className="salad">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <b />
              <b />
              <b />
              <em />
              <em />
              <em />
            </div>
          </div>
          <span className="art-herb">✳</span>
          <span className="art-caption">今天也要 · 好好吃饭</span>
        </div>
      </section>
      {context.status !== "ready" && (
        <div className="home-context">
          <KitchenGate context={context} />
        </div>
      )}
      {inventory && !inventory.ok && (
        <section className="panel home-context">
          <p role="alert">{inventory.message}</p>
          <p className="form-hint">统计暂不可用，不代表冰箱为空。</p>
        </section>
      )}
      <HomeStats
        shoppingCounts={shoppingCounts}
        householdReady={context.status === "ready"}
        lots={inventory?.ok ? inventory.lots : []}
        available={context.status === "ready" && !!inventory?.ok}
      />
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A LITTLE INSPIRATION</span>
              <h2>今日灵感</h2>
            </div>
          </div>
          <EmptyState
            title="先装满冰箱，再安排好味道"
            description="菜谱与推荐尚未开放。之后会依据你们的真实库存和喜好推荐，不会虚构菜品或评分。"
            action="看看我们的冰箱"
            href="/fridge"
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FRESHNESS FIRST</span>
              <h2>别让新鲜等太久</h2>
            </div>
          </div>
          <EmptyState
            title={
              inventory?.ok && inventory.lots.length
                ? "去冰箱看看每一批新鲜"
                : "新鲜记录，从第一笔开始"
            }
            description="冰箱可按已过期、三天内到期和未知到期日筛选；保质期未知的批次会明确标记。"
            action="查看批次与保质期"
            href="/fridge"
          />
        </section>
      </div>
      <section className="together">
        <div className="together-icon">
          <Heart size={25} />
        </div>
        <div>
          <span className="eyebrow">BETTER TOGETHER</span>
          <h2>你想吃的，我都记得。</h2>
          <p>
            {context.status === "ready"
              ? "你们已在同一个家庭，采购与库存由两人共享。"
              : "创建共享厨房，让两个人一起管理新鲜。"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/profile">
            {context.status === "ready" ? "管理我们的家庭" : "开启双人厨房"}
            <ArrowRight size={16} />
          </Link>
        </Button>
      </section>
      <section className="quick-links" aria-label="快捷入口">
        <Link href="/fridge">
          <Plus size={18} />
          食材与库存
          <ArrowRight size={16} />
        </Link>
        <Link href="/shopping">
          <ShoppingBasket size={18} />
          采购与历史记录
          <ArrowRight size={16} />
        </Link>
        <Link href="/menu">
          <CalendarDays size={18} />
          用餐计划（待开放）
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
