# All You Can Eat · AYCE

双人共享的家庭厨房。把每一餐，过成小确幸。

## 当前进度：文字导入已由用户验收，新增共享购物清单与再次购买待发布

Phase 1 的响应式中文界面、五栏导航、主题和 CI 已保留。新增 Supabase SSR 邮箱注册/登录/退出、PKCE 确认回调、个人昵称、创建家庭、Owner 管理、48 小时单次邀请链接/代码、成员加入与移除。

已提供完整 Phase 2 SQL migration、4 表 RLS、最小权限 grants、哈希邀请和事务锁。数据库测试用 PGlite 真实 PostgreSQL 引擎执行 migration，不依赖外部密钥。

托管 Supabase 连接与家庭迁移已经验证，用户已成功登录并创建家庭。本轮新增状态感知首页、手动多行采购、真实批次库存、采购历史、盘点/报损和审计流水。未知价格/保质期保持为空，不使用模拟业务数据。采购与调整有事务、幂等和并发保护。

**用户已执行库存迁移，并成功在正式网站录入采购。** 文字导入已经由用户反馈成功。本轮共享购物清单需要追加 `202610260003_shopping_list.sql`，不要重跑旧迁移；新代码尚未发布。使用和验收见 [docs/PURCHASE_IMPORT.md](docs/PURCHASE_IMPORT.md)，库存说明见 [docs/INVENTORY.md](docs/INVENTORY.md)，待办见 [docs/TODO.md](docs/TODO.md)。

文字导入已实现逐行校验、精确单位换算、食材匹配与勾选核对。共享购物清单与历史再次购买本轮已实现，待新增迁移及发布验收；菜谱、做饭 FEFO 扣减和推荐仍未实现。Manifest 已提供，完整 PWA 留在后续；跨设备邮件模板调整仍是待办。

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

- Phase 2：代码与数据库隔离测试已实现；托管项目已连接，完整线上双账号验收待完成。
- Phase 3：手动采购、批次库存、流水与调整已实现；文字导入本轮已实现；再次购买和共享购物清单本轮已实现，待发布。
- Phase 4：菜谱、心愿、用餐计划、FEFO 并发扣减和做饭幂等。
- Phase 5：可解释推荐、共享采购清单、完整 PWA、导出和业务端到端测试。
- Phase 6：Supabase/Vercel 实际授权、迁移、HTTPS 部署及生产认证验收。

## 审查当前阶段

审查五个路由 `/`、`/fridge`、`/menu`、`/shopping`、`/profile`，检查窄屏导航、深浅主题和清晰的未接入提示。确认没有假的业务统计、写入表单或密钥。运行上述检查命令；检查 `.github/workflows/ci.yml`。数据库与未配置界面测试无需 Supabase 凭据；真实账号流程需要项目配置。

## 云端验证范围

`npm test` 包含导航/元数据、输入验证、服务端操作失败处理和 PostgreSQL/RLS 测试。数据库测试覆盖两人入家、非成员隔离、禁止角色提升、过期/撤销/重用邀请、限制家庭人数、移除成员和跨家庭管理参数伪造。

`npm run test:e2e` 在**未配置 Supabase 的构建**上验证桌面/手机导航、主题、错误回调和未配置提示；CI 不注入生产密钥。它不是已登录业务浏览器验收。配置托管项目后，按照 docs/SUPABASE.md 进行真实双账号验收。PGlite 单连接测试不覆盖多连接并发压力。

本次 Phase 2 云端检查：Lint、类型检查、39 项 Vitest（含 20 项 PostgreSQL 权限测试）、生产构建与 8 项桌面/手机 Playwright 全部通过；生产依赖审计 0 漏洞。后续已验证托管连接与家庭表的匿名权限，用户已成功登录和创建家庭。Phase 1、Phase 2 及邮箱修复已合并 main；完整双账号验收和邮件模板调整仍待执行。

## 邮箱跨设备确认修复

默认 PKCE 邮件在另一浏览器打开时可能已经确认邮箱，却无法自动登录。回调现在区分浏览器校验缺失、过期链接和服务连接错误，并引导已确认用户直接登录。新增 email token hash 验证以支持跨设备确认；**部署修复后**按 [Supabase 文档](docs/SUPABASE.md#3-认证配置) 更新 Confirm signup 邮件模板才能启用。此变更不修改已有账号、家庭或数据库表。

## 本轮验证与限制

`npm test` 覆盖 PGlite 数据库权限/事务、页面状态、采购表单暂存和服务端操作。`npm run test:postgres` 另用隔离 PostgreSQL 17 容器验证多连接竞态；不会连接生产库。CI 已增加此项。Playwright 目前覆盖未配置环境的桌面/手机导航和无权限入口，不能替代托管双账号采购验收。具体重现命令见 INVENTORY.md。

库存快照是单条数据库语句，避免 API 顶层行数上限导致错误总量；历史列表只展示最近 20 单，单单最多 50 行，流水显示最近 100 条。家庭数据按刷新共享，尚无 Realtime。草稿依赖标签页会话存储：主动清除存储或另开新请求不属于同一幂等请求。

库存版本本机验证结果：107 项 Vitest、4 项真实 PostgreSQL 多连接集成检查、12 项桌面/手机 Playwright，以及 lint、类型检查和生产构建全部通过。生产依赖审计 0 漏洞。后续用户已执行托管库存迁移、完成部署并成功录入采购；完整双账号验收仍待执行。

文字导入版本本机验证：150 项 Vitest（包括解析结果进入真实 PostgreSQL 引擎采购事务、核对勾选与草稿恢复）、12 项桌面/手机导航基线、lint、类型检查与生产构建通过。尚未在托管站点执行登录后的文字导入验收；本轮无需新 SQL，待 PR 合并与 Vercel 部署。

## 共享购物清单与再次购买

使用、迁移和验收见 [docs/SHOPPING_LIST.md](docs/SHOPPING_LIST.md)。需求合并取较大的剩余量，标记已买不会改变库存；实际采购入库和需求完成在同一事务提交。部分购买保留剩余需求，并发过时版本拒绝覆盖或重复入库。历史再次购买只复制食材/数量，旧价格和日期留空供核对。

本轮新增迁移尚未在托管 Supabase 执行，新代码尚未上线；原手动采购/文字导入保持可用。邮箱模板等原有待办仍保留。

共享清单版本本机验证：191 项 Vitest、8 项真实 PostgreSQL 多连接检查、12 项桌面/手机导航基线，以及 lint、类型检查和生产构建通过。已登录的托管清单/关联入库验收仍待新增迁移及部署后进行；不将本机测试当作线上成功。
