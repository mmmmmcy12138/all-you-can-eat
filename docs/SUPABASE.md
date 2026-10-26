# Phase 2 · Supabase 云端配置

代码与数据库隔离测试已实现；连接托管项目、真实邮件和双账号浏览器验收仍需你的项目配置。无需在自己的电脑安装软件。

## 1. 创建项目

登录 Supabase Dashboard → New project，免费方案即可。选择组织、名称及适合的区域，设置数据库强密码并自行保管。等待项目可用。无需把数据库密码或 service role key 发给 Codex。

在项目 Connect 或 Settings → API / API Keys 查找 Project URL 和 Publishable Key（`sb_publishable_...`）。本项目使用 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；不使用 service role key，也不需要服务端管理员密钥。

## 2. 应用迁移

在项目 SQL Editor 创建查询，复制并执行仓库中 `supabase/migrations/202610260001_households.sql` 的**完整内容**。在新项目执行一次；不要重复执行建表迁移，也不要在已有业务数据库上盲目运行。该文件会创建 4 张业务表、索引、约束、Auth 用户触发器、RLS 和家庭事务 RPC。

执行身份为项目数据库管理者。迁移会为已有 auth.users 补建 profiles，后续新用户由触发器自动建档。不会添加演示用户或家庭。

当前只有 Phase 2 表：profiles、households、household_members、household_invitations。食材、库存等其余业务表在对应阶段实现；图片上传未启用，因此当前无需 Storage bucket。

## 3. 认证配置

Authentication → Sign In / Providers → Email：开启邮箱注册和邮箱确认。密码最低长度建议设为 10（应用也会检查）。测试时使用自己的两个不同邮箱。

Authentication → URL Configuration：

- Site URL：最终 Vercel 的 HTTPS 站点域名。
- Redirect URLs：添加该站点的 `https://你的域名/auth/callback`。
- 若需要 Vercel Preview 注册确认，添加明确的 Preview 回调地址；不要将任意域名设为允许重定向。

应用通过 SSR PKCE 的 `code` 回调交换会话，保持 Supabase 默认确认邮件里的 `ConfirmationURL`。从发起注册的同一浏览器打开邮件确认链接；在另一台设备打开可能缺少 PKCE verifier，需要回到原浏览器重试。部署站点之前可以先完成数据库配置，真实邮件与登录验收等站点可访问后再做。免费默认邮件服务可能有限流或收件人限制；正式使用时按 Supabase 提示配置自己的 SMTP。

## 4. 云环境与 Vercel 变量

在 Codex 云环境设置和 Vercel 项目相应 Preview/Production 设置中添加：

```text
NEXT_PUBLIC_SUPABASE_URL=https://你的项目编号.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的项目公开PublishableKey
```

不要将值写入 Git，不要发数据库密码。`.env.example` 仅包含变量名称。环境变量模板不是已完成配置的证据。

这些 `NEXT_PUBLIC_` 配置是公开项目连接配置，不是服务端权限绕过凭据。权限依赖用户 JWT、RLS 和数据库函数。应用明确不使用 service role key。修改配置后重新构建并重启；Vercel 中重新部署，让运行版本读到新配置。

Codex 受限网络还需要允许**该项目的准确域名**（例如 `abc123.supabase.co`）。仅保存 URL 变量不会添加网络访问权限。项目 URL 确定后将准确域名加入环境网络允许列表，保留其他现有规则，不需要开放全部 `*.supabase.co`。

## 5. 双账号验收

1. 在浏览器 A 打开 `/login`，注册账号 A，完成邮箱确认后登录。
2. 在 `/profile` 修改昵称，创建家庭；刷新后核对家庭名称和 Owner 角色。
3. 点击生成邀请：得到 48 小时单次代码和含 `#invite=` 的链接。私下分享链接；原始代码只显示一次，数据库只存 SHA-256 哈希。新邀请立即使旧邀请失效。
4. 浏览器 B（另一个浏览器或独立会话）注册并登录账号 B。打开邀请链接，检查自动填入的代码，点击确认加入。若首次打开尚未登录，请登录后重新打开原链接，或在 `/join` 粘贴代码。
5. 两边刷新 `/profile`，应显示同一个家庭、两个成员。B 为 Member，不能修改家庭、移除成员或发邀请。两人都能修改自己的昵称。
6. 在第三个独立账号 C 中验证：不能读 A/B 的 profiles、household_members 或 households；不能使用直接 REST 写入提升角色；过期、撤销或已用邀请都不能加入。
7. A 移除 B 后，B 刷新应失去家庭访问。A 不能移除 Owner 自己。V1 暂不支持转移 Owner、家庭删除或用户自助注销，避免未经设计的数据生命周期操作。
8. 网络断开或 Supabase 返回失败时，页面必须显示失败而不是“已保存”。确认退出登录后不再显示家庭信息。

当前浏览器自动化覆盖未配置状态及错误回调，数据库权限使用真实 PostgreSQL 引擎 PGlite 验证。托管 Supabase 邮件、cookie 刷新及双浏览器真实登录不在该测试的覆盖范围；以上验收必须在配置项目后执行。

## 数据安全设计

- `household_members.user_id` 唯一：关系模型支持家庭成员表，V1 一个用户最多一个家庭。
- 每个家庭只有一个 Owner，人数由事务函数在锁住家庭行后检查，最多两人。
- 客户端不能直接增删改家庭、成员和邀请，只能调用以 `auth.uid()` 推导身份的 RPC；不接受客户端声明自己是 Owner。
- 所有 4 表启用 RLS。profiles 只对本人和同家庭成员可读；只可更新自己的 display_name。成员删除后访问即时随成员关系失效。
- 邀请的 2 个 UUIDv4 组成高熵随机代码；数据库只保存哈希；原始 token 不记录在服务端 URL 查询中。邀请链接用 fragment，仍应私下分享并在共享设备上清理浏览记录。
- `SECURITY DEFINER` 函数固定空 search_path，所有表带 schema，显式撤销匿名 EXECUTE。客户端无权读 token_hash。
- 创建/加入先锁 caller profile，再锁家庭和邀请；成员唯一约束、家庭行锁与一次性消费更新共同限制竞态。PGlite 测试是单连接串行数据库测试，**不代表已完成托管环境多连接压力/并发验收**。
- 后续库存/菜谱表必须使用 `(household_id, entity_id)` 组合外键或等效数据库检查，禁止跨家庭关联。当前不存在这些表，不能声称已验证后续库存引用安全。
