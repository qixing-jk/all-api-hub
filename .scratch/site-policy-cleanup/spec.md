# 站点策略清理

先清理职责与重复策略，暂不引入 lint、白名单或引用额度。此文件是审计记录，不参与运行时或检查。

最新状态：已整合 origin/main 6953346f6 的 scoped resource identity 重构。第二、三轮的本地指纹/导航接口已被上游统一配置指纹与 ManagedResourceRef 契约替代；下文保留实施历史，基线替代关系以第五轮记录为准，后续清理见第六至八轮。

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

1. OpenRouter 的只读自动检测与浏览器引导（accountAutoDetection、useAccountDialog）。凭证验证、持久化身份、去重和敏感错误处理已在第六轮迁入注册能力；只读检测仍有独立的来源信任边界。
2. New API 的浏览器账户身份恢复与临时认证（accountBrowserSession）。托管密钥验证的恢复状态、提示和工作流选择已在第七轮迁入 matching.secretVerification；会话挑战实现继续由专属 React 模块直接拥有。账户浏览器认证属于独立信任流程。
3. **已完成第三轮清理**：匹配适配器的 resolveNavigationId 决定可用导航身份，AxonHub 自行拒绝历史数字投影。服务摘要显式携带 resourceId，TokenHeader 不再猜测站点规则；状态查询、批量导出与账户定位一起迁移。
4. **已完成第二轮清理**：KeyManagement/useKeyManagement 的配置指纹读取已有 runtimeConfig 解析结果，删除提供方字段名单；所有配置字段参与失效判断，字段顺序规范化，凭证仍只保留内存哈希。七类站点均覆盖凭证变更、旧结果晚返回、无关目标变更和配置清空。
5. **已完成第五轮清理**：上游 createSync 能力已承接 Octopus 执行流程；本地将链式映射与 DoneHub 计费前缀语义注册为 modelMappingPolicy。共享调度器/重定向服务不再依赖站点分支。提供方类型字段解码保留。
6. AIHubMix 一次性密钥恢复和保存后流程（accountKeyAutoProvisioning/repair、AddTokenDialog、useAccountDialog）仍涉及专门 UI 生命周期，应与创建密钥工作流一起迁移。

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
| src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts | 后续 | Existing OpenRouter onboarding, Sub2API refresh-token and AIHubMix post-save orchestration. |
| src/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding.ts | 保留 | OpenRouter-specific account onboarding workflow. |
| src/features/AccountManagement/components/AccountDialog/sitePolicy.ts | 已清理 | Existing provider-specific account-dialog policy overrides. |
| src/features/KeyManagement/KeyManagement.tsx | 后续 | New API 验证已按能力选择；OpenRouter scoped key creation 仍属于其独立工作流。 |
| src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx | 已清理 | 仅使用服务摘要提供的导航身份，无身份时打开列表。 |
| src/features/KeyManagement/components/managedSiteTokenBatchExportPreview.ts | 已清理 | 通过注册验证能力判断可恢复候选。 |
| src/features/KeyManagement/hooks/useKeyManagement.ts | 已清理 | 配置指纹归回运行时配置解析，移除遗漏站点的字段分支。 |
| src/features/ManagedSiteChannels/providers/useManagedResourceInteraction.tsx | 已清理 | 按注册工作流类型选择已实现的 New API React 会话验证。 |
| src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx | 已清理 | 删除 New API 全部同步前的重复列表预检，由后台统一读取并校验完整同步批次。 |
| src/features/ModelList/aihubmixModelList.ts | 保留 | AIHubMix-specific pricing metadata presentation. |
| src/features/SiteAnnouncements/utils.ts | 保留 | Sub2API announcement identity presentation. |
| src/features/TokenProvisioning/components/AddTokenDialog/index.tsx | 后续 | Existing feature-specific verification or one-time-key workflow; migrate through its capability seam. |
| src/services/accountBrowserSession/sessionReader.ts | 后续 | New API browser-session identity recovery. |
| src/services/accountBrowserSession/transientAuth.ts | 后续 | New API transient browser credential policy. |
| src/services/accounts/accountAutoDetection.ts | 后续 | Canonical OpenRouter onboarding and browser identity resolution. |
| src/services/accounts/accountCreation.ts | 已清理 | 注册持久化能力负责凭证验证和存储身份准备。 |
| src/services/accounts/accountDedupe.ts | 已清理 | 使用注册能力提供的私有凭证比较键，结果不暴露密钥。 |
| src/services/accounts/accountFormValidation.ts | 已清理 | OpenRouter user-id requirement; migrate into identity profile. |
| src/services/accounts/accountKeyAutoProvisioning/repair.ts | 后续 | AIHubMix one-time-secret repair workflow. |
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
