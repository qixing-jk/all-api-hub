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

相对 `633926dce7`，首请求认证恢复从 5 种扩展到全部 14 种 Sub2API 签到方式。已选方式的首次状态 GET 可使用保存的刷新令牌续期，并校验账号身份。导入的方式需要先确认协议时，这个确认请求使用同一次恢复机会。后续提交遇到 401 时停止提交，回读可以确认服务端是否已经发奖。显式核验状态也可恢复一次，自动发现候选方式、后台刷新状态和提交后的回读均使用现有凭据。

| 本轮行为 | 可复查的证据 |
| --- | --- |
| 全部已注册方法的首读 401、导入选择、主动核验和被动查询，提交阶段才过期 | [本机 HTTP 服务与请求顺序断言](../../tests/services/apiService/sub2api/checkin/checkInHttpExecution.test.ts) |
| 只有刷新令牌时续期，持久化凭据后提交一次；没有凭据时跳过 | [账户存储与执行入口](../../tests/services/autoCheckin/execution/sub2apiRefreshTokenOnly.test.ts) |
| 浏览器绑定拒绝、Denxio 双阶段提交、DaiGua 和 NexaVlinks 的原生页与人工核验 | [绑定错误](../../tests/services/apiService/sub2api/checkin/statusSessionBinding.test.ts)、[两阶段请求](../../tests/services/autoCheckin/providers/sub2apiReadRequest.test.ts)、[DaiGua](../../tests/services/autoCheckin/providers/daigua.test.ts)、[NexaVlinks](../../tests/services/autoCheckin/providers/nexavlinks.test.ts) |

本轮签到、Sub2API 和账户请求构造的 Vitest 共 111 个文件、3,144 项通过，其中本机 HTTP 测试 117 项。Chromium 使用受控站点运行了 25 个扩展场景，包含原生验证码页和临近零点的自动签到。结果见本地 `artifacts/first-request-unit.log`、`artifacts/first-request-account.log` 和 `artifacts/first-request-chromium.log`。本轮线上账号的续期和领取结果尚未验证。

### 整分支复审

在 `85d3af2293` 上做整分支复审时，Chromium 的「立即运行」重现了导入选择被跳过。新增验收从调度入口和真实扩展页面发起，包含没有探测记录的选择以及只有刷新令牌的账号。每日自动发现保持被动，只有本轮对原选定协议得到认证拒绝时才允许继续确认。[调度测试](../../tests/services/autoCheckin/execution/sub2apiRefreshTokenOnly.test.ts) · [浏览器测试](../../e2e/apiKeyCasaCheckin.spec.ts)

限定标签页的请求只有在该标签页能发出时才会执行。New API 创建令牌的会话头随同源标签页请求发送。取消等待接收端的请求后，扩展不会补发 POST；已经进入发送阶段的请求保留“可能已提交”的判定。[路由](../../tests/services/apiTransport/request.test.ts) · [取消与发送证据](../../tests/services/apiTransport/currentTabTransport.test.ts) · [令牌创建](../../e2e/newApiTokenCreation.spec.ts)

导入账号在本次运行中建立的签到记录可以保存跨日回读的状态和可领取性。上一天的领取回执丢失时，历史仍显示结果不确定，账号保存新一天实际读到的状态。手动验证状态若在等待写入期间跨过站点零点，则保留原历史和重试队列。[Casa 跨日回读](../../tests/services/autoCheckin/providers/apiKeyCasa.test.ts) · [状态验证](../../tests/services/autoCheckin/execution/statusVerification.test.ts)

最终版本通过 134 个 Vitest 文件的 3,973 项测试。Chromium 通过 18 个扩展场景和 1 项构建准备，覆盖 Casa、AI-ROUTER、当前标签页探测和 New API 令牌创建。Firefox 通过 1 个 OAuth 回调场景。类型检查、受影响文件的 ESLint 和 Knip 均通过。本地日志见 `artifacts/whole-final-unit.log`、`artifacts/whole-final-chromium.log`、`artifacts/whole-final-firefox.log` 和 `artifacts/whole-final-types.log`。

### 前一轮证据

| 场景 | 可复查的证据 |
| --- | --- |
| Casa、Pro、FreeAPI、柏API、Clawhud 的主动核验、后台读取、首次 GET 或 POST 遇到 401、续期后仍无效、身份不符、403/429、异常回执与正常会话 | [真实本机 HTTP 测试](../../tests/services/apiService/sub2api/checkin/checkInHttpExecution.test.ts)。服务端记录 GET、续期、身份验证和签到 POST。原实现遇到无效令牌时，四种既有方法在首个 GET 停止。 |
| POST 收到 302/307、JWT 中间件拒绝、响应含领取数据或无法识别、部署特有的登录拒绝 | [重定向服务器测试](../../tests/services/apiService/sub2api/checkin/checkInRedirect.test.ts) 和 [认证恢复测试](../../tests/services/apiService/sub2api/checkin/unauthorizedRecovery.test.ts)。重定向曾向目标地址额外发送 GET 或 POST。 |
| Casa 与已有协议同时出现，Casa 的 GET 失败，镜像使用相同协议 | [发现与选择测试](../../tests/services/autoCheckin/discoverySelection.test.ts)。域名用于既有的平局判定；只有匹配协议的响应才证明可用。 |
| 北京时间零点前后读取、提交与回读，设备时区不同，切换方法或账号 | [Casa 执行测试](../../tests/services/autoCheckin/providers/apiKeyCasa.test.ts)、[账号快照](../../tests/services/autoCheckin/accountSnapshot.test.ts)、[状态核验](../../tests/services/autoCheckin/execution/statusVerification.test.ts) 和 [存储写入](../../src/services/checkin/autoCheckin/execution/accountExecution.ts)。跨日的无日期回执可证明领取成功，当天状态另行读取。 |

本机 HTTP 测试使用可控服务端和内存中的凭据持久化，实际经过扩展执行入口、HTTP 传输、令牌刷新及账号身份核对。浏览器会话恢复使用受控夹具。仍缺少 Casa 登录账号在真实部署上续期、成功领取和重复提交的证据。执行策略保留 Casa 的单次提交限制。

本轮相关 Vitest 共 159 个文件、4,145 项通过，包含 55 种本机 HTTP 组合。Chromium Playwright 通过 12 个扩展场景及 1 个构建步骤。[Casa 的浏览器场景](../../e2e/apiKeyCasaCheckin.spec.ts) 从设置页点击 Run now，检查收到 401 后只续期一次、以同一账号提交一次，并读取后台保存的成功结果。类型检查和 Knip 均通过。本地运行日志保留在 `artifacts/unit.log` 和 `artifacts/chromium.log`。
