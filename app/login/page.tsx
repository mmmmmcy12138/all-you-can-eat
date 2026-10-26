import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseConfig } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth/forms";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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
  const { error } = await searchParams;
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
        {error && (
          <p role="alert" className="form-error">
            邮箱确认链接无效、已过期或不属于当前浏览器，请重新注册确认或登录。
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
