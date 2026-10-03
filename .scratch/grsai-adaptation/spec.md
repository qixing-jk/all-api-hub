# Grsai 站点适配 spec

Status: ready-for-human（实现已完成，待审查）

## 背景

`https://grsai.com` 是 AI 中转/聚合站（Grsai），控制台是 Next.js 前端，后端是自有 REST 服务，**不是** One API / New API 衍生：没有 `/api/status`、`/api/user/self`、`/api/token/`，落在 New API 家族的探测路径上必然 `invalid_response`。

它有两条正交的 API：

| 用途 | 地址 | 鉴权 |
| --- | --- | --- |
| 控制台（账号、密钥、模型） | `https://eb.grsaiapi.com/client/...` | `authorization: <会话 token>`；写操作另加 `xtx` |
| 用户密钥调用的 OpenAI 兼容 API | `https://grsaiapi.com/v1` | `authorization: Bearer <sk-...>` |

## 交付范围

做：站点识别与自动识别（控制台会话读取）、账号余额/今日消耗、API Key 全量管理（列/新建/改/删）、模型列表与价格、会话续期与失效恢复。

明确不做：

- **签到**：控制台导航与路由表都没有签到入口，积分流水里只有 `New User Register` 一条；改为 `checkInPath: null`，`fetchSupportCheckIn()` 恒为 `false`。
- **被动浏览器身份校验**（`browserIdentity`）：该契约规定只能走一次 GET（`BrowserIdentityRead`），而控制台 API 全部是 POST（实测 `GET /client/grsai/getUserInfo` 返回 404），因此不注册该能力；自动识别走内容脚本会话提取器，不依赖它。
- **充值/订单/邀请**：充值走站点自有支付渠道，用户的 `getUserInfo` 响应里没有邀请码，本轮不接入。
- **站点公告**：`getNoticeInfo` 只返回联系方式与一个开关，没有可供展示的公告正文。

## 已核实的上游契约

证据：用 Playwright Extension 模式接管已登录浏览器实测（不复制 profile、不走 CDP）。原始报文含账号身份与 token，验证完即从工作区删除，未入库；可从下方契约与测试夹具复现。签名算法另用站点前端 bundle（`_next/static/chunks/dbc7289c88ff1382.js` 模块 59658）逐行比对，**自算 xtx 与站点自身产生的 xtx 在四组样本上完全一致**。

### 认证链（关键，与 One/New API 家族完全不同）

1. 站点把会话 token 存在 `localStorage.Token`（JWT，`iss` 是会随登录态变化的 UUID）。
2. `POST /client/common/getConfig` 请求体是 `{ token: <localStorage 里的 token>, referrer: "" }`，**不是**鉴权头。
3. 响应 `data.token` 是**新的会话 token**，站点会把它写回 `localStorage.Token`；响应同时给出本次签名的全部素材（`kis` / `ra1` / `ra2` / `random`）。
4. 之后的请求用 `authorization: <第 3 步返回的 token>`；写操作还要带第 5 步的 `xtx`。

因此：**写请求必须先用上一次的 token 换一次 config，再用返回的新 token 当 authorization**。读请求用已保存的 token 直接可用。

### `xtx` 写签名

站点对**所有**控制台请求都带 `xtx`，服务端只在会改数据的端点上强制校验；缺失或不匹配一律回 `{"code":-3,"data":null,"msg":"参数格式错误"}`（HTTP 仍是 200）。算法（`Encryption`）：

```
b = 对 body 的 key 按 ASCII 升序，拼接 `${key}=${base64(JSON.stringify(value))}`
p = atob(kis).split("=sj+Ow2R/v")
y = String(random).split("")
_ = parseInt(y[0]); m = parseInt(y[y.length-1])
S = parseInt(y.slice(2, 2+_).join(""))
k = parseInt(y.slice(4+_, 4+_+m).join(""))
C = AES-CBC-decrypt(key=p[S], iv=p[k], ciphertext=ra1)   # UTF-8 明文
z = AES-CBC-decrypt(key=p[S], iv=p[k], ciphertext=ra2)
xtx = MD5( base64( AES-CBC-encrypt(key=C, iv=z, plaintext=b) ) )
```

- 空 body 也要签名：`{}` 的 `b` 是空串，有确定的 xtx。
- 素材（`kis`/`ra1`/`ra2`/`random`）每次 `getConfig` 都不同，且和该次返回的 token 绑定；过期的素材签出来的 xtx 会被拒。
- 落点：`src/services/apiService/grsai/signature.ts`（AES 用 WebCrypto，MD5 需自带实现）。

### 账号与统计

- `POST /client/grsai/getUserInfo` `{}` → `{ credits, id, loginType, mail, token }`。
- `token` 是 32 位十六进制串，**本站用户信息页会把它当「开放接口凭据」展示**（掩码 `b59c****d174` + 复制按钮，文案为 “Token is used for calling platform open APIs, not model API interfaces”）。但实测它既不被控制台接口接受（作 `authorization` 返回 `-10000`），也不被官方文档里的开放接口接受（作 `apikey` 返回 `apikey not found`，换 header 形式同样不行）；开放接口要的是 `sk-` 密钥。它的真实用途未核实，**因此适配不使用它**，账号凭据仍是会话 token。
- `POST /client/grsai/getDashboardData` `{}` → `{ credits, todayConsumed, totalConsumed }`。三个数字都是积分单位，本站 1 积分即 1 单位的账户余额。
- `POST /client/grsai/getCredits` `{}` → `{ credits }`。
- `POST /client/grsai/getCreditsLogList` `{ page, limit, locale }` → `{ list: [{ id, name, remark, credits, type, resultType, modelName, inputTokens, outputTokens, cacheTokens, useSecond, createTime, finishTime, taskId, taskData }], totalPage }`。
- 未授权/失效：HTTP 200 + `{"code":-10000,"data":null,"msg":""}`。

### API Key

- `POST /client/grsai/getAPIKeyList` `{ page, size, apiKey? }` → `{ list: [...], total }`；行结构 `{ id, key, name, credits, totalCost, type, expireTime, createTime }`。
- **`key` 在 create 与 list 两处都返回明文**（`sk-` + 32 位十六进制），清单密钥始终可恢复、可导出。
- `POST /client/grsai/createAPIKey` `{ name, type, credits?, expireTime? }` → 同上行结构。
- `POST /client/grsai/updateAPIKeyInfo` `{ apiKey, name, type, credits?, expireTime }` —— **按 `apiKey` 明文定位，不是按 id**；成功响应 `data` 为 `null`，需重新拉列表。
- `POST /client/grsai/deleteAPIKey` `{ id }`。
- 语义：`type` 为 `0` 表示不限额度，`1` 表示限额（此时 `credits` 是**剩余额度**）；`expireTime` 为 `0` 表示永不过期，否则是 unix 秒；`totalCost` 是已消耗积分。
- `expireTime` 可清空（编辑器里传 `0`）。

### 模型目录

- `POST /client/serverGrsai/getModelList` `{}` → 30 条 `{ id, model, name, credits, cost_type, desc, document, feature, max_token, maintenance, errorReturn, violationReturn, priceExample }`；`credits` 是单次调用消耗的积分，`priceExample` 是站点自己的展示价（如 `￥0.03~￥0.06`）。
- `POST /client/serverGrsai/getModelListV2` `{}` → 带分组（`group`）与 `video` 分档价的变体；视频模型在 v1 里 `credits` 为 `0`，价格按分辨率分档。
- `POST /client/serverGrsai/getModelGroupList` `{}` → `{ list: [{ id, name, desc, descEn, icon }] }`。
- `POST /client/grsai/getCostInfo` → `{"code":-1,"msg":"no permission"}`（管理员专用，不接入）。

### 开放接口（官方文档明示，凭据与模型接口不同）

控制台「Other APIs」文档给出两个不依赖控制台会话的接口：

- `GET /client/common/getCredits?apikey=sk-xxxxxx` → `{"code":0,"data":{"credits":5000}}`；**用 `sk-` 密钥**，实测 `apikey` 传 32 位长 token 会回 `apikey not found`。
- `GET /client/common/getModelStatus?model=<name>` → `{"code":0,"data":{"status":true,"error":""}}`；**完全不需要凭据**。

适配目前仍走控制台接口取余额（账号凭据本来就是会话 token，不必再依赖某把具体密钥），这两个接口记录在此供后续取模型健康状态之类的用途。

### 没有 refresh token，续期与恢复

控制台的接口常量表（`_next/static/chunks/752464cc7bf7cf24.js`）里 `/client/auth/` 只有 `googleLogin`、`mailLogin`、`mailSendMail`，整张表**不含任何 refresh 端点**，`getUserInfo` 也没有返回 refresh token。所以本站没有「refresh token 换 access token」那套机制：**会话 token 续期的唯一途径就是 `getConfig` 换发**。

会话 token 是 HS256 JWT，payload 带 `exp`，实测为「签发时刻 + 30 天」，每次换发都从当下重算。据此适配做三层处理（对标 sub2api 的到期判断 + RightCode/VoAPI v2 的浏览器会话再同步）：

1. **本地可读的到期时间**：`sessionToken.ts` 解析 `exp`（base64url，容错；读不出来一律不判死——只有控制台有资格判定 token 是否还有效）。
2. **区分失效原因**：换发后 `isAuth` 为假时，若本地 `exp` 已过则说明是 30 天窗口自然到期，否则是站点不再认可该会话；两种给用户不同提示。
3. **失效即自愈**：控制台调用被判未授权时，从浏览器会话重读 `localStorage.Token`，**校验身份后**再写回账号并重试。内容脚本提取器本身就会调 `/client/grsai/getUserInfo`，所以只有被控制台认证过的会话才会被采纳。

另外，控制台把「开放接口 Token」以 API 凭据的形式展示在用户信息页，用户很可能误填。32 位十六进制（非三段式 JWT）在发请求前就被识别并给出明确提示，不再发一次注定失败的换发；若浏览器里另有可用会话，这条路径同样会自愈。

### 积分与汇率

整个站点用「积分」计价，单位换算取自站点自己的充值商品列表（`POST /client/goods/getGoodsList`，均为无赠送档）：

| 档位 | 积分 |
| --- | --- |
| `¥10` | 100,000 |
| `$5` | 333,000 |

即 **66,600 积分 = 1 美元**、**10,000 积分 = 1 人民币**，两者相除得到站点自报汇率 **6.66 CNY/USD**。适配把积分按 66,600:1 归一化到产品的 quota 单位，并把 6.66 作为账号的默认汇率（账号表单要求汇率是正数，缺省值会让「添加账号」按钮一直不可用）。模型价格同样按此换算成美元，且**标记为估算**：批量充值带赠送，实际单价低于基础档。


### 控制台路由

站点没有独立的登录路由（`/login`、`/sign-in`、`/signin`、`/register` 全部 404），未登录态由 `/dashboard` 自己处理，因此 `loginPath` 取 `/dashboard`。已核实的前台路由：`/dashboard`、`/dashboard/api-keys`、`/dashboard/models`、`/dashboard/user-info`、`/dashboard/consumption-log`、`/dashboard/billing`。

### 客户端地址（导出端点）

控制台「节点信息」给出两个 host：海外 `https://grsaiapi.com`、国内直连 `https://grsai.dakka.com.cn`；文档写明 OpenAI 兼容路径为 `${host}/v1/chat/completions`。导出的 endpoint 取海外节点 `https://grsaiapi.com/v1`。

## 实现落点

- 注册：`src/services/accountSiteDefinitions/`（identifier / family / definition / facade re-export）
- 传输：`src/services/apiService/grsai/`（endpoints、wire types、`md5.ts`、`signature.ts` 签名、会话换取与 transport、解析守卫）
- 适配器：`src/services/apiAdapters/grsai/`（账号数据、刷新、bootstrap/completion、密钥管理与编辑器、模型目录与价格）
- 会话：`src/services/accountSiteOnboarding/contentSession/grsai.ts`（读 `localStorage.Token` 并调控制台接口取账号身份）
- 呈现：`src/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy.ts` 的 Grsai 分支与 `keyManagement:native.editor.quotaCredits*` 文案

## 现实边界

- `xtx` 素材按次发放，写操作每次都要先换一次 config；这是站点自身的调用序列，不是额外开销的取舍。读请求不需要签名，因此不换 config，直接用保存的 token。
- 站点每次 `getConfig` 都会轮换 `localStorage.Token`，但旧 token 仍然可用（实测反复换发后原 token 依旧 `isAuth: true`）。刷新时会把新 token 写回账号；一旦账号被判定未授权，就走「浏览器会话再同步 → 校验身份 → 重试 → 写回」这条自愈路径（见上）。
- 再同步只在**刷新路径**上生效：`authUpdate` 是本仓库既有的凭据回写通道（RightCode / VoAPI v2 / sub2api 都只从刷新能力返回它）。密钥管理页的读写不经过刷新，那里遇到失效只报未授权的明确提示，等下一次刷新再自愈。
- 控制台 API 全是 POST，因此拿不到「被动浏览器身份校验」这条路（该契约只允许 GET）；账号是否仍登录由内容脚本会话提取器与控制台 `isAuth` 判定。
- 模型价格是从「积分」按站点基础档汇率换算的美元值，批量充值的赠送会让实际单价更低，所以标成估算而不是精确值；按分辨率分档的视频模型没有单一单价，直接标为「价格不可用」。
- 签名素材是站点自己的反爬/防重放设计，属于**观测到的行为**而非公开契约；站点改算法会让写功能失效，届时表现为 `参数格式错误`。
- 会话 token 是 JWT，`exp` 实测为「签发时刻 + 30 天」，每次 `getConfig` 换发都从当下重算，扩展刷新时会把新 token 写回账号，所以只要窗口内续过一次就一直是 30 天。**未验证**到期瞬间的行为（预期退化为游客会话 `isAuth: false`）；本地 `exp` 只用于诊断与选择提示文案，不用于跳过请求，避免时钟偏差把可用账号判死。
- 没有做「临近到期主动换一次」：换发确实会轮换 token，但除刷新路径外没有回写通道，换完即弃不会延长账号寿命；真正让窗口往前走的是每次账号刷新，因此不在读写路径上重复实现。

## 验证

- 签名单元测试用**实测捕获的素材 + 站点自身产生的 xtx**做主向量回归（不依赖网络）；另有账号数据、密钥管理、模型映射、内容脚本会话各一组。
- 密钥管理有真实读写证据链：在站点上实测列表、创建（含明文 key）、改名、删除，并已清空残留（结束时账号 0 把密钥、余额未变）；仓库内用 msw 复现同一组调用。
- 会话层单测：`sessionToken.test.ts`（到期解析的容错、开放接口 Token 形状）、`tokenResync.test.ts`（再同步的身份与来源判定）、`accountData.test.ts` 的 session recovery 组（自愈成功、跨账号拒绝、控制台归属不符拒绝、浏览器无可用会话、替换后仍不可用、开放接口 Token 不发请求、到期与拒绝给出不同诊断）。
- 浏览器 e2e：`e2e/accountOnboardingCommonFlows.spec.ts` 的「adds a Grsai account from its logged-in console session」用打桩站点跑真实扩展的「自动识别 → 确认添加 → 落库」，断言识别为 Grsai、账号身份与 token 正确、余额与今日消耗按积分汇率换算，且不出现一次性密钥弹窗；该用例随后在**站点标签页已关闭**的情况下改余额并刷新，断言扩展自己打到了控制台接口。
- 尚未自动化的部分（需要真实账号手动过一遍）：密钥管理页的增删改与导出端点、模型价格页、token 失效后的重新添加。
