# 04 — 文档、i18n 收尾与 real-site E2E 接入

- Status: resolved
- 归属：[spec.md](../spec.md) 切片 04
- 证据：[research.md](../research.md) 全文（写文档时的契约来源）

## 目标

让这次集成在仓库的文档体系里完整可见，并把它接进既有的 real-site E2E 通道。

## 范围

- `docs/docs/omniroute-integration.md`（**中文为源**）+ `docs/docs/.vuepress/config.js` 的本地化导航。
- 更新 `supported-sites.md`、`self-hosted-site-management.md`。
- `docs/agents/site-integrations.md`：Relationships 里加 OmniRoute 条目（说明它是 9router 的 fork、仅管理站点、令牌鉴权、单步 baseUrl 覆盖、密钥读取的边界），并在「Default Upstream References」里加仓库与文档链接。
- 根 `AGENTS.md`：如需要，补任务路由行。
- i18n：源改完后按既有流程同步各语言（不留下未同步的语言文件）。
- real-site E2E：按 `e2e/utils/realSite/managedSiteConfig.ts` 的既有形态加 `resolveOmniRouteManagedSiteConfig()`，读 `AAH_E2E_OMNIROUTE_BASE_URL` + `AAH_E2E_OMNIROUTE_ADMIN_TOKEN`（`.env.example` 已备好）。换令牌路径留给设置页，E2E 用现成令牌，避免测试里再造令牌。

## 验收

- 文档站能通过导航到达新页面，且中文源与各译文一致。
- `supported-sites.md` 的站点清单与代码里的注册事实一致（按仓库约定：代码是事实来源，文档跟随）。
- real-site E2E 在缺 env 时给出清晰的 skip 原因（沿用 `getManagedSiteRealSiteSkipReason` 的形态），在给了 env 时能跑通导入链路。

## 不做

- 不写 9router 的用户文档：它不在本次范围（spec 里的「9router 留档」是给维护者的记录，不是用户可见文档）。

## Answer

文档与 i18n 由集成提交完成；本次补齐 real-site E2E 的实际可跑性，并接上 live E2E / CDP 通道。全部在 `https://omniroute.qixing1217.top` 上实跑通过，跑完后渠道数复原为 8。

**real-site E2E 之前只是「登记了」但跑不通**——注册了 config resolver 与矩阵条目，却没有对应的场景适配，实跑暴露出两个真问题：

1. `managedSiteChannels.ts` 的 CRUD 场景默认会给渠道填模型列表，而 OmniRoute 的编辑器没有 models 字段（spec 设计决定 6），用例会在 `channel-dialog-models-input` 上超时。改为按 `hasManagedSiteChannelModelList` 判定，并对 OmniRoute 开开启用 token 导入状态用例（`getManagedSiteStatusSourceAccountType(OMNIROUTE) → NEW_API`），导入链路因此有了真实覆盖。
2. `managedChannelPreservation.ts` 不认识 OmniRoute 的报文：详情是 `{ connection }` 而不是 `{ data }`，详情路径是 `/api/providers/{uuid}`，更新时间戳是 camelCase `updatedAt`。三处都补上，并把详情路径判定抽成可单测的 `isManagedChannelDetailRead`。

**顺带修掉一个线上会炸的 bug**：编辑已有渠道时 `omniRouteEditFields` 列了 `provider`，而 `editFieldDescriptors` 没有这个字段（`PATCH /api/providers/{id}` 本来就改不了 provider），字段策略与适配器不一致会让 `resolveResourceFieldPolicy` 抛 `resource field policy mismatch`，整页被 React error boundary 接管成「Page display failed」。这个错误在只跑单测时不出现，是 CDP 实跑点开编辑对话框才暴露的。

**还发现一个静默缺口**：`BASIC_SETTINGS_ANCHOR_TO_TAB` 里没有 OmniRoute 的锚点，而这张表不只服务旧式锚点链接，还是 OptionsOverview 与 UnifiedApiGuidance 解析目标 tab 的依据。六个锚点已补上，与其它管理站点对齐。

**live E2E / CDP**：新增 `pnpm e2e:cdp:omniroute`（`scripts/test-omniroute-e2e-live.mjs` + `scripts/suites/omniroute/{probe,ui}.mjs`），沿用 ai-router / rix 的模块化套件形态：

- `probe`：纯协议层，默认只读；`--write` 才走 创建 → 回读 → 删除，并顺带把「列表打码 / client 路由明文」这条 `fetchSecretKey` 依赖矩阵用一条带凭据的临时渠道确定下来（无凭据的清单定不了这件事，只报 undetermined）。
- `ui`：CDP 驱动真实扩展，覆盖设置页回显与连接校验（真实网关返回 `Connected`）、渠道工作区列出部署上的真实渠道、UI 建渠道→网关侧确认→UI 删渠道→网关侧确认消失。preferences 走 `withStoredValue` 沙盒快照复原，渠道在 `finally` 兜底清理。
- 运行参数：`--env-file` 指向集中存放的 `.env.local`（默认读本 worktree），`--extension-id` 用于同一调试浏览器挂了多个 worktree 扩展时指定目标。

**运行环境注意**：`Extensions.loadUnpacked` 动态加载的扩展会被浏览器判为 blocked（`ERR_BLOCKED_BY_CLIENT`），不指定 `--enable-unsafe-extension-debugging` 时不可用；要驱动本 worktree 的构建，要么 `pnpm browser:cdp -- --restart`（会摘掉其它 worktree 已挂载的扩展），要么另起一个隔离 profile 的调试浏览器（本次采用后者，避免打断并发 session）。

**CI 侧现状（2026-10-01 核对）**：仓库 secrets `AAH_E2E_OMNIROUTE_BASE_URL` / `AAH_E2E_OMNIROUTE_ADMIN_TOKEN` 已于 09-30 配好，workflow 的 `OMNIROUTE` case 分支与矩阵条目也都在代码里。所以 09-30 的 nightly 之所以没有 OmniRoute 这一格，只是因为矩阵条目还没合进 main（nightly 跑的是 main）。合并后这一格才会出现，且它会和所有 New API 系管理站点共用 `newApiAccount` 资源组并串行。

**合并前要注意的**：09-30 的 nightly 全量失败（9 个 management-site job），根因是共享的 New API 源账号——`Account / New API` 报「Auto-detection failed: New API dashboard authentication could not be exchanged」。OmniRoute 的 token 导入状态场景同样以这个账号为来源，所以那一格合进去之后会继承同一个失败。这是账号/环境问题，不是本集成的代码问题，但会让 OmniRoute 的 real-site 覆盖形同虚设，建议在开 PR 前先确认该账号恢复。
