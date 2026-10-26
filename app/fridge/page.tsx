import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
export const metadata: Metadata = { title: "我们的冰箱" };
export default function Page() { return <><header className="page-header"><div><span className="eyebrow">FRESH & ORGANIZED</span><h1>我们的冰箱</h1><p>让每一份新鲜，都有自己的位置。</p></div></header><div className="phase-notice">基础界面预览 · 尚未连接 Supabase，不会读取或保存厨房数据。</div><section className="panel large-empty"><EmptyState title="冰箱的故事，从第一份食材开始" description="下一阶段将支持食材目录、多批次库存、临期提醒与库存流水。" action="查看厨房准备进度"/></section></>; }
