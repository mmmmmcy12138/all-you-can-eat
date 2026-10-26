import Link from "next/link";
import type { KitchenContext } from "@/lib/kitchen/context";
export function KitchenGate({
  context,
}: {
  context: Exclude<KitchenContext, { status: "ready" }>;
}) {
  return (
    <section className="panel empty-state">
      <h2>
        {context.status === "error"
          ? "厨房暂时开了个小差"
          : context.status === "no-household"
            ? "先把我们的厨房准备好"
            : "欢迎来到 AYCE"}
      </h2>
      <p role={context.status === "error" ? "alert" : undefined}>
        {context.message}
      </p>
      <Link
        className="button button-primary"
        href={context.status === "signed-out" ? "/login" : "/profile"}
      >
        {context.status === "signed-out"
          ? "登录 / 注册"
          : context.status === "no-household"
            ? "创建或加入家庭"
            : context.status === "error"
              ? "检查账号与家庭"
              : "查看配置说明"}
      </Link>
    </section>
  );
}
