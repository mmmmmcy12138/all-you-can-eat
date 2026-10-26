import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { JoinForm } from "@/components/auth/forms";
export const dynamic = "force-dynamic";
export default async function Join() {
  let loggedIn = false;
  if (supabaseConfig()) {
    try {
      const client = await supabaseServer();
      const {
        data: { user },
      } = await client.auth.getUser();
      loggedIn = !!user;
    } catch {}
  }
  return (
    <>
      <header className="page-header">
        <div>
          <span className="eyebrow">BETTER TOGETHER</span>
          <h1>加入我们的厨房</h1>
          <p>请向家庭 Owner 获取私密邀请代码。</p>
        </div>
      </header>
      <section className="panel auth-panel">
        {loggedIn ? (
          <JoinForm />
        ) : (
          <>
            <p>
              请先配置 Supabase
              并登录自己的账号。登录后重新打开邀请链接，或回到这里粘贴代码。
            </p>
            <Link href="/login" className="button button-primary">
              前往登录
            </Link>
          </>
        )}
      </section>
    </>
  );
}
