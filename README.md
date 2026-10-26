# All You Can Eat · AYCE

双人共享的家庭厨房。把每一餐，过成小确幸。

## 当前进度：Phase 2（代码与离线数据库验收完成，待托管项目连接）

Phase 1 的响应式中文界面、五栏导航、主题和 CI 已保留。新增 Supabase SSR 邮箱注册/登录/退出、PKCE 确认回调、个人昵称、创建家庭、Owner 管理、48 小时单次邀请链接/代码、成员加入与移除。

已提供完整 Phase 2 SQL migration、4 表 RLS、最小权限 grants、哈希邀请和事务锁。数据库测试用 PGlite 真实 PostgreSQL 引擎执行 migration，不依赖外部密钥。

**当前云环境尚未配置真实 Supabase 项目。** 未配置时明确显示说明，不会虚构登录或保存成功。库存、菜谱、采购和推荐仍在后续阶段；首页库存统计是明确的未接入占位。Manifest 已提供，完整 Service Worker/PWA 安装验收留到 Phase 5。

## 完全云端开发

无需安装 VS Code 或在个人电脑安装 Node.js。通过 Codex Cloud 操作此仓库。使用 Node.js 24（`.nvmrc`）和 npm，Codex Cloud 中使用 `export npm_config_cache=/workspace/.npm-cache` 将 npm 缓存放在可写目录；Vercel 和 GitHub Actions 使用平台默认缓存。环境已隔离，直接使用现有 checkout，不创建 worktree。

在 `/workspace/all-you-can-eat` 执行：

```sh
npm ci
npm run dev
```

生产模式验证：

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

浏览器测试：

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

如果云端已提供 Chromium，可使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`。测试会在 3100 端口启动全新的生产服务器，因此先构建；不会复用可能陈旧的运行进程。桌面和手机分别验证五个页面、导航、横向溢出、主题持久化、Manifest 和 404。单元测试覆盖路由边界与应用元数据；库存安全等业务测试随相应业务阶段实现。

## 设计系统

背景 `#FAF9F6`，鼠尾草绿 `#8FAF8F`，文字 `#27352A`，暖橙 `#E9A86B`，柔红 `#D77A72`。语义 CSS 变量定义于 `app/globals.css`，通过 `data-theme` 支持深色模式。卡片圆角 17–24px、交互控件最小 44px、可见键盘焦点、跳转主内容链接、减少动态效果偏好。首页插画由 CSS 绘制，是装饰而非菜谱或真实库存。

## GitHub 流程

开发使用 `feature/` 分支，明确 commit，经 PR 审查合并至 `main`，不强制推送。CI 在 PR 和 main/feature push 上执行 lint、类型检查、Vitest、生产构建和桌面/手机 Playwright。建议在 GitHub Settings → Branches 配置 main 保护并要求 `check` 成功。工作流配置文件存在不代表远程 CI 已执行。

## Vercel 云端部署

1. 在 Vercel 导入 GitHub 私有仓库 `mmmmmcy12138/all-you-can-eat` 并授权访问。
2. 选择 Next.js 预设，Root Directory 为仓库根目录，Node.js 24，安装命令 `npm ci`，构建命令 `npm run build`。
3. 生产分支设置 `main`，通过 feature PR 的 Vercel Preview 审查手机/桌面效果，再合并触发生产部署。
4. Phase 1 不需要外部环境变量。部署后使用 Vercel 提供的 HTTPS 域名。生产部署、GitHub App 授权和仓库隐私状态需要账户侧核实，代码无法代替账户配置。

## Supabase 配置

完整步骤与安全设计见 [docs/SUPABASE.md](docs/SUPABASE.md)。先创建免费 Supabase 项目，在 SQL Editor 执行 `supabase/migrations/202610260001_households.sql` 一次，再配置邮箱认证和 `/auth/callback` 重定向地址。在 Codex/Vercel 设置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，重新构建/启动。不要在浏览器使用 service role key，也不要提交 `.env.local` 或数据库密码。

托管邮件投递、会话刷新、双账号真实浏览器流程需要项目配置后验收；不能用单元测试代替实际部署验收。

## 后续阶段

- Phase 2：代码与数据库隔离测试已实现；等待真实 Supabase 项目配置及线上双账号验收。
- Phase 3：食材、多批次库存、流水、文字导入核对、幂等事务采购。
- Phase 4：菜谱、心愿、用餐计划、FEFO 并发扣减和做饭幂等。
- Phase 5：可解释推荐、共享采购清单、完整 PWA、导出和业务端到端测试。
- Phase 6：Supabase/Vercel 实际授权、迁移、HTTPS 部署及生产认证验收。

## 审查当前阶段

审查五个路由 `/`、`/fridge`、`/menu`、`/shopping`、`/profile`，检查窄屏导航、深浅主题和清晰的未接入提示。确认没有假的业务统计、写入表单或密钥。运行上述检查命令；检查 `.github/workflows/ci.yml`。数据库与未配置界面测试无需 Supabase 凭据；真实账号流程需要项目配置。

## 云端验证范围

`npm test` 包含导航/元数据、输入验证、服务端操作失败处理和 PostgreSQL/RLS 测试。数据库测试覆盖两人入家、非成员隔离、禁止角色提升、过期/撤销/重用邀请、限制家庭人数、移除成员和跨家庭管理参数伪造。

`npm run test:e2e` 在**未配置 Supabase 的构建**上验证桌面/手机导航、主题、错误回调和未配置提示；CI 不注入生产密钥。它不是已登录业务浏览器验收。配置托管项目后，按照 docs/SUPABASE.md 进行真实双账号验收。PGlite 单连接测试不覆盖多连接并发压力。

本次 Phase 2 云端检查：Lint、类型检查、39 项 Vitest（含 20 项 PostgreSQL 权限测试）、生产构建与 8 项桌面/手机 Playwright 全部通过；生产依赖审计 0 漏洞。尚未连接托管 Supabase，尚未执行真实邮箱/双账号浏览器验收。两个阶段均在 feature 分支上，main 尚未合并；审查时先合并 Phase 1，再合并 Phase 2。
