# 03 对外导出必须带部署的 API origin

- Status: resolved
- Parent spec: `../spec.md`
- Blocked by: 01
- 现场证据：`../research.md` §2

## 背景

切片 01 只解决了**扩展自己发请求**的路径（请求 URL 构造处解析 API origin）。但扩展还会把账户/密钥**交给外部消费方**——管理的渠道草稿、凭据资料、CC Switch / AI Toolbox / Cherry Studio / Kelivo / Cursor++ / Kilo Code 等桌面端集成、以及运行时密钥的复制与深链导出。这些地方此前直接取账户的 `site_url`，对分域部署就是网页域名：外部工具拿到 `https://ai-router.dev` 后调用 `/v1/...` 只会打到前端兜底页。

已在代码中确认的漏点：

| 位置 | 泄漏方式 |
| --- | --- |
| `src/services/accounts/utils/credentialExport.ts` | `createAccountRuntimeKeyExportSource` 直接取 `account.baseUrl`；它是 CC Switch、AI Toolbox、Cherry Studio（弹窗）、Cursor++、Kilo Code、Claude Code Router、深链弹窗的**共同出口** |
| `useRuntimeKeyIntegrationActions.ts`（Cherry Studio 直连导出、Kelivo 导出输入） | 各自直接取 `account.baseUrl`，不走上面那条出口 |

`buildManagedSiteChannelDraftSource`、`captureProfileFromAccountToken`、`buildTransientVerificationProfile` 三个消费方本来就调用 `normalizeAccountSiteProfileUrlForManagedChannel`，但它对 Sub2API 恒等于原样返回（`managedChannelOrigin` 是站点类型级常量，Sub2API 是多部署类型，不能按类型钉一个 origin）。

## 范围

1. `src/services/accounts/accountSiteProfile/urls.ts`：`normalizeAccountSiteProfileUrlForManagedChannel` 的兜底由「原样返回」改为「先过 `resolveDeploymentApiOrigin`」。对未登记 host 逐字节等价（仍返回 `params.url.trim()`）。
2. `src/services/accounts/utils/credentialExport.ts`：新增 `resolveAccountExternalApiBaseUrl(account)`，作为「账户 → 外部消费方应使用的基址」的唯一访问器；`createAccountRuntimeKeyExportSource` 在密钥沿用账户端点时用它（密钥自带端点时仍然原样尊重）。
3. `useRuntimeKeyIntegrationActions.ts`：Cherry Studio 与 Kelivo 两处改用该访问器。
4. 不改**用户手写**的凭据资料（`ApiCredentialProfiles` 新建/编辑）与存储层：前者是用户显式输入，后者要保留浏览器 origin 供会话读取与跳转。

## 验收

- 分域部署的账户在以上每个导出出口都拿到 `https://api.ai-router.dev`，账户自身的 `site_url` 不变。
- 未登记部署（含其他 Sub2API 站点与其他站点类型）的导出基址逐字节不变。
- 运行时密钥自带端点时不被改写。
- AIHubMix 从 console origin 导出时得到 `https://aihubmix.com`（既有 `managedChannelOrigin` 契约不变，顺带修掉凭据导出此前漏用该契约的问题）。
- 相关定向 Vitest、`pnpm compile`、`pnpm knip`、`pnpm i18n:extract:ci` 通过。

## 明确不改

- **服务凭据路径**（`RuntimeKeyActionControls.buildServiceCredentialExportProfile`）同样直接取 `runtimeKey.baseUrl`，但当前只有 SharedChat 实现服务凭据且它不是分域部署，改动的新行为今天无法演示，因此保持原样并记录在 spec 的「已知成本与边界」。
- 用户手写凭据资料的 baseUrl：不静默改写用户输入。

## Comments

- 2026-09-28：初版并实现。
