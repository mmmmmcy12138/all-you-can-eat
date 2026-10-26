import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseConfig } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth/forms";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const configured = !!supabaseConfig();
  if (configured) {
    let loggedIn = false;
    try {
      const client = await supabaseServer();
      const {
        data: { user },
      } = await client.auth.getUser();
      loggedIn = !!user;
    } catch {
      /* Show the form so transient auth failures can be retried. */
    }
    if (loggedIn) redirect("/profile");
  }
  const { error, notice } = await searchParams;
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">WELCOME TO AYCE</span>
          <h1>欢迎回到厨房</h1>
          <p>用自己的账号，共享同一个家。</p>
        </div>
      </header>
      <section className="panel auth-panel">
        {notice === "confirmation-signin" && (
          <p role="status" className="form-success">
            当前浏览器无法自动登录。若邮箱已确认，请直接用注册邮箱和密码登录，无需重新注册。也可以回到注册时的浏览器打开确认邮件。
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error === "auth-service"
              ? "认证服务暂时无法连接，请稍后重试。"
              : "无法完成此次自动登录，链接可能已过期或已使用。若邮箱已确认，请直接登录，无需重新注册。"}
          </p>
        )}
        {configured ? (
          <AuthForm />
        ) : (
          <>
            <h2>尚未连接 Supabase</h2>
            <p>
              请按照 README 配置公开项目 URL、Publishable Key
              并应用数据库迁移。当前不会模拟登录或注册。
            </p>
            <Link href="/profile" className="text-link">
              查看准备进度
            </Link>
          </>
        )}
      </section>
    </>
  );
}
