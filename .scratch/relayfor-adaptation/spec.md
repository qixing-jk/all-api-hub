# RelayFor 站点适配 spec

Status: ready-for-human

关联需求：[站点适配 #1659](https://github.com/qixing-jk/all-api-hub/issues/1659)。目标站点：<https://relayfor.xyz/>。

## 站点边界

RelayFor 是独立账号站点，使用自研控制台协议，单独注册 `SITE_TYPES.RELAYFOR` 和 `ACCOUNT_SITE_ADAPTER_FAMILIES.RelayFor`，不作为 New API / One API 衍生系统处理，不提供托管站点管理。

- 控制台和账号 API 同源；推理地址为 `https://relayfor.xyz/v1`。
- 使用 Bearer Access Token；浏览器会话读取 `relayfor_token`，兼容 `topublic_proxy_token`，并通过 `/api/user/self` 验证身份。
- 官方面板使用 hash 路由：`/console/#overview`、`#tokens`、`#models`、`#usage`、`#redeem`。签到和公告位于概览。
- 账号登录方式配置、原生 TOTP 输入和托管站点能力不在本次范围内。

## 账号与额度

`GET /api/user/overview` 提供用户、今日统计、累计用量和原生权益；`GET /api/user/timed-quotas` 补充限时额度明细。协议额度比例为每美元 500,000 点，由 API service 常量统一维护。

- 保留永久、限时、套餐和分组额度，分别展示适用分组、解锁模型、有效期、重置时间和不限额权益。套餐分组与解锁模型是不同事实，不相互替代。
- 有效套餐按状态及起止时间筛选；套餐剩余量使用上游 `quota_remaining`，不从总额减已用量推算。
- 限时明细读取失败时保留已确认的概览额度，并标明明细不可用。
- 原生 USD 利用额度不代表可自由互换的现金余额。共享 `supportsMonetaryBalance` 规则将所有原生资产排除在总余额、余额历史、收入估算和数值余额比较之外；账户卡片仍可展示详情，已确认的 USD 消费统计仍可使用。
- 当前账号不具备货币余额资格时，已有历史快照也不能用于展示或收入估算。该规则不修改用户保存的排除偏好。

## 密钥管理

原生协议为 `GET/POST /api/user/tokens`、`PUT/DELETE /api/user/tokens/:id` 和 `POST /api/user/tokens/:id/rotate`。

- 列表密钥为脱敏值，不可作为可用明文导出。创建和轮换响应中的一次性明文通过共享密钥交付流程返回，并关联到对应账号和资源；不能因随后的列表刷新失败而丢失。
- 操作顺序为编辑、启用或禁用、轮换、删除。启停仅写入 `status`（1/2），直接执行并呈现加载与失败反馈；它不等同于永久撤销。
- 轮换使用共享破坏性确认，明确旧密钥立即失效。准备、失败、重试与取消期间保留轮换意图，准备完成前禁止确认；取消不写入。
- 不确定的写入结果要求重新读取，不能自动重放轮换或其他敏感写入。TOTP 拒绝提供前往官网处理的提示，不自动输入或重试。
- 支持名称、额度、模型白名单、IP/CIDR 白名单、过期时间，以及 5 小时/日/周/月预算、RPM 和并发限制；编辑时保留未知 `limits` 字段。
- 区分零额度、`-1` 跟随账户和不限额。写入使用 `expires_at`，读取使用 `expired_at`；IP 白名单保留原生字符串表示。
- 日常卡片展示额度、用量、限制、预算预占及重置事实。模型白名单同时进入共享运行时密钥兼容性策略。

## 模型与价格

`GET /api/user/models` 映射账号模型目录，保留按次、按 Token、缓存读写和长上下文价格；长上下文规则放在 `pricingPlan`，不混入模型说明。

- 展示模型可访问性、拒绝原因、套餐条件、训练授权、提示词审计及额外费用；授权操作通过官网入口完成。
- 原生模型分组选项与产品本地分组筛选分开。用户明确应用后才调用 `PUT /api/user/model-group`，再读取目录确认结果；活跃会话锁定时禁止切换。
- 远程压缩按次费用独立展示，禁用的压缩能力不作为免费端点宣传。

## 签到、兑换、公告与调用历史

- 签到读取 `/api/user/checkin-campaigns`，仅领取 `can_claim` 日期，使用 `/api/user/checkin-campaigns/:id/claim`；今日状态与历史补签分开，补签提供官网入口。
- 多活动逐项处理；部分失败保留已确认额度、非现金权益和完成数量，不伪装为整体成功，也不自动重放不确定领取。
- 兑换使用 `/api/user/redeem`，复用共享批量逐项结果与失败重试；保留套餐、分组和限时权益描述，不将所有结果假装成现金入账。
- `/api/site/announcement` 接入共享公告展示与本地已读机制，不宣称同步官网已读。
- `/api/user/logs` 通过账号原生 `usageHistory` capability 接入分页同步，保留请求耗时、缓存、退款和错误事实。

## 职责与交付配套

- `src/services/apiService/relayfor/` 拥有 HTTP 协议、错误解析和浏览器凭据读取。
- `src/services/apiAdapters/relayfor/` 拥有原生事实到产品模型的映射；`keyEditor.ts` 负责编辑字段与验证，`keyFields.ts` 提供轻量字段词典。
- 共享账号密钥层负责生命周期、不确定写入保护及一次性密钥交付；feature 层负责交互与状态。
- 公共支持列表及相关使用说明同步中文、英文、日文；新应用文案覆盖全部支持的 locale。
- [官网体验差异审计](ux-audit-20261020.md) 保留实现前的协议证据与差距，属于历史基线，不代表最终实现仍有这些差距。

## 验收入口与证据边界

- 协议及映射：`tests/services/apiService/relayfor/`、`tests/services/apiAdapters/relayfor/`。
- 签到：`tests/services/autoCheckin/providers/relayfor.test.ts`；货币资格、历史与排序由对应共享服务测试覆盖。
- 密钥、额度与模型交互：`tests/features/KeyManagement/`、`BalanceDisplay.test.tsx`、`ProviderGroupSelector.test.tsx`。
- 实际扩展的确定性 Chromium 流程：`e2e/relayForAccountParity.spec.ts`、`e2e/relayForKeyManagement.spec.ts`，覆盖读取、路由切换、部分失败、启停、轮换、复制及编辑保存。模拟协议响应不等同于真实上游写入验证。
- 个人登录态只读验收入口：`pnpm e2e:cdp:relayfor -- --isolate`；依赖已登录会话，证据保留本地，不进入普通 CI。
- 未验收范围：真实站点敏感写入、受 TOTP 保护的真实操作、Firefox 和移动端。未保留完整匹配的前后截图，不宣称具备该视觉比较证据。
