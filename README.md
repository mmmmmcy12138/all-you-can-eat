# All You Can Eat · AYCE

双人共享的家庭厨房。把每一餐，过成小确幸。

## 当前进度：Phase 1

已实现 Next.js App Router + TypeScript 项目、Tailwind CSS 设计系统、shadcn 风格 Button（Radix Slot/CVA，配置见 `components.json`）、Lucide 图标、中文首页、冰箱/点菜/采购/我的独立页面、桌面侧栏、手机底部导航、安全区域、深色模式持久化、断网提示、Manifest、SVG 图标和 GitHub CI。

**这是基础界面，不是完整厨房系统。** 不使用模拟库存或用户，不会模拟保存、注册、邀请、采购或烹饪成功。统计显示“待连接厨房”。所有后续业务数据必须来自 Supabase。Manifest 已提供，但 Service Worker、离线页、完整安装图标与安装验收安排在 Phase 5；本阶段不宣称完整 PWA。

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

如果云端已提供 Chromium，可使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`。测试会启动生产服务器，因此先构建。桌面和手机分别验证五个页面、导航、横向溢出、主题持久化、Manifest 和 404。单元测试覆盖路由边界与应用元数据；库存安全等业务测试随相应业务阶段实现。

## 设计系统

背景 `#FAF9F6`，鼠尾草绿 `#8FAF8F`，文字 `#27352A`，暖橙 `#E9A86B`，柔红 `#D77A72`。语义 CSS 变量定义于 `app/globals.css`，通过 `data-theme` 支持深色模式。卡片圆角 17–24px、交互控件最小 44px、可见键盘焦点、跳转主内容链接、减少动态效果偏好。首页插画由 CSS 绘制，是装饰而非菜谱或真实库存。

## GitHub 流程

开发使用 `feature/` 分支，明确 commit，经 PR 审查合并至 `main`，不强制推送。CI 在 PR 和 main/feature push 上执行 lint、类型检查、Vitest、生产构建和桌面/手机 Playwright。建议在 GitHub Settings → Branches 配置 main 保护并要求 `check` 成功。工作流配置文件存在不代表远程 CI 已执行。

## Vercel 云端部署

1. 在 Vercel 导入 GitHub 私有仓库 `mmmmmcy12138/all-you-can-eat` 并授权访问。
2. 选择 Next.js 预设，Root Directory 为仓库根目录，Node.js 24，安装命令 `npm ci`，构建命令 `npm run build`。
3. 生产分支设置 `main`，通过 feature PR 的 Vercel Preview 审查手机/桌面效果，再合并触发生产部署。
4. Phase 1 不需要外部环境变量。部署后使用 Vercel 提供的 HTTPS 域名。生产部署、GitHub App 授权和仓库隐私状态需要账户侧核实，代码无法代替账户配置。

## Supabase（Phase 2，尚未接入）

`.env.example` 仅提供未来配置模板：`NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（浏览器可用 publishable key）。不要在浏览器使用 service role key。不要提交 `.env.local`、数据库密码或密钥。未来在 Supabase 配置邮箱认证和站点重定向 URL，在 Vercel 的 Preview/Production 配置对应变量，并运行经过测试的 migrations。当前没有数据库 migration、RLS、Storage 或认证实现，不能把空模板当作已配置。

## 后续阶段

- Phase 2：Auth、profiles、家庭/成员/过期单次邀请、跨家庭约束及 RLS 测试。
- Phase 3：食材、多批次库存、流水、文字导入核对、幂等事务采购。
- Phase 4：菜谱、心愿、用餐计划、FEFO 并发扣减和做饭幂等。
- Phase 5：可解释推荐、共享采购清单、完整 PWA、导出和业务端到端测试。
- Phase 6：Supabase/Vercel 实际授权、迁移、HTTPS 部署及生产认证验收。

## 审查 Phase 1

审查五个路由 `/`、`/fridge`、`/menu`、`/shopping`、`/profile`，检查窄屏导航、深浅主题和清晰的未接入提示。确认没有假的业务统计、写入表单或密钥。运行上述检查命令；检查 `.github/workflows/ci.yml`。本阶段无需 Supabase 凭据。

## 本次云端验收

已通过 ESLint、TypeScript、4 项 Vitest、Next.js 生产构建、6 项 Playwright（桌面/手机）；生产依赖审计发现 0 个漏洞。已检查 390px 手机截图。尚未验证远程 GitHub Actions、Vercel 部署或 Supabase。
