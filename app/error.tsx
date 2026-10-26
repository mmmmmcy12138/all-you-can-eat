"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty-state">
      <h2>厨房暂时开了个小差</h2>
      <p role="alert">
        页面未能完整加载。请重试；如果刚提交过采购，请保留原草稿，避免另建相同采购。
      </p>
      <Button onClick={reset}>重新加载页面</Button>
    </section>
  );
}
