# 01 分域部署的识别与 API origin 路由

- Status: resolved
- Parent spec: `../spec.md`
- 现场证据：`../research.md`

## 背景

`https://ai-router.dev` 的浏览器应用与 API 在不同 origin（API 在 `https://api.ai-router.dev/api/v1`，Web origin 不代理 API，API origin 不提供前端）。现有识别链路对该地址全部落空，且账户 API 调用会打到 Web origin 的 `/api/v1/...` 上，实测得到 404 SPA 兜底页。

## 范围

1. `src/constants/deploymentApiOrigins.ts`（新）：分域部署表 + `resolveDeploymentApiOrigin(baseUrl: string): string`。叶子模块，不 import 其他内部模块，避免 `constants/siteType` ↔ 传输层的循环依赖。未登记 host、非法 URL、非 HTTP(S) 输入原样返回；用 URL 的 origin 拼接，保留协议与端口。
2. `src/services/accountSiteDefinitions/identifiers.ts`：`AI_ROUTER_HOSTNAMES = ["ai-router.dev", "www.ai-router.dev"]`、`AI_ROUTER_API_ORIGIN = "https://api.ai-router.dev"`，并在 `deploymentApiOrigins` 表里登记这两个 host。
3. `src/services/accountSiteDefinitions/definitions.ts`：Sub2API 的 `onboarding.detection.hostnames` 登记 `AI_ROUTER_HOSTNAMES`；`productProfile.urls.recognizedHostnames` 也包含它们。不设 `inferFromHostname`（不为无站点类型提示的地址自动套用 Sub2API 规范）。
4. `src/services/apiTransport/request.ts`：请求 URL 由 `joinUrl(baseUrl, endpoint)` 改为经由解析后的 API origin 构造，`baseUrl` 仍用于浏览器上下文 origin、临时窗口兜底、当前标签页取源与限流键。
5. `src/services/apiService/sub2api/index.ts`：`createRuntimeModelsUrl(request.baseUrl)` 改为使用解析后的 API origin。
6. `src/services/apiAdapters/sub2api/browserIdentity.ts`：`verify` 读取的 URL 用解析后的 API origin 构造。

## 明确不做

- 不改账户 `site_url`，不在账户请求工厂里改写 `baseUrl`（理由见 spec 设计决定 3）。
- 不把站点自曝的 `api_base_url` 当作发现手段（设计决定 4）。
- 不动管理域（`/admin/*`）与密钥写入契约。
- 不改其他 Sub2API 部署的任何行为。

## 验收

- 新增 `tests/` 下对 `resolveDeploymentApiOrigin` 的纯函数用例：已登记 host 的 http/https、带端口、带子路径、大小写、尾斜杠；未登记 host；非法/相对/非 HTTP(S) 输入。
- 新增传输层用例：以 `https://ai-router.dev` 为 `baseUrl` 的请求实际打到 `https://api.ai-router.dev`，且请求对象上的 `baseUrl` 未被改写；未登记 host 的 URL 逐字节不变。
- 新增识别用例：`getAccountSiteType("https://ai-router.dev")` 直接返回 Sub2API，且不发出 `fetchSiteOriginalTitle` / `/api/user/info` / `/api/v1/auth/me` 探测。
- 现有 Sub2API 相关用例保持通过；`pnpm compile` 与 `pnpm knip` 通过。

## Comments

- 2026-09-27：初版。
