# 站点策略清理

先清理职责与重复策略，暂不引入 lint、白名单或引用额度。此文件是审计记录，不参与运行时或检查。

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

1. OpenRouter 的凭证验证、身份生成、去重和敏感错误处理（accountCreation/accountUpdate/accountDedupe/accountPersistence、accountAutoDetection、useAccountDialog）。需要一起定义持久化身份/凭证验证接口，不能将信任与诊断策略简化成站点布尔量。
2. New API 的交互验证（ManagedSiteChannelAssessmentSignalHelpers、AccountActionButtons、KeyManagement、managedSiteTokenBatchExportPreview、useManagedResourceInteraction、tokenBatchExport/tokenChannelStatus、accountBrowserSession）。当前执行与 UI 挑战过程具有提供方专属契约，需要完成整个验证流程的能力迁移。
3. 资源导航身份（managedSiteChannelResourceIdentity、TokenHeader）仍区分 AxonHub 原生字符串 ID 与本地数字投影，需要连同候选资源身份契约迁移。
4. KeyManagement/useKeyManagement 的配置指纹仍手动选择提供方字段；AxonHub 等类型目前落入 New API 分支。需要针对完整配置快照重做缓存失效和异步结果归属测试，这是缓存行为修复，未混入本轮静态策略迁移。
5. 模型同步/重定向的提供方执行流程（ModelRedirectService、modelSync/scheduler）需要 provider-owned 执行接口；保留 Octopus 流程及各提供方字段解码。
6. AIHubMix 一次性密钥恢复和保存后流程（accountKeyAutoProvisioning/repair、AddTokenDialog、useAccountDialog）仍涉及专门 UI 生命周期，应与创建密钥工作流一起迁移。

## 保留的合法身份用途

提供方实现、展示文案/图标与表格注册、持久化默认值、旧版本迁移、分析字段投影、UNKNOWN 哨兵和记录间身份一致性比较保留。SiteAnnouncements/utils 的提供方标记/旧记录展示也不作机械替换。

## 原扫描文件去向

下表逐项记录旧配额扫描的文件，不是新的允许名单。已清理表示本轮相关重复策略完成；保留表示有明确所有者的身份用途；后续表示需要上面的整体流程迁移。

| 文件 | 分类 | 原用途 |
| --- | --- | --- |
| src/components/ManagedSiteChannelAssessmentSignalHelpers.tsx | 后续 | New API verification presentation; migrate with the verification capability. |
| src/contexts/UserPreferencesContext.tsx | 保留 | Managed-site default selection; consolidate with runtime configuration. |
| src/features/AccountManagement/components/AccountActionButtons/index.tsx | 后续 | Existing feature-specific verification or one-time-key workflow; migrate through its capability seam. |
| src/features/AccountManagement/components/AccountDialog/AccessTokenVerificationGuide.tsx | 保留 | Provider-specific credential instructions and default selection. |
| src/features/AccountManagement/components/AccountDialog/AccountForm.tsx | 保留 | OpenRouter management-key form presentation. |
| src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts | 后续 | Existing OpenRouter onboarding, Sub2API refresh-token and AIHubMix post-save orchestration. |
| src/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding.ts | 保留 | OpenRouter-specific account onboarding workflow. |
| src/features/AccountManagement/components/AccountDialog/sitePolicy.ts | 已清理 | Existing provider-specific account-dialog policy overrides. |
| src/features/KeyManagement/KeyManagement.tsx | 后续 | OpenRouter scoped key creation and New API verification workflows. |
| src/features/KeyManagement/components/TokenListItem/TokenHeader.tsx | 后续 | AxonHub managed-resource link presentation. |
| src/features/KeyManagement/components/managedSiteTokenBatchExportPreview.ts | 后续 | New API verification preview gating. |
| src/features/KeyManagement/hooks/useKeyManagement.ts | 后续 | Existing managed-provider console navigation. |
| src/features/ManagedSiteChannels/providers/useManagedResourceInteraction.tsx | 后续 | New API verification interaction; migrate with the verification capability. |
| src/features/ManagedSiteModelSync/ManagedSiteModelSync.tsx | 后续 | New API channel reload after model synchronization. |
| src/features/ModelList/aihubmixModelList.ts | 保留 | AIHubMix-specific pricing metadata presentation. |
| src/features/SiteAnnouncements/utils.ts | 保留 | Sub2API announcement identity presentation. |
| src/features/TokenProvisioning/components/AddTokenDialog/index.tsx | 后续 | Existing feature-specific verification or one-time-key workflow; migrate through its capability seam. |
| src/services/accountBrowserSession/sessionReader.ts | 后续 | New API browser-session identity recovery. |
| src/services/accountBrowserSession/transientAuth.ts | 后续 | New API transient browser credential policy. |
| src/services/accounts/accountAutoDetection.ts | 后续 | Canonical OpenRouter onboarding and browser identity resolution. |
| src/services/accounts/accountCreation.ts | 后续 | OpenRouter credential-derived identity creation. |
| src/services/accounts/accountDedupe.ts | 后续 | OpenRouter credential ownership and duplicate identity semantics. |
| src/services/accounts/accountFormValidation.ts | 已清理 | OpenRouter user-id requirement; migrate into identity profile. |
| src/services/accounts/accountKeyAutoProvisioning/repair.ts | 后续 | AIHubMix one-time-secret repair workflow. |
| src/services/accounts/accountPersistence/shared.ts | 后续 | OpenRouter credential verification and persisted identity fields. |
| src/services/accounts/accountSiteProfile/urls.ts | 已清理 | Canonical AIHubMix URL profile selection. |
| src/services/accounts/accountStorage/accountRefresh.ts | 已清理 | Sub2API refresh-token expiry handling. |
| src/services/accounts/accountStorage/sub2ApiAuthPersistence.ts | 保留 | Provider-specific persisted Sub2API authentication updates. |
| src/services/accounts/accountUpdate.ts | 后续 | OpenRouter credential-derived identity updates. |
| src/services/accounts/migrations/sub2apiAuthMigration.ts | 保留 | Historical Sub2API authentication storage migration. |
| src/services/accounts/utils/siteRouteResolver.ts | 已清理 | AIHubMix canonical routes and New API credential-link policy. |
| src/services/accounts/utils/siteUrlNormalization.ts | 已清理 | Canonical AIHubMix URL compatibility helper. |
| src/services/managedSites/channelMatch.ts | 已清理 | Sub2API-specific managed resource matching. |
| src/services/managedSites/legacyChannelConfigMigration.ts | 保留 | Historical AxonHub channel identity migration. |
| src/services/managedSites/managedSiteChannelResourceIdentity.ts | 后续 | AxonHub channel identity decoding. |
| src/services/managedSites/tokenBatchExport.ts | 后续 | New API verification export gating. |
| src/services/managedSites/tokenBatchImportTarget.ts | 已清理 | Existing provider-specific batch import target policy. |
| src/services/managedSites/tokenChannelStatus.ts | 后续 | New API verification status integration. |
| src/services/managedSites/utils/channelMatching.ts | 已清理 | Sub2API-specific matching identity. |
| src/services/managedSites/utils/managedSite.ts | 已清理 | Legacy provider settings, default config and token routing; migrate by consumer. |
| src/services/modelList/accountSources/sub2apiEstimates.ts | 保留 | Provider-specific Sub2API model dashboard estimates. |
| src/services/models/modelRedirect/ModelRedirectService.ts | 后续 | Existing New API and DoneHub model redirect behavior. |
| src/services/models/modelSync/channelModelFilterEvaluator.ts | 保留 | Provider-specific channel model-filter decoding. |
| src/services/models/modelSync/octopusModelSync.ts | 保留 | Provider-specific Octopus synchronization implementation. |
| src/services/models/modelSync/scheduler.ts | 后续 | Existing provider-specific scheduling behavior; migrate with provider execution contracts. |
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
