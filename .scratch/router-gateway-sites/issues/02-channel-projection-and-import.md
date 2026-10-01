# 02 — 渠道读投影与导入创建（#1259 的 OmniRoute 半边）

- Status: resolved
- 归属：[spec.md](../spec.md) 切片 02
- 证据：[research.md](../research.md)「实测结果」的 baseUrl 覆盖与密钥可见性两节

## 目标

用户能把 AAH 里的账户/凭据导入成 OmniRoute 的 provider 连接，并在扩展内看到该部署已有的渠道清单。这是 #1259 对 OmniRoute 的闭环。

## 范围

- 传输层 `src/services/apiService/omniroute/{index,providers,parsing,redaction}.ts`：`GET /api/providers`（分页 `limit/offset`）→ 渠道投影。**按可提取的接缝分文件**，不预抽共享层（spec 设计决定 1）。
- `managedSites/omniroute.ts`：`config`、`matching.search`（`base_url` 取自 `providerSpecificData.baseUrl`）、`channelDrafts.prepareFormData`、`queries.accountAvailableModels`（`GET /api/models`）。
- `managedResources/omniroute.ts` + 创建编辑器：
  - 默认路径：**单条 `POST /api/providers`**，把源 `baseUrl` 写进 `providerSpecificData.baseUrl`（实测 201 且回读一致）。
  - 进阶路径：需要独立模型前缀时建 provider node，再建引用它的连接。
  - 预填：源 `baseUrl` 命中内置 provider 的已知 baseUrl → 预选该内置 provider；否则内置 provider + baseUrl 覆盖。
- provider→baseUrl 表（`managedSites/providers/omniroute.ts`）：只覆盖内置 provider 的地址用于匹配与预填；也可从 `/api/models` 里出现的 `provider` 值反推在用集合。
- 展示策略：`managedResourceFieldPolicy` / `managedResourceTablePolicy` / `managedResourceMigrationPresentation`。

## 验收

- 列表把连接映射成渠道行（名称、provider、状态、base_url、默认模型），**`apiKey` 在界面上永不出现**（列表走打码投影）。
- 导入草稿：名称带 `(auto)` 后缀、密钥、`base_url` → `providerSpecificData.baseUrl`、模型预填；提交后网关侧出现对应连接。
- 创建只用单条入口，**不用 `bulk`/`import`**（它们会逐条校验上游可达性，把「网关能不能连到源站」变成导入成败的一部分）；用测试锁住这一点。
- 网关侧的失败要透出来：SSRF 守卫拦内网地址、名称冲突等，都不能报成「导入成功」。
- 导入成功的文案不暗示「渠道已连通」——`POST /api/providers` 不做任何可用性确认（`testStatus` 默认 `"unknown"`）。

## 不做

- 渠道更新/删除、`fetchSecretKey`、去重语义定稿（切片 03）。
- 模型同步能力（上游无对应概念，spec 设计决定 6）。

## 测试

解析与投影的单测（夹具用中性域名，不写真实部署地址）、草稿→请求载荷的映射、名称冲突与 SSRF 拒绝的错误映射、以及「导入路径不调用 bulk/import」的断言。

## Answer

`#1259` 的 OmniRoute 半边闭环。读投影在 `src/services/apiService/omniroute/{providers,parsing,redaction}.ts`，原生工作区与编辑器在 `src/services/apiAdapters/managedResources/omniroute.ts`。

**一条验收口径被设计决定 6 改掉了。** 本条验收写的是「导入草稿…模型预填」，实际落地是草稿**不带模型清单**（`models: []`）。网关的连接上没有模型列表这个属性，模型来自 provider 目录 + 网关级别名 + 禁用列表，连接只存一个 `defaultModel`。所以预填给的是默认模型而不是清单，用例名直接写着这一点（「carries no per-channel model list into the draft」）。验收那一行按决定 6 作废，不是漏做。

**单条创建这条按可读的方式钉住了。** 载荷构造器在 `providers.ts` 里注释了 `/bulk` 与 `/import` 会逐条校验凭据，用例「never routes a create through the bulk or import endpoints」+ 变量一致性与适配器一致性两组 conformance 测试把这条锁死，不靠注释。

**provider→baseUrl 表的漂移风险按 spec 的倾向处理了。** 内置地址表只用于匹配与预填；编辑器里的 provider 选项走 `ResourceEditor.loadOptions` 懒加载，从部署自己的目录（`/api/models` 里出现的 provider 值）读，不预置用不到的 id（用例「offers a lazy provider list from the deployment's own catalogue」）。

**进阶路径（provider node）带了失败补偿。** 需要独立模型前缀时才建 node，创建被网关明确拒绝时回收刚建的 node；结果是「不确定」（5xx）时保留 node 不动——不确认的删除比留着更糟。三条都在 `tests/services/apiAdapters/managedResources/omniroute.test.ts` 里。

网关侧的失败透传：`OmniRouteApiError` 统一过 `toOmniRouteDisclosureError`（清掉令牌再展示），保留网关原文——名称冲突和 SSRF 拒绝的理由都在那句原文里，报成「导入成功」的路径不存在。
