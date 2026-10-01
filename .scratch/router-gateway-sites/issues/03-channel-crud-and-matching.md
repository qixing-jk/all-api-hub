# 03 — 渠道更新/删除、密钥读取与去重语义

- Status: resolved
- 归属：[spec.md](../spec.md) 切片 03
- 证据：[research.md](../research.md)「渠道密钥可见性」表 + spec 设计决定 5

## 目标

补齐渠道工作区的写操作，并让「这条渠道是不是已经存在」的判定可信而不是只比地址。

## 范围

- `PATCH`/`DELETE /api/providers/{id}` 接到原生渠道工作区（更新/删除、删除后的列表与状态收敛）。
- `matching.fetchSecretKey`：走 `GET /api/providers/client`（该路由**实测明文返回**渠道凭据），用于判定「同地址的渠道是否就是同一把密钥」。
  - **列表与匹配搜索一律用打码的 `GET /api/providers`**；client 路由只在显式读密钥的动作里调用。用测试锁住这个边界（投影模块不得引用 client 路由）。
  - 按可失败设计：401/403/404 或形状不符时回落为无密钥匹配，并在界面上明确提示降级。
- `exactMatchBasis` 与去重语义定稿：确认同一凭据时文案可写「已确认是同一把凭据」；只能比地址时写清「按地址与名称匹配」。
- 跨站点渠道迁移的类型路由（`managedResources/migrationTypeRoutes.ts`）。

## 验收

- 更新与删除在真实部署上可用，且只改动目标字段（不误伤其它连接）。
- 读密钥失败时，导入流程仍然可用：降级为无密钥匹配且用户能看出降级了。
- 去重文案与实际判定一致：可确认凭据与仅比地址两种情况不共用同一句话。
- 明文凭据不出现在任何列表/日志/持久化路径里（用测试断言而非人工检查）。

## 不做

- 网关密钥（API key）工作区：需要先决定是否为所有管理站点新增一个 `ManagedResourceKind`（spec 开放问题 2）。
- SecretVerification 恢复工作流（上游只实现了 `new-api-session` 一种）。

## 风险提示（实现时读一眼）

`GET /api/providers/client` 的源码注释自称「仅同源同步用」，实测没有同源地限制。它随时可能被上游收紧——所以它是**可选增强**，不是导入的硬依赖。另外持有 `admin` 令牌即等于持有该实例全部上游密钥，设置页文案要提示（spec 风险 1）。

## Answer

更新/删除、密钥读取、去重语义与迁移类型路由全部落地（`managedSites/omnirouteMutation.ts`、`managedResources/omniroute.ts`、`managedResources/omnirouteMigration.ts`）。

**「读不到密钥就降级」这条是真的成立，不是纸面承诺。** 跟踪一遍失败路径：`fetchRecoverableCandidateSecretKey` 把任何读密钥失败转成 `unresolvedReason = KEY_RESOLUTION_FAILED`（`managedSites/channelMatchResolver.ts:514`），不往外抛；导入流程照常继续，对话框按同地址命中给出 `REVIEW_SUGGESTED` 提示。真正读不到密钥就走不下去的只有**迁移**——迁出渠道必须拿到凭据，那条路径用 `SOURCE_KEY_RESOLUTION_FAILED` / `SOURCE_KEY_MISSING` 明确阻断，不是静默跳过。

**明文边界由测试而非注释守着。** 列表与匹配一律走打码的 `GET /api/providers`，`matching.search` 返回的候选项 `key` 恒为空串（就算部署开了 reveal 也不带出去）；client 路由只在显式读密钥的动作里调。三个模块各有一条用例锁这个边界（「reads plaintext credentials only through the explicit client route」等）。

**去重语义**：`exactMatchBasis: "url-key"` —— 连接级地址 + 存储凭据共同确定一条渠道。凭据读不到时降级为按地址与名称，界面用提示而不是同一句话糊过去。

**迁移类型路由**按内置 provider 的协议映射（openai / anthropic / gemini / deepseek 等，见 `migrationTypeRoutes.ts`）。带自定义前缀的 node 连接会被 `SOURCE_TYPE_UNSUPPORTED` 挡下——它的 provider id 是网关生成的，不在路由表里，猜一个映射不如说清做不到。

**删除时回收 node**（切片外的补强，随后续提交加入）：删掉前缀寻址的渠道后，若没有别的连接引用它建的 provider node，就把 node 一起删掉；node 被共享或读取失败时跳过，回收失败不会把一次已确认的删除报成错误。
