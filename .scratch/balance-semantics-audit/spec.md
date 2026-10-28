# 余额语义审计（2026-10-28）

Status: needs-info

范围：注册站点类型的余额映射、实际业务含义及 integration skill 的改进。运行时代码只审计，不在本任务中修复。没有登录各站点、创建密钥、充值或调用付费推理。下表覆盖 identifiers.ts 的全部 45 个类型；同一行的兼容类型仅共享本地路径，不表示已验证其线上契约相同。

证据级别：**官方对照**表示本次读取官方公开资料并对照代码，不等于登录态实测；**代码核查**表示只确认本地实现及已有注释，站点结论仍待验证。记录的是本次工作树快照，不是永久支持矩阵。

## 逐类型核查

金额统一尺度来自 `src/constants/money.ts`：500,000 product quota/USD。它不证明上游 quota 单位，也不证明资产可当作通用余额。代码路径相对 `src/services/apiService/`，除非另有说明。

| 类型 | 当前映射 / 本地 owner | 对照结论与缺口 |
| --- | --- | --- |
| `one-api`, `new-api`, `apiyi`, `laozhang`, `ModelFlare`, `anyrouter`, `Veloera`, `one-hub`, `done-hub`, `v-api`, `VoAPI`, `Super-API`, `neo-Api`, `wong-gongyi` | `newApiFamily/default/accountData.ts`：self.quota 原样使用；缺失变 0；variant 可覆盖其他行为 | 代码核查。不能用本地 500,000 常量证明所有分叉/部署的单位相同；每个部署需 self 响应、原生显示及配置对照。缺失→0 会混淆不可用与真实零。 |
| `Rix-Api` | `newApiFamily/variants/rixApi.ts`：优先整数 quota，否则 balance USD × product scale；无有效值为 0 | 代码核查。保留代际差异；需验证具体部署的 balance 币种、负债和异常响应，不能由版本名推断。 |
| `voapi-v2` | `voapiV2/accountData.ts`：basicBalance 与 bindBalance 分别转 quota 后相加；parsing.ts 将非正数归零 | 代码核查。需原生现金/绑定信用是否同单位、可合并、是否到期，以及负债语义；当前缺失与负数都会变 0，不能从正余额用例验证这些边界。 |
| `unknown` | 同 New API 默认路径 | 未知类型不是已确认余额契约；不得宣称单位已验证。 |
| `sub2api` | `sub2api/parsing.ts`：用户 balance USD → quota；订阅独立 | 代码核查。需具体部署余额/订阅对照，部署福利积分不自动等价于 balance。 |
| `AIHubMix` | `aihubmix/index.ts`：self.quota 原样使用 | 代码核查。需官方当前额度尺度及非零原生显示对照；used_quota 为累计量，不是今日余额。 |
| `sharedchat` | `sharedchat/index.ts`：subscriptions.remainingAmount × product scale，且保留 subscription | **高优先级语义风险**：订阅剩余额度进入通用余额；未检查 active/expiry，也将缺失变 0。需原生 billingType、period、isActive 与非零过期样本；确认是否可汇总/入历史/估算收入。 |
| `freemodel` | `freemodel/index.ts`：(creditCents + signupCreditCents)/100 USD；5h/周额度独立 | 代码核查。需验证赠送信用是否已含在 creditCents、是否过期；套餐购买币种与使用信用币种分别确认。 |
| `dahl` | `dahl/index.ts`：token_balance + tokens_on_keys，按 $0.03/M 估值进 quota；subscription 保留 Token | 官方对照：池与 key 分配、Token 计量及定价均有依据。但估值进入普通金额统计，未设置 nativeBalance；**需进一步验证卡片估值标注与历史/收益含义**。不是未经依据的换算，也不是可提现现金。 |
| `foxcode` | `foxcode/index.ts`：active 中 NEVER 的 remaining /1e6 USD；重置计划独立 subscription | 代码核查。分离购买信用和重置额度的方向合理；需过期但仍在 active 的边界及混合周期样本。 |
| `xiaoen` | `xiaoen/index.ts`：native credits，total=permanent+daily；quota=0 | 代码核查。无已验证现金兑换，排除普通金额统计；需原生零值/每日过期样本。 |
| `emrank` | `emrank/accountData.ts`：native atomic Token，quota=0 | 代码核查。保留原子单位及 M Token 显示，不套金额常量；需当前部署非零显示对照。 |
| `krill` | `krill/index.ts`：credit_balance_usd × scale；每日计划另存 subscription | 代码核查。需信用与每日额度是否重复、有效订阅与重置时区对照。 |
| `cubence` | `cubence/index.ts`：normal_balance /1e6 USD；未把 charity 合并 | 代码核查。购买信用与公益信用区别已保留；公益额度是否需要独立显示须原生界面确认。 |
| `RightCode` | `rightcode/index.ts`：user.balance × scale；subscriptionSummary 独立 | 代码核查。需用户 balance 币种、订阅有效性与 summary.remaining_quota 的原生单位对照。 |
| `relayfor` | `src/services/apiAdapters/relayfor/accountData.ts`：USD nativeBalance，多组件/作用域/到期详情；普通 quota 保留 user.quota | 代码核查。已有 scoped 金额独立表示，排除通用金额统计；需验证 group、timed、订阅互斥/叠加及部分失败状态，不能合并成可互换余额。 |
| `requesty` | `requesty/index.ts`：organization.balance USD × scale；无 nativeBalance | 代码核查。账户组织范围与 key 月预算独立；需当前组织身份及非零余额对照。 |
| `openrouter` | `openrouter/index.ts`：(total_credits-total_usage) USD × scale | 官方对照：购买累计减已用符合 credits API 字段；key limit_remaining 是另一作用域。官方要求 management key；当前凭证是否满足需实测。 |
| `kimi` | `kimiOpenPlatform`：available CNY / 配置汇率 → USD quota | 官方对照：中国 balance API 的 available_balance 单位 CNY，现金与代金券分开，现金负数时 available 不简单等于二者相加。读取权威 available 的方向正确；汇率是产品换算，并非站点兑换承诺。未验证登录态 console 分支。 |
| `kimi-global` | 同家族：available USD → quota | 代码核查，国内文档不能证明国际站币种与赠送信用契约；需国际站非零响应/显示。 |
| `daya` | `daya/index.ts`：identity.balanceUsd × scale | 代码核查。需余额字段币种与组织/账号边界对照。 |
| `pmapi` | `pmapi/index.ts`, `identity.ts`：self.quota 原样；缺失为 0 | 代码核查。注释采用 New API quota；需具体部署显示尺度，缺失→0 风险仍在。 |
| `grsai` | `grsai/parsing.ts`：66,600 credits/USD；基于无赠送商品价，非通用 FX | 代码核查。当前商品价需复核；促销价不能替代稳定计量定义。 |
| `vercel-ai-gateway` | `vercelAiGateway/index.ts`：team balance USD；nativeBalance.total/permanent 均为 balance | 官方定价确认免费/付费 Gateway 信用；不是 Vercel 全产品余额。**permanent 无有效期依据**，混合信用不应据此宣称永久。当前 nativeBalance 也使其被排除出所有旧金额统计；需明确产品意图与原生免费信用到期行为。 |
| `novita` | `novita/parsing.ts`, `accountData.ts`：availableBalance/1e4 USD；cash 与 creditLimit 分项 | 官方对照：单位及信用额度（最大可欠款）相符。available 不是纯充值现金；当前使用权威 available 而非重算。nativeBalance 排除旧金额统计，需确认这种产品行为是否预期。 |
| `octopus`, `axonhub`, `claude-code-hub`, `cli-proxy-api`, `omniroute`, `gpt-load`, `magpie` | managed-only，无 saved-account balance adapter | 不适用账号余额；管理资源内 key/provider 预算不代表用户账户可用余额。 |

## 主要结论及下一步

不能给出“所有站点相符”的结论。已发现可重复的失真路径：订阅额度映射成金额、估值与原生资产混用、总额与组成部分双计、缺失变零、通用统计由 nativeBalance 是否存在决定而非币种决定。优先补 SharedChat 的原生契约；随后对 Dahl 的估值统计、Vercel 的 permanent 和统计排除策略作明确产品决策。审计风险不是已实测确认的线上缺陷，不在此直接修改运行时代码。

关闭各“代码核查”项的条件：同一身份/部署的余额页面与只读响应，包含非零有限金额、活动/过期计划、真实零与缺失、必要时负债；记录时间和版本。只读公开文档不能替代这部分。现有老注释可用于导航，不能当作本次实时确认。

## 本次公开证据

- [OpenRouter credits](https://openrouter.ai/docs/api/api-reference/credits/get-credits)：账户 purchased/used，管理密钥要求；[USD 信用](https://openrouter.ai/support)。
- [Kimi 查询余额](https://platform.kimi.com/docs/api/balance)：CNY、available/cash/voucher、负现金处理与区域凭证边界。
- [Novita balance](https://docs.novita.ai/api-reference/basic-get-user-balance)：1/10000 USD、available/cash/creditLimit。通过官方 llms.txt 定位，部分 `.md` URL 无法读取，普通页面成功。
- [Dahl tokens](https://inference.dahl.global/docs/tokens/) 与 [定价](https://inference.dahl.global/pricing/)：池/key 分配与总资产、$0.03/M、预付信用；已购买信用不失效，赠送信用有效期不能由此推断。
- [Vercel 定价](https://vercel.com/docs/ai-gateway/pricing)：免费与购买 Gateway 信用，需区分 tier 与有效期；本次没有登录态 credits 响应。

## Skill 改进与验收

复用 add-site-integration，新增 balance-semantics 引用，从入口、账户工作流和签到奖励路由到同一规则；不维护另一份永久站点单位清单。规则要求原生合同、来源/有效期/身份、双重计数检查、明确换算例子及消费者追踪。三个代表决策：Token 有价格仍需估值标注；USD nativeBalance 仍会触发统计排除；剩余订阅额度不自动成为现金余额。文档变更不修改用户行为，无运行时/截图验收项。

保留本 spec 及 skills 变更于 Git。无新生成原始响应或登录态凭据；没有待删除输出。后续应补真实部署证据与 red/green 回归，再修复经确认的问题。
