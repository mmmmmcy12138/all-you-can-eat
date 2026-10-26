import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
export const metadata: Metadata = { title: "今天，想吃什么？" };
export default function Page() { return <><header className="page-header"><div><span className="eyebrow">MADE WITH LOVE</span><h1>今天，想吃什么？</h1><p>两个人的口味，一份共同的期待。</p></div></header><div className="phase-notice">基础界面预览 · 尚未连接 Supabase，不会读取或保存厨房数据。</div><section className="panel large-empty"><EmptyState title="收藏你们一起喜欢的味道" description="后续将接入家庭菜谱、双方点菜、用餐计划与完成烹饪后扣库存。" action="查看厨房准备进度"/></section></>; }
