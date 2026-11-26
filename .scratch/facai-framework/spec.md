# 在 All API Hub 内完成 New API 管理 Access Token 创建

Status: ready-for-human

实施已于 2026-11-23 开始，分支 `feat/new-api-access-token-ui` 基于 `origin/main` 的 `c058947641`，保留原分支与未提交 IDE 配置。用户追加要求：real-site 的账户准备接入扩展创建 UI，并保留官方 UI 作为独立验证渠道。两条渠道分别验证签发、身份、保存和后续请求，不以一个渠道的成功补足另一个渠道的失败。

TDD 的已确认公共边界是创建服务的后端协议、账户创建组件的用户动作及 real-site 的扩展/官方 UI 完整流程。协议测试不能替代 OAuth/Passkey 的浏览器上下文验收；真实 UI 测试不能代替缺失的账号因子覆盖。

## 目标与问题

由 All API Hub 提供管理 Access Token（scoped PAT）的权限、期限、安全验证和创建界面，使后端提供相应 API、但站点没有实现可用管理页面的用户也能完成账户添加。AI 发财网是发现问题和实际验收的部署之一；它当前账户只提供 Linux DO 验证，不能据此限制通用实现或声明完整覆盖。

2026-11-23 用户明确要求覆盖各种 OAuth、账密等常规方式，并将本次主题限定为“通过我们自己页面的相关验证来替代……无网站实际 UI 情况的……access token 创建流程”。本规格据此细化[调查记录](INVESTIGATION.md#长期认证可行性2026-11-23)的实施方向；已实现扩展创建、安全验证、独立校验与恢复。最终证据见 [本地验收报告](artifacts/acceptance.md)。

## 产品范围

- 保留 `siteType: new-api`，按只读后端契约发现 scoped PAT 能力；入口不依赖某个域名、本站账户状态或是否能探测到 `/security` 页面。其他兼容类型须明确采用相同协议后才启用。
- 在现有账户添加/凭证补全处提供“创建管理令牌”流程。用户在扩展里选择授权用途、期限和可用验证方式，完成后校验新令牌并填回原账户表单，继续正常保存与刷新。保留之前识别的身份和表单值。
- 扩展拥有创建界面与流程状态；站点后端仍负责验证身份、检查权限和签发令牌。OAuth 提供方登录/授权、Passkey 系统交互在正确的网页/浏览器上下文中完成，结果返回扩展继续创建。
- 已有管理令牌可继续验证复用。当前网页登录可作为签发所需的身份；未登录或会话失效时接入已有登录/恢复流程。本次核心是登录后的管理令牌创建，不以重做整个登录体系为前提。
- 现有账户存储、普通刷新和请求鉴权机制优先复用；验证密码、一次性验证码、临时 proof 和短时 Dashboard Bearer 不作为长期账户凭据保存。
- 保留手工填写令牌和可用的网站入口。对不提供 scoped PAT 契约的旧部署继续使用已核实的原路径，不误调用会旋转凭据的 legacy `GET /api/user/token`。

## 验证方式覆盖

实现范围以固定上游协议和相关部署差异为依据；具体用户看到的选择由 `GET /api/verify/methods?scope=access_token.generate` 决定。网站的登录方式列表与当前操作允许的验证方式是两个独立集合。已登录也不意味着通过了创建令牌的二次验证；后端要求较强验证时不能降级。

| 方式 | 需要实现的路径 | 当前证据与缺口 |
| --- | --- | --- |
| 密码 | 当前身份的密码验证，支持后端要求的密码加密及密钥更新；错误、锁定和取消可恢复 | 上游 `VerificationInput` 与策略已核对；现有密码登录可提供部分基础能力，PAT 验证 UI/调用已实现，真实密码渠道通过 |
| 2FA | 后端允许的验证码验证，覆盖错误、过期/重放、锁定、重试；恢复码按具体操作实际允许的契约处理 | 上游存在 `2fa`；现有托管站验证仅服务不同操作，不能把其 proof 直接用于 PAT 创建 |
| Passkey | 在站点要求的 origin/RP ID 下执行 WebAuthn 并返回操作 proof；覆盖设备不可用、取消和超时 | 上游存在独立验证流程；不能直接把站点的 RP ID 用于扩展 origin，也不能只提供“去网站设置”的死路 |
| 标准 OAuth | GitHub、Discord、Linux DO、OIDC 等部署提供且账号已绑定的可用选项；使用 `intent: verify`，校验回调后回到同一签发流程 | 现有登录 transport 声明这四种，现已扩展为 PAT 安全验证实现；本站实际 Linux DO 验证、签发、保存与无 Cookie 刷新通过 |
| 其他上游 OAuth 提供方 | 动态发现已启用且已绑定的自定义提供方；纳入 Telegram 等在上游验证目录中的方式，处理其实际协议差异 | 上游 `verificationOAuthProviders` 包含自定义提供方和 Telegram；不能只扩大枚举就声称完成接入 |

不应把任何登录入口自动当成 PAT 验证方法。例如微信/其他专用登录路径是否可用于 `access_token.generate`，必须由操作验证契约证明。新增或未知方法保留服务端不可用原因和明确恢复说明，不将未实现方法展示为可用，也不以未知字段为由隐藏已支持的方法。

## 创建闭环

1. 确认原站 origin、当前账户身份和可用浏览器会话；读取 scoped PAT 目录及当前操作的验证要求。若已有可用的管理令牌，支持复用。
2. 展示名称、权限和有效期。使用后端目录和真实 scope 语义，按拟启用能力推荐所需权限；如签到依赖的 `wallet:write` 同时包含其他钱包操作，需要说明其授权范围。长期限和永不过期须按实际契约处理，不把目录默认 30 天解释为最长或永久保证。
3. 用户发起创建时，绑定最终 scope 集合和 `expires_at`，通过选定的可用方式取得 `access_token.generate` proof。变更权限/期限或账户会话后必须重新验证。
4. 带相同身份/会话及 proof 签发一次 PAT。OAuth 使用属于本次请求的 state 和回调；针对缺少验证 UI 的前端，扩展须完成回调交接，防止网站普通登录逻辑先消费授权码。遵循服务端配置的 OAuth 回调规则，不假设可任意替换为扩展地址。
5. 接收只返回一次的令牌明文，单独用该 PAT 检查 `/api/user/self` 身份和本次需要的读取能力；不借用网页 Cookie/Bearer 掩盖错误。验证后填回原表单，正常保存并确认关闭站点标签页后仍能刷新。
6. 对用户取消、会话/proof 过期、身份变化、验证不可用、权限不足、令牌数量上限、签发结果不确定和保存失败分别提供可继续的状态。签发响应丢失不得自动再次创建；创建后保存失败不能丢失唯一明文再强制重建。保持成功/失败/未知结果的区别。

取消和暂时网络失败保留非敏感表单输入；秘密材料的留存按现有认证存储规则设计，并在成功、明确取消或失效时清理。并发流程按 origin、用户、会话和本次操作隔离，不能复用同源另一账户或 `channel.key.read` 的 proof。

## 现有责任点与复用边界

- [凭证引导 UI](../../src/features/AccountManagement/components/AccountDialog/form/AccessTokenVerificationGuide.tsx)和[自动检测错误入口](../../src/features/AccountManagement/components/AccountDialog/detection/AutoDetectErrorAlert.tsx)：接入创建流程，复用当前表单及 popup 到完整页面/侧栏的继续机制。
- [账户补全](../../src/services/apiAdapters/newApi/account/accountCompletion.ts)、[凭证契约探测](../../src/services/apiService/newApiFamily/default/accessTokenDialect.ts)、[bootstrap](../../src/services/apiService/newApiFamily/default/accountBootstrap.ts)：当前 scoped 分支只返回验证要求；创建应由显式用户动作启动，不能放进只读探测隐式签发。
- [账户登录](../../src/services/apiAdapters/newApi/account/accountLogin.ts)、[浏览器 OAuth](../../src/services/apiAdapters/newApi/account/browserOAuth.ts)、[现有认证会话](../../src/services/apiAdapters/newApi/account/authenticatedSession.ts)：复用浏览器执行、身份检查和会话协调；登录回调返回用户信息与验证回调返回 proof 必须分别建模。
- [托管站验证契约](../../src/services/managedSites/providers/newApi/newApiSessionContracts.ts)目前只有 `channel.key.read`，方法模型只涵盖其现有用法；实现前选择最小合适的共同协议层，保留各操作 scope/context 的约束。此处不是要求迁移整个托管站模块。

## 验收与证据矩阵

- [ ] **能力发现**：有/无 scoped PAT 契约、有/无原站创建 UI、仅密码、仅 OAuth、多 OAuth、自定义提供方、2FA/Passkey、方法禁用或锁定；界面跟随操作能力，不固化本次账号。
- [ ] **各验证方法**：上表每一项闭环覆盖到创建并校验 PAT；分别记录上游协议、实际实现、测试和真实部署证据，不能用 Linux DO 一条成功代表其余方法。
- [ ] **绑定与错误恢复**：错误密码/验证码、取消、超时、会话替换、错误 OAuth 账号、重复回调、权限/期限变更、proof 失效、签发成功但响应丢失、创建后保存失败、多账户并发。
- [ ] **持久使用**：正常表单保存、新 PAT 独立鉴权、站点标签页关闭后的刷新、到期/撤销后的恢复、有限期/无到期选项的实际后端接受情况。
- [ ] **兼容性**：已有手工令牌、已保存账户及 legacy 分支保持正确；密码登录和已有 OAuth 调用方回归，Chrome 默认并检查 Firefox/Safari 等相关扩展权限、回调和 WebAuthn 差异。
- [ ] **验证层次**：TDD 覆盖行为与协议分支；扩展 E2E 覆盖真实上下文/弹窗/回调；可行时使用固定版本自建 New API 配置不同账号与因子完成真实后端测试。模拟 OAuth 提供方和 WebAuthn 虚拟设备的范围单独注明，不冒充第三方实际登录或用户硬件验证。
- [ ] **目标部署验收**：独立 CDP 开发浏览器加载当前构建，从正常自动添加入口跑完 AI 发财网可用方法的验证、签发、保存和刷新；优先复用授权的站点认证并处理 Cookie 轮换边界。日用 Edge 桥接仅用于网站/会话访问；最终验证源账户登录及临时资源清理。
- [ ] **交付**：保留现有失败 UI 作可比基线，展示扩展创建页和完成结果；同步相关 UI 文案/翻译。仅修改能力而未改变公共目录声明时不扩展站点目录。缺少特定提供方、账号因子或环境只能标为待验证，不能标为上游不支持或完整完成。

本规格不把新站点分类、推理密钥编辑、完整管理令牌管理中心或全站登录重写纳入本次交付。必要的撤销/过期恢复及测试资源清理仍属于创建流程验收。其他认证方式的账号材料不足时，继续独立可完成的实现和测试，并精确记录剩余验证条件。

## 交付记录（2026-11-23）

已实现密码（含加密）、2FA、站点 origin 内 Passkey、标准与自定义 OAuth/Telegram；按后端操作目录显示。默认只读授权且身份读取不可取消。签发后核对 scoped PAT 类别、权限和期限，再以无 Cookie 请求验证身份与选定读取能力。签发不确定记录跨重开保留，校验失败保留唯一明文；扩展可检查令牌并经新验证撤销指定 ID，回读确认后恢复。会话重连保留草稿和结果。

真实发财网在独立 Chromium CDP 中通过普通添加入口完成 Linux DO 验证、永不过期只读 PAT 签发、保存，以及关闭站点/清理 Cookie 后刷新。授权的 Edge 会话迁移只作为环境准备，结束时源浏览器真实身份请求已恢复成功。保留独立测试浏览器内用户可用的账户。原有识别曾失败、重试约76秒才成功，首次稳定性与性能仍有独立缺口。

real-site 默认使用扩展 UI，并保留显式官方 UI 渠道。两条真实密码渠道均独立验证签发、无 Cookie 身份、保存刷新与资源清理。Chrome 十项受控流程覆盖九类方法和撤销恢复；Firefox157实际验证立即注入与 document_start 回调捕获。真实 GitHub/Discord/OIDC/自定义/Telegram、硬件 Passkey与 Safari 未实测，不能将受控用例视为真实第三方验证。已有实际 New API 部署承担真实后端验收，没有额外部署 OAuth 提供方或配置硬件因子。

独立审查问题已修复并复查。详细报告、图片与失败记录在忽略的 `artifacts/`；此前 `test-results/facai-*` 历史产物被 Playwright 清理，不能再作为可打开证据。协议记录保留在 Git，原会话 transcript 未修改。

历史发财网回放脚本留在本地 `artifacts/legacy-facai-ui.mjs`。它依赖旧版界面，执行时会签发永久令牌并保存账户。当前验证使用 `e2e/realSite/newApiAccountAdd.spec.ts` 中维护的流程。
