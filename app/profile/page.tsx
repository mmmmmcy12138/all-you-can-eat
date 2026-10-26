import type { Metadata } from "next";
import Link from "next/link";
import { supabaseConfig } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { HouseholdForm, SignOutForm } from "@/components/auth/forms";
export const metadata: Metadata = { title: "我的厨房" };
export const dynamic = "force-dynamic";
export default async function Profile() {
  const heading = (
    <header className="page-header">
      <div>
        <span className="eyebrow">A HOME FOR TWO</span>
        <h1>一起，开启厨房生活</h1>
        <p>一屋两人，三餐四季。</p>
      </div>
    </header>
  );
  if (!supabaseConfig())
    return (
      <>
        {heading}
        <section className="panel auth-panel">
          <h2>连接你们的共享厨房</h2>
          <p>
            Phase 2 账号与家庭功能已实现，当前尚未配置
            Supabase，无法登录或保存家庭数据。
          </p>
          <ol className="setup-steps">
            <li>在 Supabase 创建项目并应用数据库迁移。</li>
            <li>配置邮箱认证、站点 URL 和确认回调地址。</li>
            <li>在云环境或 Vercel 配置公开 URL 与 Publishable Key。</li>
          </ol>
          <Link href="/login" className="button button-primary">
            查看登录入口
          </Link>
          <p className="form-hint">不会生成演示账号或虚构家庭数据。</p>
        </section>
      </>
    );
  const client = await supabaseServer();
  let user;
  try {
    const result = await client.auth.getUser();
    user = result.data.user;
  } catch {
    return (
      <>
        {heading}
        <section className="panel">
          <p role="alert">认证服务无法连接，请检查网络和项目配置。</p>
        </section>
      </>
    );
  }
  if (!user)
    return (
      <>
        {heading}
        <section className="panel auth-panel">
          <h2>两个人，两个独立账号</h2>
          <p>注册或登录后，创建家庭或接受对方邀请。</p>
          <Link href="/login" className="button button-primary">
            登录 / 注册
          </Link>
        </section>
      </>
    );
  const [profileResult, membershipResult] = await Promise.all([
    client.from("profiles").select("display_name").eq("id", user.id).single(),
    client
      .from("household_members")
      .select("id,household_id,role")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (profileResult.error || membershipResult.error)
    return (
      <>
        {heading}
        <section className="panel">
          <p role="alert">
            无法读取个人或家庭数据。请确认迁移已应用且数据库可访问。
          </p>
          <SignOutForm />
        </section>
      </>
    );
  const member = membershipResult.data;
  const account = (
    <section className="panel">
      <h2>个人资料</h2>
      <p>{user.email}</p>
      <HouseholdForm
        operation="profile"
        title="保存昵称"
        defaultValue={profileResult.data.display_name}
      />
      <SignOutForm />
    </section>
  );
  if (!member)
    return (
      <>
        {heading}
        <div className="account-grid">
          {account}
          <section className="panel">
            <h2>创建我们的厨房</h2>
            <HouseholdForm operation="create" title="创建家庭" />
            <Link href="/join" className="text-link">
              已有邀请？加入家庭 →
            </Link>
          </section>
        </div>
      </>
    );
  const [houseResult, membersResult, invitesResult] = await Promise.all([
    client
      .from("households")
      .select("name")
      .eq("id", member.household_id)
      .single(),
    client
      .from("household_members")
      .select("id,user_id,role")
      .eq("household_id", member.household_id),
    member.role === "owner"
      ? client
          .from("household_invitations")
          .select("id,expires_at,used_at,revoked_at")
          .eq("household_id", member.household_id)
          .is("used_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (houseResult.error || membersResult.error || invitesResult.error)
    return (
      <>
        {heading}
        {account}
        <section className="panel">
          <p role="alert">家庭数据读取失败，请稍后重试。</p>
        </section>
      </>
    );
  const ids = membersResult.data.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id,display_name")
    .in("id", ids);
  return (
    <>
      {heading}
      <div className="account-grid">
        {account}
        <section className="panel">
          <h2>{houseResult.data.name}</h2>
          <p>
            你的角色：{member.role === "owner" ? "Owner" : "Member"} ·{" "}
            {membersResult.data.length}/2 名成员
          </p>
          {profilesError && <p role="alert">成员昵称读取失败</p>}
          <ul className="member-list">
            {membersResult.data.map((m) => (
              <li key={m.id}>
                <strong>
                  {profiles?.find((p) => p.id === m.user_id)?.display_name ||
                    "未设置昵称"}
                </strong>
                <span>{m.role === "owner" ? "Owner" : "Member"}</span>
                {member.role === "owner" && m.role === "member" && (
                  <HouseholdForm
                    operation="remove"
                    title="移除成员"
                    id={m.id}
                  />
                )}
              </li>
            ))}
          </ul>
          {member.role === "owner" && (
            <>
              <HouseholdForm
                operation="rename"
                title="修改家庭名称"
                defaultValue={houseResult.data.name}
              />
              {membersResult.data.length < 2 && (
                <HouseholdForm
                  operation="invite"
                  title="生成 48 小时单次邀请"
                />
              )}
              {invitesResult.data?.map((inv) => (
                <div key={inv.id} className="invitation-result">
                  <p>
                    有效邀请 · 到期：
                    {new Date(inv.expires_at).toLocaleString("zh-CN", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </p>
                  <HouseholdForm
                    operation="revoke"
                    title="撤销邀请"
                    id={inv.id}
                  />
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}
