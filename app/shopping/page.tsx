import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
export const metadata: Metadata = { title: "把期待，带回家" };
export default function Page() { return <><header className="page-header"><div><span className="eyebrow">A BASKET OF GOOD THINGS</span><h1>把期待，带回家</h1><p>少一份遗漏，多一份刚刚好。</p></div></header><div className="phase-notice">基础界面预览 · 尚未连接 Supabase，不会读取或保存厨房数据。</div><section className="panel large-empty"><EmptyState title="下一顿好饭，从采购开始" description="后续将支持共享购物清单、小票文字核对与事务入库。" action="查看厨房准备进度"/></section></>; }
