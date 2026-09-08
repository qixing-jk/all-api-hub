# 站点策略清理

先清理职责与重复策略，暂不引入 lint、白名单或引用额度。此文件是审计记录，不参与运行时或检查。

最新状态：已整合 origin/main 6953346f6 的 scoped resource identity 重构。第二、三轮的本地指纹/导航接口已被上游统一配置指纹与 ManagedResourceRef 契约替代；下文保留实施历史，基线替代关系以第五轮记录为准，后续清理见第六至十二轮。第十二轮扩大为全仓库生产代码复扫，并补齐原清单之外的 URL 策略和一次性密钥双状态遗漏；暂不引入 lint。

## 本轮实现

- 撤销 93d25ac85 新增的 lint 规则、配额和配套测试，保留 tokenKey.optionalSkPrefix 元数据及测试。
- 账户注册负责名称、固定地址和默认名称； identity.userIdRequired 同时驱动弹窗和保存验证。
- URL 规范化只保留 profile 所属实现，删除转发层和没有生产调用的 AIHubMix 判断。URL 无站点提示时保留显式 opt-in 语义，避免扩大匹配范围。
- New API 的主题路由和缓存迁入已有 bootstrap 适配器路由接口；共享导航只负责分发和拼接 URL。
- 托管站点名称和消息命名空间合并到注册元数据；迁移目标查询归属 channelMigrationTargets，避免通用工具引入整套迁移适配器；目标由注册顺序和原生迁移能力推导。修正配置完整的 Sub2API 被旧名单遗漏的情况。
- 精确重复匹配读取提供方 matching.exactMatchBasis，保留 URL/key 与 key/models 两种语义。删除没有生产调用的候选来源名单。
- v1 导入回执 principal 的解析回到 runtimeConfig 所属模块，保持已有哈希序列化格式。
- 刷新串行化复用已有补充认证规范化结果，不再重复按 Sub2API 判断策略。
- 公告调度依据 provider.createSiteKey 去重，依据匹配 provider 的可选 markRead 执行同步，保留 providerId 和记录的一致性校验。

## 后续独立迁移

1. **已完成第十一轮清理**：OpenRouter 只读自动检测的 URL 准入与本地失败文案归注册策略；共享检测不再识别 OpenRouter。浏览器引导已核对：专属 hook 拥有创建、取消、过期结果隔离和凭证回收；useAccountDialog 保留显式选择此工作流的来源校验、回调写入身份与关闭失败诊断。KeyManagement 的原生创建/刷新与控制器共用 keyResourceManagement 注册。
2. **已完成第十轮清理**：New API 临时 dashboard 认证的来源准入和载荷校验由提供方纯校验器拥有；浏览器会话读取与自动检测共用 onboarding/transientAuth 注册入口。显式探测授权与已知站点信任边界保持不变。第七轮的托管会话挑战继续由专属 React 模块直接拥有。
3. **已完成第三轮清理**：匹配适配器的 resolveNavigationId 决定可用导航身份，AxonHub 自行拒绝历史数字投影。服务摘要显式携带 resourceId，TokenHeader 不再猜测站点规则；状态查询、批量导出与账户定位一起迁移。
4. **已完成第二轮清理**：KeyManagement/useKeyManagement 的配置指纹读取已有 runtimeConfig 解析结果，删除提供方字段名单；所有配置字段参与失效判断，字段顺序规范化，凭证仍只保留内存哈希。七类站点均覆盖凭证变更、旧结果晚返回、无关目标变更和配置清空。
5. **已完成第五轮清理**：上游 createSync 能力已承接 Octopus 执行流程；本地将链式映射与 DoneHub 计费前缀语义注册为 modelMappingPolicy。共享调度器/重定向服务不再依赖站点分支。提供方类型字段解码保留。
6. **已完成第九轮清理**：一次性密钥的创建响应转换由 keyManagement.createRuntimeSecret 注册；创建、保存后、复制和模型密钥弹窗通过该能力获取展示数据。后台修复由 inventorySecretAvailability 判断资格，确认与取消的 UI 状态继续由现有流程拥有。

## 保留的合法身份用途

提供方实现、展示文案/图标与表格注册、持久化默认值、旧版本迁移、分析字段投影、UNKNOWN 哨兵和记录间身份一致性比较保留。SiteAnnouncements/utils 的提供方标记/旧记录展示也不作机械替换。

## 原扫描文件去向

下表逐项记录旧配额扫描的文件，不是新的允许名单。已清理表示本轮相关重复策略完成；保留表示有明确所有者的身份用途；后续表示需要上面的整体流程迁移。

| 文件 | 分类 | 原用途 |
| --- | --- | --- |
| src/components/ManagedSiteChannelAssessmentSignalHelpers.tsx | 已清理 | 匹配能力提供不可比较密钥的恢复提示。 |
| src/contexts/UserPreferencesContext.tsx | 保留 | Managed-site default selection; consolidate with runtime configuration. |
| src/features/AccountManagement/components/AccountActionButtons/index.tsx | 已清理 | 定位渠道消费注册验证工作流，保留限定操作授权与会话配置校验。 |
| src/features/AccountManagement/components/AccountDialog/AccessTokenVerificationGuide.tsx | 保留 | Provider-specific credential instructions and default selection. |
| src/features/AccountManagement/components/AccountDialog/AccountForm.tsx | 保留 | OpenRouter management-key form presentation. |
| src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts | 已清理／保留 | 一次性密钥转换已迁入注册能力；OpenRouter 显式工作流选择及身份回调、专属确认状态与 Sub2API 认证流程保留。 |
| src/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding.ts | 保留 | OpenRouter-specific account onboarding workflow. |
| src/features/AccountManagement/components/AccountDialog/sitePolicy.ts | 已清理 | Existing provider-specific account-dialog policy overrides. |
| src/features/KeyManagement/KeyManagement.tsx | 已清理 | New API 验证按能力选择；原生密钥创建、刷新与页面选择共用 keyResourceManagement 注册，Workspace 字段解码和专属展示保留。 |
| src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx | 已清理 | 仅使用服务摘要提供的导航身份，无身份时打开列表。 |
| src/features/KeyManagement/components/managedSiteTokenBatchExportPreview.ts | 已清理 | 通过注册验证能力判断可恢复候选。 |
| src/features/KeyManagement/hooks/useKeyManagement.ts | 已清理 | 配置指纹归回运行时配置解析，移除遗漏站点的字段分支。 |
| src/features/ManagedSiteChannels/providers/useManagedResourceInteraction.tsx | 已清理 | 按注册工作流类型选择已实现的 New API React 会话验证。 |
| src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx | 已清理 | 删除 New API 全部同步前的重复列表预检，由后台统一读取并校验完整同步批次。 |
| src/features/ModelList/aihubmixModelList.ts | 保留 | AIHubMix-specific pricing metadata presentation. |
| src/features/SiteAnnouncements/utils.ts | 保留 | Sub2API announcement identity presentation. |
| src/features/TokenProvisioning/components/AddTokenDialog/index.tsx | 已清理 | 使用已注册的创建响应转换能力进入一次性密钥确认流程。 |
| src/services/accountBrowserSession/sessionReader.ts | 已清理 | 传递原始站点、提示与探测意图，由提供方校验临时认证准入。 |
| src/services/accountBrowserSession/transientAuth.ts | 已删除 | 提供方纯校验迁入 onboarding/contentSession/newApiTransientAuth，通用分发归 onboarding/transientAuth。 |
| src/services/accounts/accountAutoDetection.ts | 已清理 | 从 onboarding 注册解析来源准入和受控失败文案，不依据具体站点名称选择诊断策略。 |
| src/services/accounts/accountCreation.ts | 已清理 | 注册持久化能力负责凭证验证和存储身份准备。 |
| src/services/accounts/accountDedupe.ts | 已清理 | 使用注册能力提供的私有凭证比较键，结果不暴露密钥。 |
| src/services/accounts/accountFormValidation.ts | 已清理 | OpenRouter user-id requirement; migrate into identity profile. |
| src/services/accounts/accountKeyAutoProvisioning/repair.ts | 已清理 | 使用密钥库存可恢复性判断修复资格，保留旧跳过原因值。 |
| src/services/accounts/accountPersistence/shared.ts | 已清理 | 通用持久化编排消费能力，提供方拥有诊断脱敏与身份规则。 |
| src/services/accounts/accountSiteProfile/urls.ts | 已清理 | Canonical AIHubMix URL profile selection. |
| src/services/accounts/accountStorage/accountRefresh.ts | 已清理 | Sub2API refresh-token expiry handling. |
| src/services/accounts/accountStorage/sub2ApiAuthPersistence.ts | 保留 | Provider-specific persisted Sub2API authentication updates. |
| src/services/accounts/accountUpdate.ts | 已清理 | 注册持久化能力负责身份更新及验证时机，保留严格读取现有账户。 |
| src/services/accounts/migrations/sub2apiAuthMigration.ts | 保留 | Historical Sub2API authentication storage migration. |
| src/services/accounts/utils/siteRouteResolver.ts | 已清理 | AIHubMix canonical routes and New API credential-link policy. |
| src/services/accounts/utils/siteUrlNormalization.ts | 已清理 | Canonical AIHubMix URL compatibility helper. |
| src/services/managedSites/channelMatch.ts | 已清理 | Sub2API-specific managed resource matching. |
| src/services/managedSites/legacyChannelConfigMigration.ts | 保留 | Historical AxonHub channel identity migration. |
| src/services/managedSites/managedSiteChannelResourceIdentity.ts | 已清理 | 委托匹配适配器解析稳定 ID，不再内置 AxonHub 分支。 |
| src/services/managedSites/tokenBatchExport.ts | 已清理 | 批量预览依据匹配能力生成验证候选。 |
| src/services/managedSites/tokenBatchImportTarget.ts | 已清理 | Existing provider-specific batch import target policy. |
| src/services/managedSites/tokenChannelStatus.ts | 已清理 | 匹配能力拥有会话就绪状态查询；通用状态计算保留失败降级与脱敏。 |
| src/services/managedSites/utils/channelMatching.ts | 已清理 | Sub2API-specific matching identity. |
| src/services/managedSites/utils/managedSite.ts | 已清理 | Legacy provider settings, default config and token routing; migrate by consumer. |
| src/services/modelList/accountSources/sub2apiEstimates.ts | 保留 | Provider-specific Sub2API model dashboard estimates. |
| src/services/models/modelRedirect/ModelRedirectService.ts | 已清理 | 裁剪算法接收注册模型映射策略，不再判断 New API/DoneHub。 |
| src/services/models/modelSync/channelModelFilterEvaluator.ts | 保留 | Provider-specific channel model-filter decoding. |
| src/services/models/modelSync/octopusModelSync.ts | 保留 | Provider-specific Octopus synchronization implementation. |
| src/services/models/modelSync/scheduler.ts | 已清理 | 通过上游 createSync 工作流和注册模型映射策略分发。 |
| src/services/preferences/userPreferences.ts | 保留 | Persisted managed-site defaults and provider preference selection. |
| src/services/productAnalytics/settings.ts | 保留 | Existing provider-specific analytics settings projection. |
| src/services/siteAnnouncements/providers.ts | 保留 | Executable site-announcement provider dispatch and Sub2API implementation. |
| src/services/siteAnnouncements/scheduler.ts | 已清理 | Existing provider-specific scheduling behavior; migrate with provider execution contracts. |

## 验证

- 相关回归覆盖 95 个测试文件、1871 项测试，全部通过。
- 最后的 hostname 查询边界调整后，重跑 4 个路由/profile 测试文件、117 项测试，全部通过（含新增协议兼容回归）。
- 类型检查、未使用代码检查和源码 ESLint 检查通过；提交钩子的结果以最终提交为准。
- 未运行浏览器 E2E；本轮以服务、适配器和组件集成测试验证相关行为。

本轮完成上述职责清理。后续独立迁移仍待处理，不代表所有站点身份判断均已消除。


## 第二轮复扫与验证

范围：KeyManagement 状态缓存的配置归属、失效与异步结果，以及直接页面消费者。

- 已执行：以完整 runtimeConfig 替代 UI 内提供方字段清单，修复 AxonHub/Claude Code Hub/Sub2API 凭证变更遗漏。
- 已验证：配置变更重查、旧请求晚返回不覆盖新结果、无关站点变更不重查、配置清空失效；保留现有请求 runId 和已解析密钥隔离机制。
- 已清理：测试直接构造 preferences 快照，删除旧的扁平配置替身和重复空配置。
- 复扫：Hook 不再含站点常量或按提供方读取配置的分支；当前缓存归属范围无其他待执行清理。上面的其他整体流程迁移仍独立保留。
- 验证：12 个相关测试文件、255 项测试通过，类型检查通过；测试 fixture 整理由提交钩子再验证。


## 第三轮复扫与验证

范围：匹配候选的导航身份、轻量结果摘要、状态查询/批量导出与账户定位/TokenHeader 消费者。

- 已执行：matching.resolveNavigationId 承接提供方身份语义；未声明覆盖时沿用稳定候选 ID，明确返回 undefined 时不得回退。AxonHub 的原生字符串 ID 与历史数字投影规则留在适配器内。
- 已执行：所有生产摘要调用方透传 matching；resourceId 表示可导航身份，缺失时 UI 只能打开列表。没有新增站点名单、lint 或兼容性转发导出。
- 已验证场景：字符串原生 ID、数字稳定 ID、提供方重映射、拒绝数字投影、不回退到行 ID、批量导出摘要与账户定位透传。
- 复扫：本轮导航路径没有剩余站点身份判断。New API 交互验证等独立流程继续保留在后续清单中。
- **第四轮已解决依赖治理**：直接导入 AxonHub/Sub2API/Claude Code Hub 时，通用工具反向依赖 registry 会令注册表捕获未初始化能力。已拆分基础工具并迁移所有调用方，增加七种提供方优先导入的注册完整性回归。
- 基线同步：从 1c0c6be31 重放到 origin/main cc524857d，刷新后头为 712903d20。range-diff 确认六个本地提交改动等价；备份为 backup/site-policy-cleanup-before-refresh-1c0c6be31。上游签到更新未改变本轮接口。
- 验证：93 个相关测试文件、1485 项测试全部通过；类型检查和未使用代码检查通过。未运行浏览器 E2E，导航边界通过组件与服务测试验证；提交钩子结果以提交完成为准。


## 第四轮复扫与验证

范围：托管适配器的注册初始化、通用工具依赖与全部直接消费者。

- 已执行：channelKeys 拥有可用密钥判断；resourceSecrets 拥有配置/资源敏感信息收集及合并。两个模块均不依赖能力注册表，旧 managedSite 工具不保留转发导出。
- 已执行：原生资源、迁移、渠道匹配、模型同步与 UI 调用方直接导入所属模块。DoneHub/Veloera 不再用别名绕开循环依赖。
- 已执行：原有密钥和敏感信息测试迁到所属模块；删除没有生产调用的 needsManagedSiteChannelKeyResolution 及镜像断言。
- 已验证：新增导入顺序测试原先复现三个提供方能力丢失，拆分后七种入口均保留全部托管注册。敏感信息收集实现原样迁移，没有调整脱敏语义或遍历预算。
- 复扫：TypeScript 静态运行时 import 图中，七个托管适配器都已没有返回 apiAdapters/registry 的路径。这个依赖边界没有其他待执行清理；其余整体流程迁移仍保留在前文清单。
- 验证：143 个测试文件、2583 项测试通过；类型检查、未使用代码检查通过。首轮并行模型同步测试加载超时，单文件重跑及 maxWorkers=4 的整批重跑均通过。提交钩子结果以提交完成为准。


## 第五轮基线整合、模型策略与验证

范围：整合 6953346f6 的资源身份契约，清理模型同步/重定向的执行策略，保持既有注册初始化保证。

- 基线整合：旧头 46469d026，备份 backup/site-policy-cleanup-before-resource-refresh-46469d026，重放到 origin/main 6953346f6。前四个提交 range-diff 等价；基础清理按 ref 比较和新调度器契约合并；循环依赖清理跟随 Octopus 执行模块的新路径迁移。
- 替代关系：跳过旧第二轮 712903d20 与第三轮 09b9ea234 的重复实现。上游 getManagedSiteRuntimeConfigFingerprint 已提供完整目标配置归属；上游 ManagedResourceRef 已包含稳定身份与作用域，直接用于导航与匹配。没有恢复旧 numeric projection 或 resolveNavigationId 兼容接口。
- 已执行：New API 模型能力声明链式目标支持，DoneHub 模型能力负责计费前缀归一化；ModelRedirectService 只执行通用裁剪算法，保留环检测、未知值保留、空目标和无变化不写入等语义。
- 已执行：模型调度器从实际模型能力透传 modelMappingPolicy。Octopus 执行分发采用上游 createSync，未新增站点名单。
- 已执行：新增 Octopus 工作流会经过滤器反向依赖 registry，导入顺序测试确实复现失败。过滤器改为显式接收 matching 密钥读取能力，ModelSyncService 注入实际能力；Octopus 维持直接凭证、无隐藏密钥读取能力的原有边界。七种导入顺序已恢复通过。
- 已验证：提供方策略注册、链式映射保留、不可用循环裁剪、DoneHub 前缀保留、调度器策略透传、密钥失败脱敏与显式执行意图；复扫调度器与重定向服务没有具体站点常量分支。
- 后续仍独立保留：OpenRouter 凭证/身份持久化、New API 交互验证、AIHubMix 一次性密钥恢复流程。
- 验证：259 个相关测试文件、4484 项测试通过，类型检查和未使用代码检查通过；冲突文件 ESLint/格式检查通过。七种导入顺序完整性回归通过；未运行浏览器 E2E。提交钩子结果以提交完成为准。


## 第六轮账户持久化与凭证身份

范围：OpenRouter 凭证准入、存储身份、重复账户判断及敏感诊断披露。

- 已执行：OpenRouter 注册 account.persistence，直接负责验证时机、存储身份准备、错误文案和日志披露；创建、更新与 shared 不再判断 OpenRouter 身份。
- 已执行：账户扫描和弹窗通过能力提供的私有凭证比较键执行去重；切换站点时清理凭证身份，保持原有确认行为与密钥不进入结果的边界。
- 保持：仅修改元数据时不重复验证；更新读取失败或找不到原账户时拒绝保存；本地生成的存储身份不替换请求身份。
- 已验证场景：验证失败阻止保存、已有本地身份保留、敏感错误不写入日志/健康状态、能力按注册分发而非站点名称分发，以及七种提供方优先导入的注册完整性。
- 后续仍独立保留：OpenRouter 只读检测和浏览器引导、New API 交互验证、AIHubMix 一次性密钥恢复；未新增 lint。
- 验证：204 个相关测试文件、3359 项测试全部通过；类型检查和未使用代码检查通过。未运行浏览器 E2E；提交钩子结果以提交完成为准。


## 第七轮托管密钥验证恢复

范围：托管匹配的密钥恢复状态、提示、批量导出候选、账户定位与 React 验证入口。

- 已执行：New API 在 matching.secretVerification 注册会话就绪查询、不可比较密钥提示和已实现的会话工作流类型；服务层不再导入 New API 登录、会话或 TOTP 实现。
- 已执行：状态查询、批量导出和预览提示以实际能力为依据；账户定位、KeyManagement 和原生资源交互按已注册工作流选择专属验证实现。
- 保持：运行时会话/登录凭证/TOTP 状态与结构支持分离，查询失败仍降级为无法精确验证；验证码弹窗、取消行为、限定授权、隐藏密钥读取和迁移凭证解析维持原实现。
- 已验证：同名 New API 未声明能力时不探测会话，其他站点注册工作流时消费其恢复结果；资源引用保持与目标站点一致。提供方优先导入的七种注册完整性回归通过。
- 复扫：本轮状态、预览、提示及入口不再根据 NEW_API 站点身份推导支持。会话工作流标识是实际 React 实现的分发契约，专属模块内的配置检查继续保留。
- 独立后续：账户浏览器认证、OpenRouter 浏览器引导、AIHubMix 一次性密钥生命周期及既有模型同步页面刷新分支；未新增 lint。
- 验证：350 个相关测试文件、4778 项测试全部通过；账户操作与恢复分发补充定向回归 8 个文件、107 项测试通过（含与前者重叠的状态和交互测试）。类型检查和未使用代码检查通过；未运行浏览器 E2E，提交钩子以最终执行结果为准。


## 第八轮全部模型同步的列表归属

范围：模型同步页面 handleRunAll 的站点分支、列表请求及后台批次准备职责。

- 证据：页面的 latestChannels 仅用于判断列表加载是否成功，没有传给 TriggerAll。后台通用调度器会 listChannels，原生工作流会 prepareBatch；二者均检查空批次。
- 已执行：删除仅针对 New API 的前置 ListChannels 请求和 SITE_TYPES 导入，全部同步直接交给后台准备真实批次。保留手动列表刷新、主动操作授权、进行中保护与异步目标隔离。
- 行为调整：New API 全部同步不再刷新页面手动选择列表，也不再被该列表请求失败阻止；后台列表/同步失败仍按现有同步错误反馈并保留历史结果。没有为重复请求新增站点策略元数据。
- 已验证：新增成功/失败两种回归先复现旧分支阻止同步，再验证直接分发、返回结果与无额外列表请求；15 个模型同步组件/服务测试文件、281 项测试全部通过。
- 复扫：模型同步主页面已没有具体站点常量或站点名称分支；此调用链无其他待处理的重复预检。账户浏览器认证、OpenRouter 浏览器引导与 AIHubMix 一次性密钥生命周期仍独立待处理。
- 类型检查通过；未运行浏览器 E2E。提交钩子结果以最终提交为准，未新增 lint。


## 第九轮一次性密钥创建与后台修复边界

范围：创建响应的一次性密钥转换、创建/保存后/复制/模型密钥 UI 直接消费者，以及后台修复资格。

- 已执行：AIHubMix keyManagement 注册 createRuntimeSecret；规范 API 地址、掩码拒绝、完整响应读取和关联身份仍由提供方 createdSecret 实现拥有。通用契约不包含其 full_key 协议字段。
- 已执行：createdTokenSecretHandling 负责注册能力分发与缺失能力错误，四个界面不再直接导入 AIHubMix 转换函数；创建弹窗复用当前请求上下文的能力。
- 已执行：后台修复读取 inventorySecretAvailability，跳过 CreateResponseOnly 提供方；保留 aihubmixOneTimeKey 序列化原因值和现有文案，未改变存储结构。
- 保持：后台不尝试恢复只在创建时可见的明文密钥；前台确认、取消、失效请求隔离、复制和 API 凭证保存流程原样保留。保存后的名称兜底使用当前站点信息。
- 已验证：不同站点注册转换能力时正常分发，缺失时明确失败；其他站点声明一次性密钥库存时不会打开修复会话。原有掩码与关联身份测试保留。
- 复扫：创建/保存后/复制/模型密钥通用流程及后台修复不再直接依赖 AIHUBMIX 身份判断或其转换函数。AIHubMix 定价模型展示仍属于提供方元数据展示，不属于密钥生命周期。
- 独立后续：账户浏览器认证与 OpenRouter 浏览器引导。未新增 lint；未运行浏览器 E2E。
- 验证：大范围回归 238 个文件、3678 项测试，首轮仅复制密钥自定义创建用例失败（测试替身未注册转换能力）。补齐能力并修正日志 mock 提前初始化后，10 个相关文件、126 项测试全部通过；移动转换入口后的保存/模型流程另有 4 个文件、98 项测试通过。类型检查和未使用代码检查通过；提交钩子以最终执行结果为准。


## 第十轮浏览器会话临时认证准入

范围：浏览器会话与自动检测收到临时 dashboard 认证时的站点信任、来源和载荷校验。

- 已执行：New API 纯校验器拥有已知站点匹配、UNKNOWN 加显式探测加 New API 提示的准入条件，以及对象自身字段、类型、非空值和同源校验。
- 已执行：onboarding/transientAuth 注册纯校验器；sessionReader 与 autoDetectService 直接消费该入口。删除旧 accountBrowserSession/transientAuth，不保留转发导出。
- 依赖边界：完整会话提取器注册表会通过 Sub2API 回到浏览器会话解析，测试确实复现初始化循环。因此纯认证校验单独注册，不加载或执行可能刷新凭证的提取器。
- 保持：只有当前标签页显式请求可启用探测；其他已知站点不会被提示覆盖；临时 dashboard bearer 仍只用于完成认证，不写入账户 PAT。
- 已验证：17 个浏览器会话、自动检测、提供方引导及注册初始化测试文件、243 项测试全部通过；补充已知其他站点带探测许可和 New API 提示仍拒绝临时认证的回归。
- 复扫：sessionReader 已没有具体站点常量分支；旧校验模块无调用。OpenRouter 的只读检测与浏览器引导仍作为独立信任流程待处理。未新增 lint，未运行浏览器 E2E。
- 类型检查和未使用代码检查通过；提交钩子以最终执行结果为准。


## 第十一轮：只读检测披露与原生密钥入口

范围：原扫描剩余的 OpenRouter 只读检测、浏览器引导接入和 KeyManagement 原生密钥分发。

- OpenRouter 注册 AccountDetectionPrivacyPolicy，拥有 canonical URL 准入与本地失败提示。现有 onboarding 注册同时关联被动身份观察与检测披露策略；共享账户检测只消费策略，保留失败分类、恢复数据、只读语义和受控日志。
- 以请求 URL 选择策略，检测结果中的 siteType 提示不能授予来源信任。补充非 HTTPS、附加端口、blob、伪装域名、无效 URL 与伪造站点提示的行为测试；普通站点诊断仍保留。
- KeyManagement 的原生创建、刷新、页面工具及工作区展示改用已存在的 account.keyResourceManagement 注册，与原生控制器和加载路径一致；就绪判断继续检查 scope、加载状态与 freshReadRequired。以非 OpenRouter 的测试注册验证分发跟随能力，并保留原生/旧版互斥、加载失败与不确定删除恢复覆盖。
- 浏览器引导接入核对后保留：useAccountDialog 的 canonical 检查用于显式进入已有的 OpenRouter 变更工作流，onStarted/凭证回调写入该工作流确定的身份，关闭失败日志仅含本地状态。生命周期由 useOpenRouterAccountOnboarding 直接拥有；不另建一套通用工作流协议，也不以只读检测策略隐式授权创建凭证。
- KeyManagement 的 OPENROUTER_KEY_FIELD_IDS.Workspace 是提供方字段解码；现有工作区与原生密钥文案属于展示用途，保留。
- 验证：账户检测、onboarding、浏览器会话和专属 React hook 共 16 个文件，首次 266 项通过、1 项新增测试枚举名称错误；修正后该文件 22 项全部通过。KeyManagement 页面、原生控制器和修正后的检测测试共 5 个文件 144 项通过。compile、knip 通过。未运行浏览器 E2E。
- 最终复扫：原扫描候选没有未分类的迁移项；共享只读检测与 KeyManagement 主页面不再根据具体站点名称推断策略或支持。保留提供方实现、注册表、身份赋值/比较、展示字段和历史迁移用途。未新增 lint，后续约束规则仍待单独考虑。


## 第十二轮：全仓库复扫与清单外遗漏

审计边界：全仓库生产代码中的站点策略归属。检索覆盖 src、scripts 中 1731 个 TS/TSX/JS/MJS/CJS 文件及根配置；测试、文档和 E2E 的站点字面量作为契约/示例核对，不视为运行时支持名单。本记录是人工审计结论，不是自动 lint 或允许名单。

检索维度：SITE_TYPES 常量、siteType/site_type 的比较与 switch、站点名称字面量、域名集合、按站点索引的表、includes/Set、isCanonical/isProvider 等辅助判断；沿新增候选追踪注册元数据、直接消费者、状态所有者及测试。仅检查注册存在不足以证明消费者迁移，必须读到页面最后的展示和保存路径。

### 清单外候选及处理结果

| 位置 | 发现与最终处理 |
| --- | --- |
| services/managedSites/managedSiteConsoleRoutes.ts | 独立七站路由表迁入各 managedResource.consoleRoutes 注册；URL 构造只消费元数据。每站显式声明路径，保留 HTTP/LAN、配置根路径和无效 URL 行为。注册读取防御复制嵌套路由。 |
| services/siteDetection/autoDetectService.ts | 独立 AIHUBMIX_HOSTNAME_SET 和固定 API origin 分支迁为 urls.autoDetectOrigin 元数据；使用已有 inferFromHostname 显式准入，不复用含义不同的存储/导出地址。原输入解析和跨域标签页行为保留。 |
| features/AccountManagement/components/AccountDialog | 保存已有 CreatedRuntimeSecret，展示仍依赖旧 ApiToken，且存在 AIHubMix 名称/地址回退。显示、复制与保存统一消费 CreatedRuntimeSecret，删除重复状态与专属回退。继续创建渠道所需的 token 由已有 pending workflow ref 拥有。 |
| features/AccountManagement/components/CopyKeyDialog、features/ModelList/components/ModelKeyDialog | 同样的展示/保存双状态一并删除，提供方生成的 CreatedRuntimeSecret 成为一次性密钥展示结果。关闭、账户切换和会话重置均清空该状态。 |
| features/TokenProvisioning/hooks/useLegacyApiTokenSecretResult.ts | 最后三个生产消费者迁移后删除该转接 hook 和专门验证此转接实现的测试。可恢复 token 的认证格式化仍有导出/请求调用，保留。 |

### 复扫后保留的具体用途

- accountSiteDefinitions、apiAdapters/registry、managedSites/runtimeConfig、channelMigrationCapabilityRegistry、checkin/providers/registry：元数据或可执行适配器注册、配置解码及协议变体选择；它们本身是策略所有者。
- siteDetection/detectSiteType、accountSiteOnboarding/contentSession、apiService 与 apiAdapters 的提供方实现：根据协议响应识别身份、解析载荷或执行提供方协议。识别出站点的返回值不等同于在业务层猜测支持能力。
- AccountDialog/AccountForm、AccessTokenVerificationGuide、useOpenRouterAccountOnboarding、ManagedSiteVerification、BasicSettings 专属页面：提供方认证引导、明确授权的生命周期与 UI 选择；保留来源/会话信任边界。
- ManagedSiteChannels/presentation 的字段/表格/迁移展示、ManagedSiteIcon、aihubmixModelList、SiteAnnouncements/utils：协议字段、人类可读名称和提供方文案。Sub2API 迁移的默认分组文案是已经生成的迁移结果展示，不决定迁移资格。
- accountRuntimeKeys/ref、nativeResources/factory、accountDedupe、刷新/写入/迁移回执校验、浏览器身份校验：比较记录是否属于同一站点/账户，不是能力名单。
- UNKNOWN 默认值、UserPreferences 默认站点、productAnalytics 投影、历史迁移、赞助入口预填和开发预览：数据身份、兼容格式或示例。messagesKey 的显式翻译分支保留静态 i18n 提取。
- scripts 和根配置未发现新增的运行时站点能力分支。

### 验证与结论

- 路由覆盖七类托管站点，补充 Sub2API 路径、HTTP LAN 根路径和注册嵌套对象防御复制。
- 账户弹窗先用仅有 CreatedRuntimeSecret 的场景复现旧展示分支失败，迁移后创建/保存/保存失败/关闭及后续渠道流程通过。模型密钥测试暴露遗漏 createRuntimeSecret 的旧能力替身，补齐真实提供方转换后 30 项通过。
- 账户弹窗、复制密钥、模型密钥、URL/profile、注册及会话/认证格式化相关测试分组共 18 个不同文件、404 项测试最终全部通过；compile、knip 通过。浏览器 E2E 未运行。
- 当前全仓库站点策略复扫未发现其他有明确收益、可保持行为且验证成本合理的待执行项。三个新发现组已完成；上述保留用途已分类。此结论限于站点策略清理，不表示仓库不存在其他架构改进空间。没有新增 lint，也没有推送。
