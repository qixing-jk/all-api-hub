# AI/ML API 合同探测原始记录

以下为标注日期的历史实测，不是当前完整能力表；最终接入、工具及结构化价格边界以 [账号 spec](../spec.md) 和 [定价 spec](../../aimlapi-pricing/spec.md) 为准，不延续已被取代的手动接入或无机器价格源结论。

探测日期：2026-10-24 ~ 2026-10-25。目标账号：已脱敏的测试账号（邮箱已脱敏）。
基址：`https://api.aimlapi.com`（保存密钥路由）、`https://app.aimlapi.com`（控制台会话路由）。

以下报文均为原样摘录（凭据已截断为前缀/长度），用于复核适配结论。

## 1. 两类凭据的权限边界

管理密钥 `<management-prefix>…`（前缀 `<management-prefix>`，控制台「Management keys」创建）：

```
GET  /v1/keys                      200  {"data":[{"name":"My first key","prefix":"<existing-prefix>",...}]}
GET  /v1/key                       200  {"data":{"name":"aah-probe-management","prefix":"<management-prefix>",...}}
POST /v1/keys                      201  {"data":{...,"key":"<once-only-secret-elided>"}}
PATCH /v1/keys/<temporary-prefix>  200  {"data":{"name":"aah-probe-mgmt-renamed","disabled":true,...}}
DELETE /v1/keys/<temporary-prefix>  200  {"data":{"prefix":"<temporary-prefix>","deleted":true}}
GET  /v2/billing                   403  {"message":"This endpoint is not allowed for this API key..."}
GET  /v2/billing/detail            403  同上
GET  /v2/billing/transactions      403  同上
GET  /v2/usage?period=7d           200  {"spend":0,"currency":"USD","requests":0,...}
GET  /v2/logs?period=7d&limit=2    200  {"data":[],"pagination":{...}}
```

普通 API key `<regular-prefix>…`：

```
GET  /v2/billing                   200  {"current_balance":0,"currency":"USD"}
GET  /v2/billing/detail            200  {"user_id":"<test-user-id>","email":"<redacted>","current_balance":0,"currency":"USD","autotopup_settings":{...}}
GET  /v2/billing/transactions      200  {"data":[],"pagination":{"next_cursor":null,"has_more":false}}
GET  /v2/usage?period=7d           200
GET  /v2/logs?period=7d            200
GET  /v1/key                       200  {"data":{"name":"aah-probe-regular","prefix":"<regular-prefix>",...}}
POST /v1/keys                      403  {"message":"This endpoint is not allowed for this API key..."}
GET  /v1/keys                      首次 200，其后稳定 403（见 §2）
```

管理密钥不出现在 `/v1/keys` 列表中（自身不列自身）：列表只返回 `<existing-prefix>`。

## 2. 普通密钥的 `/v1/keys` 首次可用现象

对同一把新建普通密钥连续调用：

```
try1 GET /v1/keys=200  GET /v1/key=200
try2 GET /v1/keys=403  GET /v1/key=200
try3..try6 均为 403 / 200
```

另一把新密钥单独调用一次同样拿到 200。因此普通密钥不能作为密钥管理凭据，适配只把管理密钥用于 `/v1/keys`。

## 3. 密钥写入字段语义

```
POST /v1/keys {"name":"aah-l3","limit":{"retention":"never","threshold":7}}
  -> 201 limit:{"retention":null,"threshold":7,"spent":0,"spent_usd":0,"remaining_usd":7,"window_start":null}
POST /v1/keys {"name":"x","limit":{"retention":"no_reset","threshold":7}}
  -> 400 options:["day","week","month","never"]
PATCH /v1/keys/{p} {"expires_at":null}          -> 400 {"message":"No changes provided."}
PATCH /v1/keys/{p} {"allowed_models":[...]}     -> 200 生效
PATCH /v1/keys/{p} {"limit":null}               -> 200 limit 清空
PATCH /v1/keys/{p} {"scopes":["model:chat","model:image"]} -> 200 生效
POST /v1/keys {"allowed_tools":["web-search"]}
  -> 400 "allowed_tools lists ids that are not in GET /v1/tools."
GET  /v1/tools                    -> 404 Cannot GET /v1/tools
POST /v1/keys {"allowed_models":null} -> 201 allowed_models:null
POST /v1/keys (无 allowed_models)     -> 201 allowed_models:null
```

结论：`expires_at` 只在创建时可写；PATCH 忽略它。`allowed_tools` 无法从接口枚举，适配不提供该字段。

## 4. 模型目录

```
GET /v1/models   200（无需鉴权）
  {"object":"list","data":[{"id":"moonshot/kimi-k3-1-pro","info":{...},"type":"openai/chat-completions","aliases":[...],"tags":[...]}, ...]}
  共 955 条；type 分布：openai/chat-completions 376、internal/video-generations/submit 195、
  openai/image-generations 126、openai/responses/submit 58、anthropic/messages 30、…
```

`info` 字段出现次数：name/developer/docsJson 955、releasedAt 947、description 840、docsUrl 604、contextLength 555、outputMax 473、isHottest 111、url 80、cutoffAt 8。

`/v1/models` 无任何价格字段。初次探测只查到营销站 `/models` 的 HTML 卡片；“无机器可读源”的原结论由以下补查更正。

### 2026-10-29 官方定价表补查

公开 `GET https://aimlapi.com/ai-ml-api-pricing` 返回服务器渲染表格，表头为 Provider / Model / Modalities / Capabilities / Context / Input / Output / Links。本次目录返回 950 条；定价页有 667 行带 `data-id`，并不覆盖全部目录。类别头 `Language Models`、`Embedding Models` 标明 `per 1M tokens`；其他行用 `Per/gen`、`Per/sec`、`Per/min`、`per 1M characters` 表达单位。

原始响应保留于本地 `../artifacts/pricing-page.html`；Kimi 详情页保留于 `../artifacts/model-detail.html`，均无需凭据。关键原文示例：

```html
<tr data-c="l" data-id="moonshot/kimi-k3-1-pro" ...>
...<td>$2<small>cache $0.2</small></td><td>$10</td>...
```

采用现有 canonical `pricingPlan`、计价引擎与 provider 目录缓存。仅精确 ID、明确单位和不带条件的 USD 数字进入计价；不同价格的重复 ID、条件价和未识别格式保留为不可用。目录请求与价格请求均公开，不向营销站发送保存的密钥。价格失败不妨碍目录展示，取消信号仍抛出。纯能力补齐，无站点边界或公共支持目录变化。

复现：`pnpm test tests/services/apiAdapters/aimlapi/modelCatalog.test.ts`；现场 UI：`node scripts/test-aimlapi-pricing-live.mjs`（当前 worktree 的开发扩展，公开来源，无远程资源写入）。本地 UI 截图与结果保留在 `../artifacts/pricing-*/`。无同构旧版截图，本次仅建立最终展示基线。

## 5. 控制台会话

控制台 `playground.token` Cookie（JSON，`{key,expires}`）+ HttpOnly `refreshToken`：

```
GET  app.aimlapi.com/v3/users/me/wallet          200  {"credits":0,"amountUsdMinor":0,...}  （带 Bearer）
GET  app.aimlapi.com/v3/users/me/billing/user    200
GET  app.aimlapi.com/v3/users/me/billing/spend-summary 200
GET  app.aimlapi.com/v3/cabinets/access          200  {"partner":false,"referral":false}
GET  app.aimlapi.com/v3/referral/me              404  "Referral cabinet not available"
PUT  auth.aimlapi.com/v1/auth/token  (body {token}, Cookie refreshToken)  200 {"token":"...","exp":...}
     重放同一旧 access token 再交换 -> 401（单次轮换）
     仅带 access token、无 refreshToken Cookie -> 401
```

access JWT payload：`{sid,uid,sha,ver,iat,uat,exp}`，`exp-iat=36000`（10 小时）。

## 6. 推理路由

```
POST /v1/chat/completions  401（空 key）
POST /v1/messages          401（空 key，Anthropic 兼容）
POST /v1/responses         401（空 key）
```

## 7. 清理

探测期间创建的所有临时密钥（`aah-*` 和若干临时前缀）全部 DELETE，最终 `/v1/keys` 只剩账号原有 `My first key <existing-prefix>…`。

## 8. 普通密钥的首次写入例外（现场复现）

对一把普通 API key 连续 POST 同一路由：

```
第 1 次 POST /v1/keys  -> 201（创建成功，返回一次性明文）
第 2 次 POST /v1/keys  -> 403 "This endpoint is not allowed for this API key..."
```

与 §2 的读路径同源：部署对每把 key 在每个受权限控制的路由上放行首次调用，随后稳定按端点权限拒绝。适配与现场探测都只依据稳态结果，探测会清理首次例外创建的密钥。
探测输出（2026-10-25）：`普通密钥首次写入被接受 (prefix 长度 8)，按部署的首次调用例外处理并清理。`

## 9. 2026-11-02：额度计数与周期的重新核查

调查起点 `8c494787d4`。用户明确允许写入后，使用本地环境的管理密钥创建一把随机唯一名称的本轮临时普通密钥，不修改已有密钥，不调用任何推理接口。管理凭据与一次性明文只保留在进程内存；原始带敏感字段的响应未写入证据。

| 操作 | 本轮实测结果（USD） |
| --- | --- |
| 创建月限额 9 | `limit={retention:month,threshold:9,spent:0,spent_usd:0,remaining_usd:9,window_start:2026-11-01T00:00:00Z}` |
| 管理密钥读列表、详情；临时普通密钥读自身 | 三个响应均包含相同的完整额度计数 |
| 修改本轮密钥为不重置，再读详情 | `retention:null`、`window_start:null`，`spent_usd:0`、`remaining_usd:9` 均存在 |
| 删除及最终列表读回 | 删除响应 `deleted:true`，原 prefix 已不存在，清理确认完成 |

在创建前另外只读查询了现有 4 把普通密钥及管理密钥自身，全部 `limit:null`。它们不能证明有限额场景。上述新建有限额样本补齐了当前接口实证，但全部为零消费，不能用于验证非零消费或证明接口永远不会缺字段。

[当前官方密钥文档](https://docs.aimlapi.com/api-references/service-endpoints/api-key-management)的示例未列 `spent_usd`、`remaining_usd`，也缺少当前响应的其他字段，且沿用历史 `no_reset`。它不能单独证明当前部署会省略计数；本轮有限额响应并未观察到省略。因此撤回旧代码注释中未经证据支持的“部分响应会缺失”的确定语气。

明确复现的是客户端处理缺失/无效计数的逻辑缺陷：公开 key-resource 列表和详情在只保留配置时，原实现显示已用 0、剩余 9；另有只返回 spent=2 的用例被推导为剩余 7。回归先失败，修复后只保留已知金额，缺计数时复用已有 `spend-budget` 显示上限与周期；仅余额已知时单独展示真实余额。已知 0 和明确返回的 spent=2/remaining=3 均原样保留，不按 9-2 覆盖后者。无需扩展公共合同。

页面验收另外确认：原完整月预算因没有 `nextResetAt` 而显示 Rolling window。[官方周期说明](https://docs.aimlapi.com/faq/how-can-i-work-with-my-api-keys#usage-limits)明确按 UTC 日历重置。修复由适配器对可信、对齐 UTC 的 `window_start` 推导下一次重置；日/周/月跨年回归先失败再通过。不重置、缺失或不可信起点不编造时间，使用既有共享展示合同。

脱敏结果、失败及最终回归、网页证据保存在本地 `../../aimlapi-pricing/artifacts/contract-verification-20261102/`；其中 `live-budget-sanitized.json` 只记录字段名及额度值，无名称、prefix、凭据或账号身份。正式回归位于维护中的 AIMLAPI keyResources 测试和 aimlapiAuthentication E2E。
