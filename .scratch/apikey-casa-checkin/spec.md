# ApiKey Casa 签到与 Sub2API 认证恢复

关联 [PR #1932](https://github.com/qixing-jk/all-api-hub/pull/1932) 和 [现场诊断 #1892](https://github.com/qixing-jk/all-api-hub/issues/1892)。分支基线为 `f797bb00a7`。本轮复查前版本为 `52dbeb135a`。

## 协议证据

2026-11-27，Casa 公开的 [原生兑换页脚本](https://apikey.casa/assets/RedeemView-BnsB1fCw.js) 从 `GET /redeem/checkin` 读取状态，并将同路径 POST 的返回值装回同一个状态对象。按钮读取 `checked_in` 和 `reward`。原生文案声明按北京时间重置。页面可以证明前端使用的协议，公开设置中的版本号无法确定部署来源。扩展按状态响应识别方法。`reward` 控制可领取性，不能作为本次到账的凭证。

以下为公开站点的实际 GET 结果。两种凭据条件依次为省略 Authorization 和提供无效的测试 Bearer 值。未使用真实账号或向站点提交签到。

| 地址 | 无凭据 | 无效凭据 |
| --- | --- | --- |
| Casa `/api/v1/redeem/checkin` | 401 `UNAUTHORIZED` | 401 `INVALID_TOKEN` |
| Casa `/api/v1/redeem/checkin/status`（现有 Pro 读取路径） | 404 | 404 |
| FreeAPI `/api/v1/user/checkin` | 401 `UNAUTHORIZED` | 401 `INVALID_TOKEN` |

FreeAPI 的公开配置将站点命名为“露娜”。其 [已有协议记录](../freeapi-checkin/spec.md) 解释了必要字段及重复提交保证的证据边界。小白Code 的独立签到应用有[单独验证的登录错误](../xiaobai-code-checkin/research.md)，需要保留它自己的 `ok: false`、`LOGIN_REQUIRED` 信封。

## 验收入口

| 场景 | 可复查的证据 |
| --- | --- |
| Casa、Pro、FreeAPI、柏API、Clawhud 的主动核验、后台读取、首次 GET 或 POST 遇到 401、续期后仍无效、身份不符、403/429、异常回执与正常会话 | [真实本机 HTTP 测试](../../tests/services/apiService/sub2api/checkin/checkInHttpExecution.test.ts)。服务端记录 GET、续期、身份验证和签到 POST。原实现遇到无效令牌时，四种既有方法在首个 GET 停止。 |
| POST 收到 302/307、JWT 中间件拒绝、响应含领取数据或无法识别、部署特有的登录拒绝 | [重定向服务器测试](../../tests/services/apiService/sub2api/checkin/checkInRedirect.test.ts) 和 [认证恢复测试](../../tests/services/apiService/sub2api/checkin/unauthorizedRecovery.test.ts)。重定向曾向目标地址额外发送 GET 或 POST。 |
| Casa 与已有协议同时出现，Casa 的 GET 失败，镜像使用相同协议 | [发现与选择测试](../../tests/services/autoCheckin/discoverySelection.test.ts)。域名用于既有的平局判定；只有匹配协议的响应才证明可用。 |
| 北京时间零点前后读取、提交与回读，设备时区不同，切换方法或账号 | [Casa 执行测试](../../tests/services/autoCheckin/providers/apiKeyCasa.test.ts)、[账号快照](../../tests/services/autoCheckin/accountSnapshot.test.ts)、[状态核验](../../tests/services/autoCheckin/execution/statusVerification.test.ts) 和 [存储写入](../../src/services/checkin/autoCheckin/execution/accountExecution.ts)。跨日的无日期回执可证明领取成功，当天状态另行读取。 |

本机 HTTP 测试使用可控服务端和内存中的凭据持久化，实际经过扩展执行入口、HTTP 传输、令牌刷新及账号身份核对。浏览器会话恢复使用受控夹具。仍缺少 Casa 登录账号在真实部署上续期、成功领取和重复提交的证据。执行策略保留 Casa 的单次提交限制。

本轮相关 Vitest 共 159 个文件、4,145 项通过，包含 55 种本机 HTTP 组合。Chromium Playwright 通过 12 个扩展场景及 1 个构建步骤。[Casa 的浏览器场景](../../e2e/apiKeyCasaCheckin.spec.ts) 从设置页点击 Run now，检查收到 401 后只续期一次、以同一账号提交一次，并读取后台保存的成功结果。类型检查和 Knip 均通过。本地运行日志保留在 `artifacts/unit.log` 和 `artifacts/chromium.log`。
