import {
  filterUsageDashboardRecords,
  filterUsageRecords,
  gatewaySpent,
  groupImportRecords,
  groupUsageDashboardByDay,
  groupUsageDashboardByTarget,
  localDateKey,
  summarizeUsageDashboard,
  summarizeUsageRecords,
  usageState,
} from "./usageStats.js"
import { APP_VIEWS, normalizeAppView } from "./viewState.js"

const state = {
  sessionToken: "",
  providers: [],
  profiles: [],
  records: [],
  schedules: [],
  channelTemplates: [],
  activeProfileId: "",
  profileNameEdited: false,
  channelNameEdited: false,
  selectedProvider: null,
  category: "全部",
  configured: false,
  groups: [],
  preview: null,
  pendingSchedule: null,
  mappings: [],
  createdChannelId: null,
  pendingInsecureLoginUrl: "",
  credentialTargetUrl: "",
  credentialUserId: "",
  usageAutoRefreshStarted: false,
  createInFlight: false,
  activeView: "import",
}

const TOKEN_PLACEHOLDER = "粘贴管理员的系统访问令牌"
const USAGE_REFRESH_INTERVAL_MS = 3_000
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const $ = (selector) => document.querySelector(selector)
const elements = {
  accessLogout: $("#access-logout"),
  serviceLabel: $("#service-label"),
  serviceDetail: $("#service-detail"),
  pageEyebrow: $("#page-eyebrow"),
  pageTitle: $("#page-title"),
  pageDescription: $("#page-description"),
  connectionPill: $("#connection-pill"),
  configForm: $("#config-form"),
  configStatus: $("#config-status"),
  targetUrl: $("#target-url"),
  profileSelect: $("#profile-select"),
  profileName: $("#profile-name"),
  newProfile: $("#new-profile"),
  loginUsername: $("#login-username"),
  loginPassword: $("#login-password"),
  rememberSession: $("#remember-session"),
  openLoginPage: $("#open-login-page"),
  allowInsecureHttp: $("#allow-insecure-http"),
  insecureHttpRow: $(".insecure-http-row"),
  tokenForm: $("#token-form"),
  userId: $("#user-id"),
  adminToken: $("#admin-token"),
  rememberToken: $("#remember-token"),
  toggleConfig: $("#toggle-config"),
  providerCount: $("#provider-count"),
  providerSearch: $("#provider-search"),
  categoryList: $("#category-list"),
  providerList: $("#provider-list"),
  credentialEmpty: $("#credential-empty"),
  credentialForm: $("#credential-form"),
  credentialStatus: $("#credential-status"),
  selectedType: $("#selected-type"),
  providerMonogram: $("#provider-monogram"),
  providerName: $("#provider-name"),
  providerDescription: $("#provider-description"),
  channelType: $("#channel-type"),
  channelName: $("#channel-name"),
  channelGroups: $("#channel-groups"),
  channelGroupsHelp: $("#channel-groups-help"),
  refreshGroups: $("#refresh-groups"),
  channelPriority: $("#channel-priority"),
  channelPriorityHelp: $("#channel-priority-help"),
  channelWeight: $("#channel-weight"),
  channelWeightHelp: $("#channel-weight-help"),
  priorityDescending: $("#priority-descending"),
  priorityStepField: $("#priority-step-field"),
  priorityStep: $("#priority-step"),
  sourceBaseUrl: $("#source-base-url"),
  baseUrlHelp: $("#base-url-help"),
  configSource: $("#config-source"),
  configSourceHelp: $("#config-source-help"),
  refreshChannelTemplates: $("#refresh-channel-templates"),
  apiKey: $("#api-key"),
  keyHelp: $("#key-help"),
  rawKeyField: $("#raw-key-field"),
  providerConfig: $("#provider-config"),
  credentialModeField: $("#credential-mode-field"),
  credentialMode: $("#credential-mode"),
  providerConfigFields: $("#provider-config-fields"),
  providerModelsField: $("#provider-models-field"),
  providerModels: $("#provider-models"),
  providerModelsHelp: $("#provider-models-help"),
  providerModelMappingsField: $("#provider-model-mappings-field"),
  providerModelMappingsLabel: $("#provider-model-mappings-label"),
  providerModelMappings: $("#provider-model-mappings"),
  providerModelMappingsHelp: $("#provider-model-mappings-help"),
  quotaMode: $("#quota-mode"),
  uniformQuotaField: $("#uniform-quota-field"),
  uniformQuota: $("#uniform-quota"),
  perLineQuotaField: $("#per-line-quota-field"),
  keyQuotas: $("#key-quotas"),
  quotaHelp: $("#quota-help"),
  awsGlobalField: $("#aws-global-field"),
  awsGlobalInference: $("#aws-global-inference"),
  scheduleEnabled: $("#schedule-enabled"),
  scheduleOptions: $("#schedule-options"),
  scheduleStartAt: $("#schedule-start-at"),
  scheduleBatchSize: $("#schedule-batch-size"),
  scheduleIntervalMinutes: $("#schedule-interval-minutes"),
  batchMode: $("#batch-mode"),
  keyLabel: $("#key-label"),
  unsupportedNote: $("#unsupported-note"),
  previewButton: $("#preview-button"),
  previewDialog: $("#preview-dialog"),
  previewPanel: $("#preview-panel"),
  previewName: $("#preview-name"),
  previewProvider: $("#preview-provider"),
  previewBaseUrl: $("#preview-base-url"),
  previewGroups: $("#preview-groups"),
  previewPriority: $("#preview-priority"),
  previewWeight: $("#preview-weight"),
  previewAwsRoutingFact: $("#preview-aws-routing-fact"),
  previewAwsRouting: $("#preview-aws-routing"),
  modelCount: $("#model-count"),
  batchInputCount: $("#batch-input-count"),
  batchKeyCount: $("#batch-key-count"),
  batchSkippedCount: $("#batch-skipped-count"),
  batchQuotaTotal: $("#batch-quota-total"),
  batchDedupCopy: $("#batch-dedup-copy"),
  modelList: $("#model-list"),
  modelOverflow: $("#model-overflow"),
  finalModelCount: $("#final-model-count"),
  mappingCount: $("#mapping-count"),
  mappingList: $("#mapping-list"),
  actualModelOptions: $("#actual-model-options"),
  suggestMappings: $("#suggest-mappings"),
  addMapping: $("#add-mapping"),
  manualModels: $("#manual-models"),
  duplicateBox: $("#duplicate-box"),
  duplicateCopy: $("#duplicate-copy"),
  duplicateTarget: $("#duplicate-target"),
  duplicateConfirmCopy: $("#duplicate-confirm-copy"),
  confirmDuplicates: $("#confirm-duplicates"),
  createChannel: $("#create-channel"),
  discardPreview: $("#discard-preview"),
  createStatus: $("#create-status"),
  balanceCard: $("#balance-card"),
  balanceMetrics: $("#balance-metrics"),
  remainingBalance: $("#remaining-balance"),
  spentBalance: $("#spent-balance"),
  initialBalance: $("#initial-balance"),
  balanceMessage: $("#balance-message"),
  refreshBalance: $("#refresh-balance"),
  refreshRecords: $("#refresh-records"),
  refreshSchedules: $("#refresh-schedules"),
  scheduleEmpty: $("#schedule-empty"),
  scheduleList: $("#schedule-list"),
  refreshUsageMonitor: $("#refresh-usage-monitor"),
  usageMonitorSyncStatus: $("#usage-monitor-sync-status"),
  usageMonitorTarget: $("#usage-monitor-target"),
  usageMonitorStart: $("#usage-monitor-start"),
  usageMonitorEnd: $("#usage-monitor-end"),
  usageMonitorRange: $("#usage-monitor-range"),
  monitorKeyCount: $("#monitor-key-count"),
  monitorKeyDetail: $("#monitor-key-detail"),
  monitorQuotaTotal: $("#monitor-quota-total"),
  monitorQuotaDetail: $("#monitor-quota-detail"),
  monitorSpentTotal: $("#monitor-spent-total"),
  monitorSpentDetail: $("#monitor-spent-detail"),
  monitorRemainingTotal: $("#monitor-remaining-total"),
  monitorRemainingRing: $("#monitor-remaining-ring"),
  monitorRemainingRingValue: $("#monitor-remaining-ring-value"),
  monitorRemainingPercent: $("#monitor-remaining-percent"),
  monitorRemainingDetail: $("#monitor-remaining-detail"),
  monitorCoveragePercent: $("#monitor-coverage-percent"),
  monitorCoverageDetail: $("#monitor-coverage-detail"),
  usageMonitorGrid: $("#usage-monitor-grid"),
  siteUsageList: $("#site-usage-list"),
  dailyUsageChart: $("#daily-usage-chart"),
  usageMonitorEmpty: $("#usage-monitor-empty"),
  usageKeyCount: $("#usage-key-count"),
  usageKeyDetail: $("#usage-key-detail"),
  usageQuotaTotal: $("#usage-quota-total"),
  usageQuotaDetail: $("#usage-quota-detail"),
  usageSpentTotal: $("#usage-spent-total"),
  usageCoverageDetail: $("#usage-coverage-detail"),
  usageRemainingTotal: $("#usage-remaining-total"),
  usageRequestCount: $("#usage-request-count"),
  usageLastChecked: $("#usage-last-checked"),
  usageTokenTotal: $("#usage-token-total"),
  usageTokenDetail: $("#usage-token-detail"),
  usageSummaryNote: $("#usage-summary-note"),
  recordsTargetFilter: $("#records-target-filter"),
  recordsProviderFilter: $("#records-provider-filter"),
  recordsStatusFilter: $("#records-status-filter"),
  recordsSearch: $("#records-search"),
  resetRecordFilters: $("#reset-record-filters"),
  recordsEmpty: $("#records-empty"),
  recordsTableWrap: $("#records-table-wrap"),
  recordsBody: $("#records-body"),
  toast: $("#toast"),
}

elements.accessLogout.addEventListener("click", async () => {
  elements.accessLogout.disabled = true
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } finally {
    window.location.reload()
  }
})

function setAppView(value, { updateHash = true, scroll = true } = {}) {
  const view = normalizeAppView(value)
  const copy = APP_VIEWS[view]
  state.activeView = view
  elements.pageEyebrow.textContent = copy.eyebrow
  elements.pageTitle.textContent = copy.title
  elements.pageDescription.textContent = copy.description
  document.querySelectorAll("[data-app-view]").forEach((section) => {
    section.classList.toggle("view-hidden", section.dataset.appView !== view)
  })
  document.querySelectorAll("[data-view-target]").forEach((link) => {
    const active = link.dataset.viewTarget === view
    link.classList.toggle("active", active)
    if (link.closest("nav")) {
      if (active) link.setAttribute("aria-current", "page")
      else link.removeAttribute("aria-current")
    }
  })
  if (updateHash && window.location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`)
  }
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" })
}

for (const link of document.querySelectorAll("[data-view-target]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault()
    setAppView(link.dataset.viewTarget)
  })
}
elements.connectionPill.addEventListener("click", () => setAppView("sites"))
window.addEventListener("hashchange", () =>
  setAppView(window.location.hash, { updateHash: false }),
)

const setLoading = (button, loading) => {
  button.classList.toggle("loading", loading)
  button.disabled = loading
}

const showStatus = (
  element,
  message,
  isError = false,
  { recovering = false } = {},
) => {
  element.textContent = message
  element.classList.remove("hidden")
  element.classList.toggle("error", isError)
  element.classList.toggle("recovering", recovering)
}

const hideStatus = (element) => {
  element.textContent = ""
  element.classList.add("hidden")
  element.classList.remove("error")
  element.classList.remove("recovering")
}

let toastTimer
const toast = (message, isError = false) => {
  clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.remove("hidden")
  elements.toast.classList.toggle("error", isError)
  toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 4200)
}

async function api(path, options = {}) {
  const send = () =>
    fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Importer-Session": state.sessionToken,
        ...options.headers,
      },
    })
  let response = await send()
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error("本地服务返回异常")
  }
  if (response.status === 401) {
    window.location.reload()
    throw new Error("系统登录已失效，请重新输入访问密钥")
  }
  if (
    response.status === 403 &&
    payload.error === "本地会话已失效，请刷新页面"
  ) {
    const bootstrapResponse = await fetch("/api/bootstrap", {
      cache: "no-store",
    })
    const bootstrapPayload = await bootstrapResponse.json()
    if (bootstrapResponse.ok && bootstrapPayload.sessionToken) {
      state.sessionToken = bootstrapPayload.sessionToken
      response = await send()
      payload = await response.json()
    }
  }
  if (!response.ok) {
    const error = new Error(payload.error || "操作失败")
    error.status = response.status
    error.retryAfterMs = Number.isFinite(payload.retryAfterMs)
      ? payload.retryAfterMs
      : null
    throw error
  }
  return payload
}

const initials = (name) =>
  name
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "AI"

function renderProviderIcon(container, provider) {
  container.replaceChildren()
  if (!provider.hasIcon) {
    container.textContent = initials(provider.name)
    return
  }
  const image = document.createElement("img")
  image.src = `/provider-icons/${encodeURIComponent(provider.id)}.svg`
  image.alt = ""
  image.loading = "lazy"
  image.addEventListener("error", () => {
    image.remove()
    container.textContent = initials(provider.name)
  })
  container.append(image)
}

function renderConnection(config) {
  state.configured = Boolean(
    (config.hasSession || config.hasToken) && config.targetUrl && config.userId,
  )
  elements.targetUrl.value = config.targetUrl || ""
  elements.profileName.value = config.name || ""
  state.profileNameEdited = false
  state.activeProfileId = config.profileId || ""
  elements.profileSelect.value = state.activeProfileId
  elements.loginUsername.value = config.username || ""
  elements.userId.value = config.userId || "1"
  elements.rememberToken.checked = config.rememberToken !== false
  elements.rememberSession.checked = config.profileId
    ? config.rememberSession === true
    : true
  elements.allowInsecureHttp.checked = config.allowInsecureHttp === true
  updateInsecureHttpVisibility()
  elements.connectionPill.classList.toggle("connected", state.configured)
  elements.connectionPill.querySelector("strong").textContent = state.configured
    ? new URL(config.targetUrl).host
    : "尚未配置"
  state.credentialTargetUrl = config.targetUrl || ""
  state.credentialUserId = config.userId || ""
  if (config.hasToken) {
    elements.adminToken.required = false
    elements.adminToken.placeholder = "已安全保存；修改时重新输入"
  } else {
    elements.adminToken.required = true
    elements.adminToken.placeholder = TOKEN_PLACEHOLDER
  }
}

function resetSavedTokenHintIfConnectionChanged() {
  const target = elements.targetUrl.value.trim().replace(/\/+$/, "")
  const savedTarget = state.credentialTargetUrl.replace(/\/+$/, "")
  const userId = elements.userId.value.trim()
  if (target === savedTarget && userId === state.credentialUserId) return
  elements.adminToken.required = true
  elements.adminToken.placeholder = TOKEN_PLACEHOLDER
}

function renderProfiles() {
  elements.profileSelect.replaceChildren()
  const emptyOption = document.createElement("option")
  emptyOption.value = ""
  emptyOption.textContent =
    state.profiles.length === 0 ? "尚未添加站点" : "＋ 添加新的 New API"
  elements.profileSelect.append(emptyOption)
  for (const profile of state.profiles) {
    const option = document.createElement("option")
    option.value = profile.profileId
    option.textContent = `${profile.name} · ${profile.target}`
    elements.profileSelect.append(option)
  }
  elements.profileSelect.value = state.activeProfileId
}

function renderGroups(groups = []) {
  state.groups = groups
  elements.channelGroups.replaceChildren()
  for (const group of groups) {
    const label = document.createElement("label")
    label.className = "group-option"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.name = "channel-group"
    input.value = group
    input.checked = group === "default"
    const text = document.createElement("span")
    text.textContent = group
    label.append(input, text)
    elements.channelGroups.append(label)
  }
  if (groups.length > 0 && !groups.includes("default")) {
    elements.channelGroups.querySelector("input").checked = true
  }
  if (groups.length === 0) {
    const empty = document.createElement("span")
    empty.className = "group-options-empty"
    empty.textContent = state.configured
      ? "没有读取到分组，请点右下角重新读取。"
      : "连接 New API 后显示可选分组。"
    elements.channelGroups.append(empty)
  }
  elements.channelGroupsHelp.textContent =
    groups.length > 0
      ? `已读取 ${groups.length} 个分组，直接点击即可多选。`
      : "连接 New API 后读取该站点分组。"
  elements.refreshGroups.disabled = !state.configured
}

async function loadGroups() {
  if (!state.configured) {
    renderGroups([])
    return
  }
  elements.refreshGroups.disabled = true
  elements.channelGroupsHelp.textContent = "正在读取当前站点分组…"
  try {
    const result = await api("/api/groups")
    renderGroups(result.groups || [])
  } catch (error) {
    renderGroups([])
    elements.channelGroupsHelp.textContent = `分组读取失败：${error.message}`
    if (/认证|access token|Unauthorized/i.test(error.message)) {
      state.configured = false
      elements.connectionPill.classList.remove("connected")
      elements.connectionPill.querySelector("strong").textContent = "令牌已失效"
      elements.adminToken.required = true
      elements.adminToken.placeholder =
        "令牌已失效，请粘贴新的管理员系统访问令牌"
      showStatus(elements.configStatus, error.message, true)
      elements.configForm.classList.remove("hidden")
    }
    toast(error.message, true)
  } finally {
    elements.refreshGroups.disabled = !state.configured
  }
}

const selectedGroups = () =>
  [
    ...elements.channelGroups.querySelectorAll(
      'input[type="checkbox"]:checked',
    ),
  ].map((input) => input.value)

function renderCategories() {
  const categories = [
    "全部",
    ...new Set(state.providers.map((item) => item.category)),
  ]
  elements.categoryList.replaceChildren()
  for (const category of categories) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = category
    button.classList.toggle("active", state.category === category)
    button.addEventListener("click", () => {
      state.category = category
      renderCategories()
      renderProviders()
    })
    elements.categoryList.append(button)
  }
}

function filteredProviders() {
  const query = elements.providerSearch.value.trim().toLowerCase()
  return state.providers.filter((provider) => {
    const matchesCategory =
      state.category === "全部" || provider.category === state.category
    const haystack =
      `${provider.name} ${provider.id} ${provider.description}`.toLowerCase()
    return matchesCategory && (!query || haystack.includes(query))
  })
}

function renderProviders() {
  const providers = filteredProviders()
  elements.providerCount.textContent = `${providers.length} / ${state.providers.length}`
  elements.providerList.replaceChildren()
  if (providers.length === 0) {
    const empty = document.createElement("div")
    empty.className = "no-results"
    empty.textContent = "没有匹配的渠道来源"
    elements.providerList.append(empty)
    return
  }
  for (const provider of providers) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "provider-card"
    button.classList.toggle(
      "active",
      state.selectedProvider?.id === provider.id,
    )
    button.classList.toggle("disabled", !provider.importable)
    button.setAttribute("role", "option")
    button.setAttribute(
      "aria-selected",
      String(state.selectedProvider?.id === provider.id),
    )

    const icon = document.createElement("div")
    icon.className = "provider-icon"
    renderProviderIcon(icon, provider)
    const copy = document.createElement("div")
    const name = document.createElement("strong")
    name.textContent = provider.name
    const description = document.createElement("small")
    description.textContent = provider.category
    copy.append(name, description)
    const type = document.createElement("span")
    type.textContent = `#${provider.channelType}`
    button.append(icon, copy, type)
    button.addEventListener("click", () => selectProvider(provider))
    elements.providerList.append(button)
  }
}

function closePreviewDialog() {
  if (elements.previewDialog.open) elements.previewDialog.close()
  elements.previewPanel.classList.add("hidden")
  state.preview = null
  state.pendingSchedule = null
}

function selectProvider(provider) {
  state.selectedProvider = provider
  closePreviewDialog()
  hideStatus(elements.credentialStatus)
  elements.credentialEmpty.classList.add("hidden")
  elements.credentialForm.classList.remove("hidden")
  elements.selectedType.textContent = `TYPE ${provider.channelType}`
  renderProviderIcon(elements.providerMonogram, provider)
  elements.providerName.textContent = provider.name
  elements.providerDescription.textContent = provider.category
  elements.channelType.textContent = `TYPE ${provider.channelType}`
  elements.channelName.value = `${provider.name} · ${new Date().toLocaleDateString("zh-CN")}`
  state.channelNameEdited = false
  elements.sourceBaseUrl.value = provider.baseUrl || ""
  elements.sourceBaseUrl.required = provider.requiresBaseUrl
  elements.baseUrlHelp.textContent = provider.requiresBaseUrl
    ? "这个渠道必须填写完整的 Base URL。"
    : "可以按实际部署修改；留空时由 New API 使用默认值。"
  elements.apiKey.value = ""
  elements.quotaMode.value = "uniform"
  elements.uniformQuota.value = ""
  elements.keyQuotas.value = ""
  resetStaticCredentialVisibility()
  updateQuotaModeForm()
  elements.channelPriority.value = ""
  elements.channelWeight.value = ""
  elements.priorityDescending.checked = false
  elements.priorityStep.value = "1"
  updatePrioritySequenceForm()
  elements.awsGlobalField.classList.toggle("hidden", provider.id !== "aws")
  elements.awsGlobalInference.checked = false
  state.channelTemplates = []
  renderConfigSourceOptions()
  elements.apiKey.required =
    !provider.channelConfig.credentialModes?.length &&
    !provider.keyOptional &&
    provider.importable
  elements.apiKey.disabled = !provider.importable
  elements.keyLabel.textContent = provider.keyOptional
    ? "API Key（可留空，可批量）"
    : provider.channelConfig.credentialModes?.length
      ? "批量完整凭证（可选，一行一条）"
      : "API Key（可批量，一行一条）"
  elements.keyHelp.textContent = provider.channelConfig.credentialModes?.length
    ? "可整段粘贴多条完整凭证；默认明文显示，确认无误后可手动隐藏。"
    : "可整段粘贴几十条 Key；默认明文显示，确认无误后可手动隐藏。"
  elements.unsupportedNote.classList.toggle("hidden", provider.importable)
  elements.unsupportedNote.textContent = provider.importable
    ? ""
    : provider.description
  elements.previewButton.disabled = !provider.importable
  elements.providerDescription.textContent = provider.description
  renderProviderConfig(provider)
  updateConfigSourceUi()
  renderProviders()
  elements.channelName.focus()
  void loadChannelTemplates()
}

function renderConfigSourceOptions() {
  const selected = elements.configSource.value
  elements.configSource.replaceChildren()
  const placeholder = document.createElement("option")
  placeholder.value = ""
  placeholder.textContent = "请先选择配置来源"
  elements.configSource.append(placeholder)
  if (state.channelTemplates.length > 0) {
    const templates = document.createElement("optgroup")
    templates.label = "复制已有同类型渠道（推荐）"
    for (const channel of state.channelTemplates) {
      const option = document.createElement("option")
      option.value = `template:${channel.id}`
      option.textContent = `#${channel.id} ${channel.name} · ${channel.modelCount} 个模型 · ${channel.status}`
      templates.append(option)
    }
    elements.configSource.append(templates)
  }
  const modelSources = [
    ["new-api", "从 New API 获取该类型模型"],
    ["manual", "手动填写模型与配置"],
  ]
  if (state.selectedProvider?.channelConfig?.supportsModelFetch === true) {
    modelSources.unshift(["fetch", "使用新 Key 从供应商获取模型（经 New API）"])
  }
  for (const [value, label] of modelSources) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label
    elements.configSource.append(option)
  }
  if (
    [...elements.configSource.options].some((item) => item.value === selected)
  ) {
    elements.configSource.value = selected
  }
}

async function loadChannelTemplates() {
  if (!state.configured || !state.selectedProvider?.importable) return
  setLoading(elements.refreshChannelTemplates, true)
  try {
    const result = await api("/api/channel-templates", {
      method: "POST",
      body: JSON.stringify({ providerId: state.selectedProvider.id }),
    })
    state.channelTemplates = result.templates || []
    renderConfigSourceOptions()
    updateConfigSourceUi()
    elements.configSourceHelp.textContent = state.channelTemplates.length
      ? `已找到 ${state.channelTemplates.length} 个同类型渠道，请选择要复制的配置。`
      : "没有找到同类型渠道，也可以明确选择从 New API 获取模型。"
  } catch (error) {
    state.channelTemplates = []
    renderConfigSourceOptions()
    elements.configSourceHelp.textContent = error.message
  } finally {
    setLoading(elements.refreshChannelTemplates, false)
  }
}

function selectedTemplateId() {
  const match = elements.configSource.value.match(/^template:(\d+)$/)
  return match ? Number(match[1]) : null
}

function updateConfigSourceUi() {
  const templateId = selectedTemplateId()
  const manual = elements.configSource.value === "manual"
  const template = state.channelTemplates.find(
    (channel) => channel.id === templateId,
  )
  elements.sourceBaseUrl.disabled = Boolean(template)
  elements.baseUrlHelp.textContent = template
    ? `将复制“${template.name}”的 Base URL 和高级配置。`
    : state.selectedProvider?.requiresBaseUrl
      ? "这个渠道必须填写完整的 Base URL。"
      : "可以按实际部署修改；留空时由 New API 使用默认值。"
  elements.channelPriorityHelp.textContent = template
    ? `留空沿用“${template.name}”的优先级 ${template.priority}。`
    : "数值越大越优先使用；留空时新渠道使用 0。"
  elements.channelWeightHelp.textContent = template
    ? `留空沿用“${template.name}”的权重 ${template.weight}。`
    : "同优先级渠道按权重比例分流；留空时新渠道使用 0。"
  elements.providerModelsField.classList.toggle("hidden", !manual)
  elements.providerModelMappingsField.classList.toggle(
    "hidden",
    !manual || !state.selectedProvider?.channelConfig?.modelMappings,
  )
  elements.providerConfig
    .querySelectorAll("input, select, textarea")
    .forEach((input) => {
      input.disabled = !manual
    })
  if (template) {
    elements.providerConfig.classList.add("hidden")
    elements.keyHelp.textContent =
      "粘贴新 Key；云厂商组合凭证请保持完整格式，其他配置从所选渠道复制。"
  } else if (state.selectedProvider) {
    renderProviderConfigFields()
    const config = state.selectedProvider.channelConfig || {}
    elements.providerConfig.classList.toggle(
      "hidden",
      !manual ||
        (!config.credentialModes?.length &&
          !config.extra &&
          !config.flags?.length),
    )
  }
}

function createCredentialField(field, valueKind) {
  const label = document.createElement("label")
  label.className = `field${field.multiline ? " field-wide" : ""}`
  const title = document.createElement("span")
  title.textContent = field.label
  const input = field.multiline
    ? document.createElement("textarea")
    : document.createElement("input")
  if (field.multiline) input.rows = 5
  if (field.secret && !field.multiline) input.type = "text"
  input.placeholder = field.placeholder || ""
  input.value = field.defaultValue || ""
  input.autocomplete = "new-password"
  input.dataset[valueKind] = field.id
  const sensitive = field.secret || Boolean(field.fileAccept)
  if (sensitive) input.dataset.sensitive = "true"
  label.append(title)
  if (sensitive) {
    const wrapper = document.createElement("div")
    wrapper.className = `secret-input${field.multiline ? " textarea-secret" : ""}`
    const toggle = document.createElement("button")
    toggle.type = "button"
    toggle.textContent = "隐藏"
    toggle.addEventListener("click", () => {
      const visible = isSecretInputVisible(input)
      setSecretInputVisible(input, !visible)
      toggle.textContent = visible ? "显示" : "隐藏"
    })
    wrapper.append(input, toggle)
    label.append(wrapper)
  } else {
    label.append(input)
  }

  if (field.fileAccept) {
    const fileRow = document.createElement("div")
    fileRow.className = "credential-file-row"
    const file = document.createElement("input")
    file.type = "file"
    file.accept = field.fileAccept
    file.addEventListener("change", async () => {
      const selected = file.files?.[0]
      if (!selected) return
      try {
        const parsed = JSON.parse(await selected.text())
        input.value = JSON.stringify(parsed)
        toast(`已读取服务账号文件：${selected.name}`)
      } catch {
        file.value = ""
        toast("服务账号文件不是有效 JSON", true)
      }
    })
    const help = document.createElement("small")
    help.textContent = "文件只在本机读取，选择后不会上传到第三方。"
    fileRow.append(file, help)
    label.append(fileRow)
  }
  return label
}

function renderProviderConfigFields() {
  const config = state.selectedProvider?.channelConfig || {}
  elements.providerConfigFields.replaceChildren()
  const mode = config.credentialModes?.find(
    (item) => item.id === elements.credentialMode.value,
  )
  for (const field of mode?.parts || []) {
    elements.providerConfigFields.append(
      createCredentialField(field, "credentialPart"),
    )
  }
  if (config.extra) {
    const extra = createCredentialField(config.extra, "providerExtra")
    if (config.extra.help) {
      const help = document.createElement("small")
      help.textContent = config.extra.help
      extra.append(help)
    }
    elements.providerConfigFields.append(extra)
  }
  for (const flag of config.flags || []) {
    if (state.selectedProvider?.id === "aws" && flag.id === "globalInference") {
      continue
    }
    const label = document.createElement("label")
    label.className = "check-row field-wide"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.dataset.providerFlag = flag.id
    const copy = document.createElement("span")
    const title = document.createElement("strong")
    title.textContent = flag.label
    const help = document.createElement("small")
    help.textContent = flag.help || ""
    copy.append(title, help)
    label.append(input, copy)
    elements.providerConfigFields.append(label)
  }
  if (mode?.batchHelp) elements.keyHelp.textContent = mode.batchHelp
}

function renderProviderConfig(provider) {
  const config = provider.channelConfig || {}
  const modes = config.credentialModes || []
  elements.rawKeyField.classList.remove("hidden")
  elements.providerConfig.classList.toggle(
    "hidden",
    modes.length === 0 && !config.extra && !config.flags?.length,
  )
  elements.credentialModeField.classList.toggle("hidden", modes.length < 2)
  elements.credentialMode.replaceChildren()
  for (const mode of modes) {
    const option = document.createElement("option")
    option.value = mode.id
    option.textContent = mode.label
    elements.credentialMode.append(option)
  }
  renderProviderConfigFields()

  elements.providerModelsField.classList.remove("hidden")
  elements.providerModels.value = (config.defaultModels || []).join("\n")
  elements.providerModelsHelp.textContent =
    config.modelHelp ||
    (config.supportsModelFetch
      ? "可留空，默认直接使用当前 New API 内置的该渠道模型；需要覆盖时每行填写一个。"
      : "该渠道没有可自动读取的模型，请确认 New API 渠道中使用的模型名。")

  elements.providerModelMappingsField.classList.toggle(
    "hidden",
    !config.modelMappings,
  )
  elements.providerModelMappings.value = ""
  elements.providerModelMappingsLabel.textContent =
    config.modelMappings?.label || "模型专用配置"
  elements.providerModelMappings.placeholder =
    config.modelMappings?.placeholder || ""
  elements.providerModelMappingsHelp.textContent =
    config.modelMappings?.help || ""
}

elements.credentialMode.addEventListener("change", renderProviderConfigFields)
elements.configSource.addEventListener("change", updateConfigSourceUi)
elements.refreshChannelTemplates.addEventListener("click", loadChannelTemplates)

function renderPreview(preview) {
  state.preview = preview
  state.mappings = [
    ...(state.selectedProvider?.channelConfig?.autoMapProviderPrefix === true
      ? suggestedProviderPrefixMappings(preview.models)
      : []),
    ...(preview.providerMappings || []),
  ]
  state.createdChannelId = null
  elements.createChannel.disabled = false
  elements.createChannel.querySelector("span").textContent =
    state.pendingSchedule === null ? "确认写入 New API" : "确认保存定时任务"
  elements.discardPreview.textContent = "返回修改"
  elements.balanceCard.classList.add("hidden")
  elements.previewName.textContent = preview.name
  elements.previewProvider.textContent = `${preview.provider.name} / TYPE ${preview.provider.channelType}`
  elements.previewBaseUrl.textContent =
    preview.provider.baseUrl || "New API 默认"
  elements.previewGroups.textContent = preview.groups.join("、")
  elements.previewPriority.textContent = preview.prioritySequence?.enabled
    ? `${preview.priority} → ${preview.priority - preview.prioritySequence.step * Math.max(0, preview.keyCount - 1)}（每条 -${preview.prioritySequence.step}）`
    : String(preview.priority)
  elements.previewWeight.textContent = String(preview.weight)
  elements.previewAwsRoutingFact.classList.toggle("hidden", !preview.awsRouting)
  elements.previewAwsRouting.textContent = preview.awsRouting
    ? `${preview.awsRouting.regions.join("、")} · ${
        preview.awsRouting.globalInference ? "Global 全球路由" : "区域路由"
      }`
    : "—"
  elements.modelCount.textContent = String(preview.models.length)
  const deduplication = preview.deduplication || {
    inputCount: preview.keyCount || 1,
    inputDuplicateCount: 0,
    existingDuplicateCount: 0,
    queuedDuplicateCount: 0,
    acceptedCount: preview.keyCount || 1,
    skippedCount: 0,
  }
  elements.batchInputCount.textContent = String(deduplication.inputCount)
  elements.batchKeyCount.textContent = String(preview.keyCount || 1)
  elements.batchSkippedCount.textContent = String(deduplication.skippedCount)
  elements.batchQuotaTotal.textContent = Number.isFinite(preview.quotaTotal)
    ? formatUsd(preview.quotaTotal)
    : preview.knownQuotaTotal > 0
      ? `${formatUsd(preview.knownQuotaTotal)} + ${preview.unknownQuotaCount} 条 x`
      : `${preview.unknownQuotaCount} 条 x`
  const duplicateParts = [
    [deduplication.inputDuplicateCount, "本批重复"],
    [deduplication.existingDuplicateCount, "本站已录入"],
    [deduplication.queuedDuplicateCount, "已在定时队列"],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${label} ${count} 条`)
  elements.batchDedupCopy.textContent =
    duplicateParts.length > 0
      ? `已自动跳过：${duplicateParts.join("、")}。请核对数量和额度后手动确认。`
      : "未发现重复 Key。请核对数量和额度后手动确认。"
  elements.modelList.replaceChildren()
  const visibleModels = preview.models.slice(0, 36)
  for (const model of visibleModels) {
    const chip = document.createElement("span")
    chip.textContent = model
    elements.modelList.append(chip)
  }
  elements.modelOverflow.textContent =
    preview.models.length > visibleModels.length
      ? `另有 ${preview.models.length - visibleModels.length} 个模型`
      : "已显示全部"
  elements.actualModelOptions.replaceChildren()
  for (const model of preview.models) {
    const option = document.createElement("option")
    option.value = model
    elements.actualModelOptions.append(option)
  }
  elements.manualModels.value = ""
  renderMappings()
  const hasDuplicates =
    state.pendingSchedule === null &&
    preview.duplicates.length > 0 &&
    !preview.templateChannelId
  elements.duplicateBox.classList.toggle("hidden", !hasDuplicates)
  elements.confirmDuplicates.checked = false
  elements.duplicateTarget.replaceChildren()
  const createOption = document.createElement("option")
  createOption.value = ""
  createOption.textContent = "新建独立渠道（不修改现有渠道）"
  elements.duplicateTarget.append(createOption)
  if (hasDuplicates) {
    elements.duplicateCopy.textContent = preview.duplicates
      .map((item) => `${item.name}（${item.status}）`)
      .join("、")
    for (const channel of preview.duplicates) {
      const option = document.createElement("option")
      option.value = String(channel.id)
      option.textContent = `${channel.name} · ${
        channel.isMultiKey ? "追加 Key（多 Key）" : "替换 Key（单 Key）"
      } · ${channel.status}`
      option.disabled = preview.keyCount > 1 && !channel.isMultiKey
      elements.duplicateTarget.append(option)
    }
  }
  updateDuplicateAction()
  hideStatus(elements.createStatus)
  elements.previewPanel.classList.remove("hidden")
  if (!elements.previewDialog.open) elements.previewDialog.showModal()
}

function selectedDuplicateChannel() {
  const channelId = Number(elements.duplicateTarget.value)
  return state.preview?.duplicates.find(
    (channel) => Number(channel.id) === channelId,
  )
}

function updateDuplicateAction() {
  const channel = selectedDuplicateChannel()
  elements.confirmDuplicates.checked = false
  if (!channel) {
    elements.duplicateConfirmCopy.textContent = "我确认仍要新增一个渠道"
    elements.createChannel.querySelector("span").textContent =
      state.pendingSchedule === null ? "确认写入 New API" : "确认保存定时任务"
    return
  }
  elements.duplicateConfirmCopy.textContent = channel.isMultiKey
    ? `我确认把 Key 追加到“${channel.name}”并启用该渠道`
    : `我确认替换“${channel.name}”的原 Key 并启用该渠道`
  elements.createChannel.querySelector("span").textContent = channel.isMultiKey
    ? "追加到所选渠道"
    : "更新所选渠道"
}

const formatUsd = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)

const formatInteger = (value) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  )

const formatCompact = (value) =>
  new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

const formatDateTime = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : "暂无"
}

const formatDateTimeInput = (date) => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 19)
}

const formatUsageTime = (timestamp) => {
  if (timestamp == null || timestamp === "") return "尚未使用"
  return Number.isFinite(Number(timestamp))
    ? formatDateTime(Number(timestamp) * 1000)
    : "尚未使用"
}

const isRecoverySchedule = (schedule) =>
  schedule?.kind === "recovery" ||
  /限流|自动续传/.test(String(schedule?.lastError || "")) ||
  (schedule?.entries || []).some(
    (entry) => entry.status === "pending" && /限流/.test(entry.error || ""),
  )

const isPacedSchedule = (schedule) => schedule?.kind === "paced"

const scheduleStatusCopy = (status, schedule = null) => {
  if (isRecoverySchedule(schedule)) {
    if (status === "active") return "自动续传等待中"
    if (status === "running") return "正在继续写入"
    if (status === "paused") return "续传已暂停"
  }
  if (isPacedSchedule(schedule)) {
    if (status === "active") return "安全队列等待中"
    if (status === "running") return "正在安全写入"
    if (status === "paused") return "安全队列已暂停"
  }
  return (
    {
      active: "等待执行",
      running: "正在写入",
      paused: "已暂停",
      attention: "需要核对",
      completed: "已完成",
      cancelled: "已取消",
    }[status] || status
  )
}

const usageCopy = (record) => {
  const spent = gatewaySpent(record)
  if (spent != null) return formatUsd(spent)
  if (record.sharedChannel && !Number.isInteger(record.keyIndex)) {
    return "旧多 Key 记录无法拆分"
  }
  return record.channelId ? "等待刷新日志" : "未定位渠道"
}

const currentRecordFilters = () => ({
  target: elements.recordsTargetFilter.value,
  provider: elements.recordsProviderFilter.value,
  status: elements.recordsStatusFilter.value,
  query: elements.recordsSearch.value,
})

function replaceFilterOptions(select, emptyLabel, values) {
  const selected = select.value
  select.replaceChildren()
  const empty = document.createElement("option")
  empty.value = ""
  empty.textContent = emptyLabel
  select.append(empty)
  for (const value of values) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = value
    select.append(option)
  }
  select.value = values.includes(selected) ? selected : ""
}

function renderRecordFilterOptions() {
  replaceFilterOptions(
    elements.recordsTargetFilter,
    "全部站点",
    [
      ...new Set(
        state.records.map((record) => record.targetName).filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, "zh-CN")),
  )
  replaceFilterOptions(
    elements.recordsProviderFilter,
    "全部供应商",
    [
      ...new Set(
        state.records.map((record) => record.providerName).filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, "zh-CN")),
  )
}

const formatPercent = (value) =>
  Number.isFinite(value)
    ? `${new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 1,
      }).format(Math.max(0, value))}%`
    : "—"

function markUsageMonitorRange(range = "") {
  for (const button of document.querySelectorAll("[data-usage-range]")) {
    button.classList.toggle("active", button.dataset.usageRange === range)
  }
}

function setUsageMonitorRange(range) {
  markUsageMonitorRange(range)
  if (range === "all") {
    elements.usageMonitorStart.value = ""
    elements.usageMonitorEnd.value = ""
    return
  }
  const end = new Date()
  const start = new Date(end)
  const days = range === "today" ? 1 : Number(range)
  start.setDate(start.getDate() - Math.max(0, days - 1))
  elements.usageMonitorStart.value = localDateKey(start)
  elements.usageMonitorEnd.value = localDateKey(end)
}

function currentUsageMonitorFilters() {
  return {
    targetUrl: elements.usageMonitorTarget.value,
    startDate: elements.usageMonitorStart.value,
    endDate: elements.usageMonitorEnd.value,
  }
}

function currentUsageMonitorRecords() {
  return filterUsageDashboardRecords(
    state.records,
    currentUsageMonitorFilters(),
  )
}

function renderUsageMonitorTargetOptions() {
  const selected = elements.usageMonitorTarget.value
  const targets = new Map()
  for (const record of state.records) {
    if (!record.targetUrl || targets.has(record.targetUrl)) continue
    targets.set(record.targetUrl, record.targetName || "New API")
  }
  elements.usageMonitorTarget.replaceChildren()
  const all = document.createElement("option")
  all.value = ""
  all.textContent = "全部 New API 地址"
  elements.usageMonitorTarget.append(all)
  for (const [targetUrl, targetName] of [...targets.entries()].sort(
    (left, right) => left[1].localeCompare(right[1], "zh-CN"),
  )) {
    const option = document.createElement("option")
    option.value = targetUrl
    option.textContent = `${targetName} · ${targetUrl}`
    elements.usageMonitorTarget.append(option)
  }
  elements.usageMonitorTarget.value = targets.has(selected) ? selected : ""
}

function appendSiteUsageCard(group) {
  const { summary } = group
  const card = document.createElement("article")
  card.className = "site-usage-item"
  const header = document.createElement("header")
  const identity = document.createElement("div")
  const name = document.createElement("strong")
  name.textContent = group.targetName
  const url = document.createElement("small")
  url.textContent = group.targetUrl
  identity.append(name, url)
  const percent = document.createElement("b")
  percent.textContent = formatPercent(summary.remainingPercent)
  header.append(identity, percent)

  const progress = document.createElement("progress")
  progress.max = 100
  progress.value = Number.isFinite(summary.remainingPercent)
    ? Math.min(100, Math.max(0, summary.remainingPercent))
    : 0
  progress.className = Number.isFinite(summary.remainingPercent)
    ? ""
    : "unknown"
  progress.setAttribute(
    "aria-label",
    Number.isFinite(summary.remainingPercent)
      ? `${group.targetName} 剩余 ${formatPercent(summary.remainingPercent)}`
      : `${group.targetName} 暂无可计算剩余比例`,
  )

  const metrics = document.createElement("div")
  metrics.className = "site-usage-metrics"
  for (const [label, value] of [
    ["录入额度", formatUsd(summary.quotaTotal)],
    ["已使用", formatUsd(summary.gatewaySpentTotal)],
    ["已统计剩余", formatUsd(summary.trackedRemainingTotal)],
    ["Key", `${summary.recordCount} 条`],
  ]) {
    const metric = document.createElement("span")
    const metricLabel = document.createElement("small")
    metricLabel.textContent = label
    const metricValue = document.createElement("strong")
    metricValue.textContent = value
    metric.append(metricLabel, metricValue)
    metrics.append(metric)
  }
  const coverage = document.createElement("p")
  coverage.textContent = `用量已刷新 ${summary.trackedCount} / ${summary.recordCount} 条 · ${formatPercent(summary.coveragePercent)}`
  card.append(header, progress, metrics, coverage)
  elements.siteUsageList.append(card)
}

function appendDailyUsageRow(day, maxAmount) {
  const row = document.createElement("article")
  row.className = "daily-usage-row"
  const date = document.createElement("strong")
  date.textContent = new Date(`${day.date}T00:00:00`).toLocaleDateString(
    "zh-CN",
    { month: "numeric", day: "numeric", weekday: "short" },
  )
  const bars = document.createElement("div")
  bars.className = "daily-usage-bars"
  for (const [className, label, amount] of [
    ["quota", "录入", day.summary.quotaTotal],
    ["spent", "累计", day.summary.gatewaySpentTotal],
  ]) {
    const bar = document.createElement("div")
    bar.className = className
    const copy = document.createElement("span")
    copy.textContent = label
    const progress = document.createElement("progress")
    progress.max = maxAmount
    progress.value = Math.max(0, amount)
    const value = document.createElement("b")
    value.textContent = formatUsd(amount)
    bar.append(copy, progress, value)
    bars.append(bar)
  }
  const detail = document.createElement("small")
  detail.textContent = `${day.summary.recordCount} 条 Key · 剩余 ${formatPercent(day.summary.remainingPercent)}`
  row.append(date, bars, detail)
  elements.dailyUsageChart.append(row)
}

function renderUsageMonitor() {
  const filters = currentUsageMonitorFilters()
  const records = currentUsageMonitorRecords()
  const summary = summarizeUsageDashboard(records)
  const hasRecords = records.length > 0
  const rangeCopy =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "最早记录"} 至 ${filters.endDate || "今天"}`
      : "全部录入时间"
  const targetCopy = filters.targetUrl || "全部 New API 地址"
  elements.usageMonitorRange.textContent = `${targetCopy} · ${rangeCopy} · 共 ${summary.recordCount} 条 Key`
  elements.monitorKeyCount.textContent = formatInteger(summary.recordCount)
  elements.monitorKeyDetail.textContent = `${summary.knownQuotaCount} 个已填写额度 · ${summary.unknownQuotaCount} 个额度 x`
  elements.monitorQuotaTotal.textContent = formatUsd(summary.quotaTotal)
  elements.monitorQuotaDetail.textContent = `${summary.knownQuotaCount} 个已知额度`
  elements.monitorSpentTotal.textContent = formatUsd(summary.gatewaySpentTotal)
  elements.monitorSpentDetail.textContent = `${formatInteger(summary.requestCount)} 次请求 · ${summary.usedKeyCount} 个 Key 已使用`
  elements.monitorRemainingTotal.textContent = formatUsd(
    summary.trackedRemainingTotal,
  )
  elements.monitorRemainingPercent.textContent = formatPercent(
    summary.remainingPercent,
  )
  const ringValue = Number.isFinite(summary.remainingPercent)
    ? Math.min(100, Math.max(0, summary.remainingPercent))
    : 0
  elements.monitorRemainingRingValue.setAttribute(
    "stroke-dasharray",
    `${ringValue} 100`,
  )
  elements.monitorRemainingRing.classList.toggle(
    "unknown",
    !Number.isFinite(summary.remainingPercent),
  )
  elements.monitorRemainingDetail.textContent = Number.isFinite(
    summary.remainingPercent,
  )
    ? `按 ${formatUsd(summary.trackedQuotaTotal)} 已刷新额度计算`
    : "刷新用量后显示剩余比例"
  elements.monitorCoveragePercent.textContent = formatPercent(
    summary.coveragePercent,
  )
  elements.monitorCoverageDetail.textContent = `${summary.trackedCount} / ${summary.recordCount} 个已刷新`

  elements.siteUsageList.replaceChildren()
  for (const group of groupUsageDashboardByTarget(records)) {
    appendSiteUsageCard(group)
  }
  elements.dailyUsageChart.replaceChildren()
  const days = groupUsageDashboardByDay(records)
  const maxAmount = Math.max(
    1,
    ...days.flatMap((day) => [
      day.summary.quotaTotal,
      day.summary.gatewaySpentTotal,
    ]),
  )
  for (const day of days) appendDailyUsageRow(day, maxAmount)
  elements.usageMonitorEmpty.classList.toggle("hidden", hasRecords)
  elements.usageMonitorGrid.classList.toggle("hidden", !hasRecords)
}

function renderUsageSummary(records) {
  const summary = summarizeUsageRecords(records)
  const totalRecords = state.records.length
  elements.usageKeyCount.textContent =
    records.length === totalRecords
      ? formatInteger(records.length)
      : `${formatInteger(records.length)} / ${formatInteger(totalRecords)}`
  elements.usageKeyDetail.textContent = `${summary.usedKeyCount} 个已使用 · ${summary.unusedKeyCount} 个未使用`
  elements.usageQuotaTotal.textContent = formatUsd(summary.quotaTotal)
  elements.usageQuotaDetail.textContent = `${summary.knownQuotaCount} 个已填额度 · ${summary.unknownQuotaCount} 个未知`
  elements.usageSpentTotal.textContent = formatUsd(summary.gatewaySpentTotal)
  elements.usageCoverageDetail.textContent = `${summary.trackedCount} / ${summary.recordCount} 个已刷新统计`
  elements.usageRemainingTotal.textContent = formatUsd(
    summary.trackedRemainingTotal,
  )
  elements.usageRequestCount.textContent = formatInteger(summary.requestCount)
  elements.usageLastChecked.textContent = summary.lastCheckedAt
    ? `最近刷新 ${formatDateTime(summary.lastCheckedAt)}`
    : "尚未刷新"
  const totalTokens = summary.promptTokens + summary.completionTokens
  elements.usageTokenTotal.textContent =
    summary.detailIncompleteCount > 0 ? "—" : formatCompact(totalTokens)
  elements.usageTokenDetail.textContent =
    summary.detailIncompleteCount > 0
      ? `${summary.detailIncompleteCount} 条 Token 明细未完整`
      : `输入 ${formatCompact(summary.promptTokens)} · 输出 ${formatCompact(
          summary.completionTokens,
        )}`
  const notes = []
  if (summary.pendingCount > 0) {
    notes.push(`${summary.pendingCount} 条等待刷新，不计入已消耗金额`)
  }
  if (summary.incompleteCount > 0) {
    notes.push(`${summary.incompleteCount} 条日志量过大，当前统计未完整`)
  }
  if (summary.detailIncompleteCount > 0) {
    notes.push(
      `${summary.detailIncompleteCount} 条金额已校准，但 Token 明细未完整`,
    )
  }
  notes.push("New API 消耗仅统计录入时间之后的消费日志")
  elements.usageSummaryNote.textContent = notes.join("；")
}

function usageStateCopy(record) {
  const status = usageState(record)
  if (status === "used") return { copy: "已有消耗", className: "" }
  if (status === "unused") {
    return { copy: "已刷新 · 未使用", className: "idle" }
  }
  if (status === "incomplete") {
    return { copy: "统计未完整", className: "warning" }
  }
  return { copy: "等待刷新", className: "warning" }
}

const importOperationCopy = (operation) =>
  ({
    created: "新建独立渠道",
    "created-multi-key": "新建多 Key 渠道",
    appended: "追加到已有渠道",
    replaced: "替换已有渠道 Key",
  })[operation] || "写入 New API"

function appendRecordBatchMetric(container, label, value, detail = "") {
  const metric = document.createElement("div")
  const metricLabel = document.createElement("small")
  metricLabel.textContent = label
  const metricValue = document.createElement("strong")
  metricValue.textContent = value
  metric.append(metricLabel, metricValue)
  if (detail) {
    const metricDetail = document.createElement("span")
    metricDetail.textContent = detail
    metric.append(metricDetail)
  }
  container.append(metric)
}

function buildRecordDetailRow(record, fallbackIndex) {
  const row = document.createElement("tr")
  const sequence = document.createElement("td")
  sequence.className = "record-sequence-cell"
  sequence.textContent = `#${formatInteger(
    Number.isInteger(record.batchItemIndex)
      ? record.batchItemIndex
      : fallbackIndex + 1,
  )}`
  const keyCell = document.createElement("td")
  const source = document.createElement("strong")
  source.textContent = record.providerName
  const key = document.createElement("small")
  key.textContent = `${record.keyHint} · ${record.keyFingerprint}`
  keyCell.append(source, key)

  const channel = document.createElement("td")
  channel.className = "channel-cell"
  const channelName = document.createElement("strong")
  channelName.textContent = record.channelName || "未定位渠道"
  const channelId = document.createElement("small")
  channelId.textContent = record.channelId
    ? `渠道 ID ${formatInteger(record.channelId)}`
    : "尚未绑定渠道 ID"
  channel.append(channelName, channelId)

  const quotaUsage = document.createElement("td")
  const statusInfo = usageStateCopy(record)
  const status = document.createElement("span")
  status.className = `usage-status ${statusInfo.className}`.trim()
  status.textContent = statusInfo.copy
  const quota = document.createElement("strong")
  quota.textContent = Number.isFinite(record.quota)
    ? `额度 ${formatUsd(record.quota)}`
    : "额度 x"
  const cost = document.createElement("small")
  cost.className = "record-detail-cost"
  cost.textContent = `已用 ${usageCopy(record)}`
  quotaUsage.append(status, quota, cost)
  const trackedSpent = gatewaySpent(record)
  if (Number.isFinite(record.quota) && trackedSpent != null) {
    const remaining = document.createElement("small")
    remaining.textContent = `剩余 ${formatUsd(
      Math.max(0, record.quota - trackedSpent),
    )}`
    quotaUsage.append(remaining)
    const progress = document.createElement("div")
    progress.className = `quota-progress ${
      trackedSpent > record.quota ? "over" : ""
    }`.trim()
    const progressValue = document.createElement("span")
    progressValue.style.width = `${Math.min(
      100,
      record.quota > 0 ? (trackedSpent / record.quota) * 100 : 0,
    )}%`
    progress.append(progressValue)
    quotaUsage.append(progress)
  }

  const traffic = document.createElement("td")
  const requests = document.createElement("strong")
  requests.textContent = `${formatInteger(record.requestCount || 0)} 次请求`
  const tokens = document.createElement("small")
  tokens.textContent =
    record.usageDetailsComplete === false
      ? "Token 明细未完整"
      : `Token ${formatCompact(
          (record.promptTokens || 0) + (record.completionTokens || 0),
        )}`
  const activity = document.createElement("small")
  activity.textContent = `最近使用：${formatUsageTime(record.lastUsedAt)}`
  const checked = document.createElement("small")
  checked.textContent = record.checkedAt
    ? `刷新：${formatDateTime(record.checkedAt)}`
    : "尚未刷新用量"
  traffic.append(requests, tokens, activity, checked)

  const action = document.createElement("td")
  const refresh = document.createElement("button")
  refresh.type = "button"
  refresh.className = "table-action"
  refresh.textContent = "刷新消耗"
  refresh.disabled =
    !record.channelId ||
    (record.sharedChannel && !Number.isInteger(record.keyIndex))
  refresh.addEventListener("click", () => refreshImportRecord(record, refresh))
  action.append(refresh)
  row.append(sequence, keyCell, channel, quotaUsage, traffic, action)
  return row
}

function appendRecordBatch(batch, index) {
  const card = document.createElement("article")
  card.className = "record-batch-card"
  const header = document.createElement("header")
  const identity = document.createElement("div")
  identity.className = "record-batch-identity"
  const time = document.createElement("strong")
  time.textContent = `本次添加 · ${formatDateTime(batch.startedAt)}`
  const destination = document.createElement("small")
  destination.textContent = `${batch.targetName} · ${batch.providerName} · ${importOperationCopy(batch.operation)}`
  const targetUrl = document.createElement("span")
  targetUrl.textContent = batch.targetUrl
  identity.append(time, destination, targetUrl)
  const count = document.createElement("b")
  count.className = "record-batch-count"
  count.textContent = `成功写入 ${formatInteger(batch.records.length)} 条 Key`
  header.append(identity, count)

  const metrics = document.createElement("div")
  metrics.className = "record-batch-metrics"
  appendRecordBatchMetric(
    metrics,
    "本批 Key",
    formatInteger(batch.summary.recordCount),
    batch.legacy ? "历史记录按相近写入时间归组" : "同一次批量任务",
  )
  appendRecordBatchMetric(
    metrics,
    "本批录入额度",
    formatUsd(batch.summary.quotaTotal),
    batch.summary.unknownQuotaCount > 0
      ? `${formatInteger(batch.summary.unknownQuotaCount)} 条额度 x`
      : "额度均已填写",
  )
  appendRecordBatchMetric(
    metrics,
    "累计已用",
    formatUsd(batch.summary.gatewaySpentTotal),
    `${formatInteger(batch.summary.trackedCount)} 条已刷新`,
  )
  appendRecordBatchMetric(
    metrics,
    "请求次数",
    formatInteger(batch.summary.requestCount),
    `${formatInteger(batch.summary.usedKeyCount)} 条 Key 已使用`,
  )

  const details = document.createElement("details")
  details.className = "record-batch-details"
  details.open = index === 0
  const summary = document.createElement("summary")
  summary.textContent = `展开逐条核对本次添加的 ${formatInteger(batch.records.length)} 条 Key`
  const tableWrap = document.createElement("div")
  tableWrap.className = "record-detail-table-wrap"
  const table = document.createElement("table")
  table.className = "records-table record-detail-table"
  const head = document.createElement("thead")
  const headRow = document.createElement("tr")
  for (const label of [
    "序号",
    "来源 / Key",
    "渠道",
    "额度 / 已用",
    "请求 / 最近使用",
    "操作",
  ]) {
    const cell = document.createElement("th")
    cell.textContent = label
    headRow.append(cell)
  }
  head.append(headRow)
  const body = document.createElement("tbody")
  for (const [recordIndex, record] of batch.records.entries()) {
    body.append(buildRecordDetailRow(record, recordIndex))
  }
  table.append(head, body)
  tableWrap.append(table)
  details.append(summary, tableWrap)
  card.append(header, metrics, details)
  elements.recordsBody.append(card)
}

function renderRecords() {
  elements.recordsBody.replaceChildren()
  const records = filterUsageRecords(state.records, currentRecordFilters())
  renderUsageSummary(records)
  const hasRecords = records.length > 0
  elements.recordsEmpty.textContent =
    state.records.length > 0
      ? "没有符合当前筛选的记录。"
      : "还没有 Key 填入记录。"
  elements.recordsEmpty.classList.toggle("hidden", hasRecords)
  elements.recordsTableWrap.classList.toggle("hidden", !hasRecords)
  groupImportRecords(records).forEach(appendRecordBatch)
}

async function loadRecords() {
  const result = await api("/api/imports")
  state.records = result.records
  renderRecordFilterOptions()
  renderUsageMonitorTargetOptions()
  renderUsageMonitor()
  renderRecords()
}

function renderSchedules() {
  elements.scheduleList.replaceChildren()
  const hasSchedules = state.schedules.length > 0
  elements.scheduleEmpty.classList.toggle("hidden", hasSchedules)
  for (const schedule of state.schedules) {
    const recovering =
      isRecoverySchedule(schedule) && schedule.counts.pending > 0
    const paced = isPacedSchedule(schedule) && schedule.counts.pending > 0
    const card = document.createElement("article")
    card.className = `schedule-card${recovering ? " recovering" : ""}`
    card.dataset.scheduleId = schedule.id
    const header = document.createElement("header")
    const titleWrap = document.createElement("div")
    const title = document.createElement("h3")
    title.textContent = schedule.name
    const target = document.createElement("p")
    target.textContent = `${schedule.targetName || "New API"} · ${
      schedule.providerName
    } · ${schedule.targetUrl || ""}`
    titleWrap.append(title, target)
    const status = document.createElement("span")
    status.className = `schedule-status ${schedule.status}${
      recovering ? " recovering" : ""
    }`.trim()
    status.textContent = scheduleStatusCopy(schedule.status, schedule)
    header.append(titleWrap, status)

    const metrics = document.createElement("div")
    metrics.className = "schedule-metrics"
    const metricItems = [
      ["总 Key", `${schedule.counts.total}`],
      ["待写入", `${schedule.counts.pending}`],
      ["已写入", `${schedule.counts.imported}`],
      ["失败", `${schedule.counts.failed}`],
      ...(schedule.counts.uncertain > 0
        ? [["待核对", `${schedule.counts.uncertain}`]]
        : []),
      [
        "下一次",
        schedule.status === "active"
          ? formatDateTime(schedule.nextRunAt)
          : scheduleStatusCopy(schedule.status, schedule),
      ],
    ]
    for (const [label, value] of metricItems) {
      const item = document.createElement("div")
      const small = document.createElement("small")
      small.textContent = label
      const strong = document.createElement("strong")
      strong.textContent = value
      item.append(small, strong)
      metrics.append(item)
    }

    const details = document.createElement("p")
    const priorityCopy = schedule.prioritySequence?.enabled
      ? `${schedule.priority} 起、每条 -${schedule.prioritySequence.step}`
      : String(schedule.priority)
    details.textContent = `每次 ${schedule.batchSize} 条；间隔 ${
      schedule.intervalMinutes
    } 分钟；优先级 ${priorityCopy}；权重 ${schedule.weight}；最近执行 ${formatDateTime(schedule.lastRunAt)}。`
    if (recovering || paced) {
      const recovery = document.createElement("p")
      recovery.className = "schedule-recovery-note"
      recovery.textContent = recovering
        ? `${schedule.counts.pending} 条 Key 已加密保留；成功项不会重复写入。下次自动继续：${formatDateTime(schedule.nextRunAt)}。`
        : `${schedule.counts.pending} 条 Key 已加密进入安全队列；为避免触发 New API 限流，每分钟自动写入 1 条。下一条：${formatDateTime(schedule.nextRunAt)}。`
      card.append(header, metrics, details, recovery)
    } else {
      card.append(header, metrics, details)
    }
    if (schedule.lastError) {
      const error = document.createElement("p")
      error.className = recovering ? "schedule-recovery-note" : "schedule-error"
      error.textContent = schedule.lastError
      card.append(error)
    }

    const actions = document.createElement("div")
    actions.className = "schedule-actions"
    const retryFailed = document.createElement("button")
    retryFailed.type = "button"
    retryFailed.className = "table-action retry-failed"
    retryFailed.textContent = `恢复失败 Key（${schedule.counts.failed}）`
    retryFailed.disabled =
      schedule.counts.failed === 0 ||
      ["running", "cancelled"].includes(schedule.status)
    retryFailed.addEventListener("click", () =>
      updateSchedule(schedule.id, "retry-failed", retryFailed),
    )
    const edit = document.createElement("button")
    edit.type = "button"
    edit.className = "table-action"
    edit.textContent = "修改任务"
    edit.disabled =
      schedule.counts.pending === 0 ||
      !["active", "paused"].includes(schedule.status)

    const editor = document.createElement("form")
    editor.className = "schedule-editor hidden"
    editor.setAttribute("aria-label", `修改 ${schedule.name}`)
    const nextRunField = document.createElement("label")
    nextRunField.className = "field"
    const nextRunLabel = document.createElement("span")
    nextRunLabel.textContent = "下一次执行时间（精确到秒）"
    const nextRunInput = document.createElement("input")
    nextRunInput.type = "datetime-local"
    nextRunInput.step = "1"
    nextRunInput.required = true
    const nextRunDate = new Date(schedule.nextRunAt)
    nextRunInput.value = Number.isFinite(nextRunDate.getTime())
      ? formatDateTimeInput(nextRunDate)
      : formatDateTimeInput(new Date(Date.now() + 60_000))
    nextRunField.append(nextRunLabel, nextRunInput)

    const batchField = document.createElement("label")
    batchField.className = "field"
    const batchLabel = document.createElement("span")
    batchLabel.textContent = "每次上几条"
    const batchInput = document.createElement("input")
    batchInput.type = "number"
    batchInput.min = "1"
    batchInput.max = "200"
    batchInput.required = true
    batchInput.value = String(schedule.batchSize)
    batchField.append(batchLabel, batchInput)

    const intervalField = document.createElement("label")
    intervalField.className = "field"
    const intervalLabel = document.createElement("span")
    intervalLabel.textContent = "间隔分钟"
    const intervalInput = document.createElement("input")
    intervalInput.type = "number"
    intervalInput.min = "0"
    intervalInput.max = "43200"
    intervalInput.required = true
    intervalInput.value = String(schedule.intervalMinutes)
    const intervalHelp = document.createElement("small")
    intervalHelp.textContent = "填 0 表示执行下一批后暂停。"
    intervalField.append(intervalLabel, intervalInput, intervalHelp)

    const editorActions = document.createElement("div")
    editorActions.className = "schedule-editor-actions"
    const save = document.createElement("button")
    save.type = "submit"
    save.className = "table-action schedule-save"
    save.textContent = "保存修改"
    const discard = document.createElement("button")
    discard.type = "button"
    discard.className = "table-action"
    discard.textContent = "放弃"
    editorActions.append(save, discard)
    editor.append(nextRunField, batchField, intervalField, editorActions)

    edit.addEventListener("click", () => {
      editor.classList.toggle("hidden")
      edit.textContent = editor.classList.contains("hidden")
        ? "修改任务"
        : "收起修改"
      if (!editor.classList.contains("hidden")) nextRunInput.focus()
    })
    discard.addEventListener("click", () => {
      editor.classList.add("hidden")
      edit.textContent = "修改任务"
    })
    editor.addEventListener("submit", (event) => {
      event.preventDefault()
      saveScheduleSettings(
        schedule.id,
        {
          startAt: nextRunInput.value,
          batchSize: batchInput.value,
          intervalMinutes: intervalInput.value,
        },
        save,
      )
    })

    const runNow = document.createElement("button")
    runNow.type = "button"
    runNow.className = "table-action"
    runNow.textContent = recovering
      ? "立即继续写入"
      : paced
        ? "立即上一条"
        : "立即上一批"
    runNow.disabled =
      schedule.counts.pending === 0 ||
      ["running", "cancelled"].includes(schedule.status)
    runNow.addEventListener("click", () =>
      updateSchedule(schedule.id, "run", runNow),
    )
    const toggle = document.createElement("button")
    toggle.type = "button"
    toggle.className = "table-action"
    toggle.textContent = schedule.status === "paused" ? "恢复" : "暂停"
    toggle.disabled = !["active", "paused"].includes(schedule.status)
    toggle.addEventListener("click", () =>
      updateSchedule(
        schedule.id,
        schedule.status === "paused" ? "resume" : "pause",
        toggle,
      ),
    )
    const cancel = document.createElement("button")
    cancel.type = "button"
    cancel.className = "table-action"
    cancel.textContent = "取消"
    cancel.disabled = ["completed", "cancelled"].includes(schedule.status)
    cancel.addEventListener("click", () =>
      updateSchedule(schedule.id, "cancel", cancel),
    )
    actions.append(retryFailed, edit, runNow, toggle, cancel)
    card.append(editor, actions)
    elements.scheduleList.append(card)
  }
}

async function loadSchedules() {
  const result = await api("/api/schedules")
  state.schedules = result.schedules || []
  renderSchedules()
}

async function updateSchedule(scheduleId, action, button) {
  setLoading(button, true)
  try {
    const result = await api(`/api/schedules/${scheduleId}/${action}`, {
      method: "POST",
      body: "{}",
    })
    state.schedules = state.schedules.map((schedule) =>
      schedule.id === result.schedule.id ? result.schedule : schedule,
    )
    renderSchedules()
    if (action === "run") await loadRecords()
    toast(
      action === "run"
        ? "已继续执行一批 Key"
        : action === "retry-failed"
          ? "失败 Key 已重新加入待写入队列"
          : "定时任务已更新",
    )
  } catch (error) {
    toast(error.message, true)
  } finally {
    setLoading(button, false)
  }
}

async function saveScheduleSettings(scheduleId, schedule, button) {
  setLoading(button, true)
  try {
    const result = await api(`/api/schedules/${scheduleId}/settings`, {
      method: "POST",
      body: JSON.stringify({ schedule }),
    })
    state.schedules = state.schedules.map((item) =>
      item.id === result.schedule.id ? result.schedule : item,
    )
    renderSchedules()
    toast("定时任务时间和批量设置已更新")
  } catch (error) {
    toast(error.message, true)
  } finally {
    setLoading(button, false)
  }
}

async function refreshImportRecord(record, button) {
  setLoading(button, true)
  try {
    const result = await api("/api/imports/refresh", {
      method: "POST",
      body: JSON.stringify({ recordId: record.id }),
    })
    state.records = state.records.map((item) =>
      item.id === result.record.id ? result.record : item,
    )
    renderUsageMonitor()
    renderRecords()
    toast("Key 消耗记录已刷新")
  } catch (error) {
    toast(error.message, true)
  } finally {
    setLoading(button, false)
  }
}

function renderBalance(balance, channelId) {
  state.createdChannelId = channelId || null
  elements.balanceCard.classList.remove("hidden")
  elements.refreshBalance.disabled = !state.createdChannelId

  if (balance?.status !== "available") {
    elements.balanceMetrics.classList.add("hidden")
    elements.balanceMessage.textContent =
      balance?.reason || "该渠道暂时无法查询余额。"
    return
  }

  elements.balanceMetrics.classList.remove("hidden")
  elements.remainingBalance.textContent = formatUsd(balance.currentBalance)
  elements.initialBalance.textContent = formatUsd(balance.initialBalance)
  elements.spentBalance.textContent =
    balance.spentSinceImport == null
      ? "暂不可算"
      : formatUsd(balance.spentSinceImport)

  if (balance.balanceIncreased) {
    elements.balanceMessage.textContent =
      "当前额度高于首次查询值，可能发生过充值或赠送，因此暂不计算累计消耗。"
    return
  }
  const checkedAt = balance.checkedAt
    ? new Date(balance.checkedAt).toLocaleString("zh-CN")
    : "刚刚"
  elements.balanceMessage.textContent = `余额由 New API 向上游查询；“已消耗”从本工具首次查询开始计算。更新时间：${checkedAt}`
}

const parseManualModels = () => [
  ...new Set(
    elements.manualModels.value
      .split(/[\n,]/)
      .map((model) => model.trim())
      .filter(Boolean),
  ),
]

function updateModelPlanSummary() {
  if (!state.preview) return
  const aliases = new Set()
  const mappedTargets = new Set()
  for (const entry of state.mappings) {
    const standardModel = entry.standardModel.trim()
    const actualModel = entry.actualModel.trim()
    if (standardModel && actualModel && standardModel !== actualModel) {
      aliases.add(standardModel)
      mappedTargets.add(actualModel)
    }
  }
  const hideMappedTargets =
    state.selectedProvider?.channelConfig?.autoMapProviderPrefix === true
  const finalModels = new Set([
    ...[...state.preview.models, ...parseManualModels()].filter(
      (model) => !hideMappedTargets || !mappedTargets.has(model),
    ),
    ...aliases,
  ])
  elements.finalModelCount.textContent = String(finalModels.size)
  elements.mappingCount.textContent = String(aliases.size)
}

function renderMappings() {
  elements.mappingList.replaceChildren()
  if (state.mappings.length === 0) {
    const empty = document.createElement("div")
    empty.className = "mapping-empty"
    empty.textContent = "当前保持上游原名；可以生成建议或手动添加。"
    elements.mappingList.append(empty)
    updateModelPlanSummary()
    return
  }

  state.mappings.forEach((mapping, index) => {
    const row = document.createElement("div")
    row.className = "mapping-row"
    const standardInput = document.createElement("input")
    standardInput.placeholder = "对外标准名"
    standardInput.value = mapping.standardModel
    standardInput.setAttribute("aria-label", "对外标准模型名")
    const arrow = document.createElement("span")
    arrow.textContent = "→"
    const actualInput = document.createElement("input")
    actualInput.placeholder = "上游实际模型"
    actualInput.value = mapping.actualModel
    actualInput.setAttribute("list", "actual-model-options")
    actualInput.setAttribute("aria-label", "上游实际模型名")
    const remove = document.createElement("button")
    remove.type = "button"
    remove.textContent = "×"
    remove.setAttribute("aria-label", "删除这条映射")
    standardInput.addEventListener("input", () => {
      state.mappings[index].standardModel = standardInput.value
      updateModelPlanSummary()
    })
    actualInput.addEventListener("input", () => {
      state.mappings[index].actualModel = actualInput.value
      updateModelPlanSummary()
    })
    remove.addEventListener("click", () => {
      state.mappings.splice(index, 1)
      renderMappings()
    })
    row.append(standardInput, arrow, actualInput, remove)
    elements.mappingList.append(row)
  })
  updateModelPlanSummary()
}

function suggestedStandardName(actualModel) {
  let result = actualModel.trim()
  const slashIndex = result.lastIndexOf("/")
  if (slashIndex >= 0) result = result.slice(slashIndex + 1)
  const colonIndex = result.indexOf(":")
  if (colonIndex >= 0) result = result.slice(0, colonIndex)
  return result
    .replace(/[-_](?:20\d{2})[-_]\d{2}[-_]\d{2}$/i, "")
    .replace(/[-_](?:20\d{6})$/i, "")
    .trim()
}

function suggestedProviderPrefixMappings(models) {
  const candidates = new Map()
  for (const actualModel of models) {
    const slashIndex = actualModel.indexOf("/")
    if (slashIndex < 1 || slashIndex === actualModel.length - 1) continue
    const standardModel = actualModel.slice(slashIndex + 1)
    const targets = candidates.get(standardModel) || []
    targets.push(actualModel)
    candidates.set(standardModel, targets)
  }
  return [...candidates.entries()]
    .filter(([, targets]) => targets.length === 1)
    .map(([standardModel, [actualModel]]) => ({ standardModel, actualModel }))
}

elements.suggestMappings.addEventListener("click", () => {
  if (!state.preview) return
  const actualSet = new Set(state.preview.models)
  const usedAliases = new Set(
    state.mappings.map((entry) => entry.standardModel),
  )
  let added = 0
  for (const actualModel of state.preview.models) {
    const standardModel = suggestedStandardName(actualModel)
    if (
      !standardModel ||
      standardModel === actualModel ||
      actualSet.has(standardModel) ||
      usedAliases.has(standardModel)
    ) {
      continue
    }
    state.mappings.push({ standardModel, actualModel })
    usedAliases.add(standardModel)
    added += 1
  }
  renderMappings()
  toast(
    added > 0
      ? `生成了 ${added} 条保守命名建议，请确认后写入`
      : "没有发现需要改名的模型",
  )
})

elements.addMapping.addEventListener("click", () => {
  state.mappings.push({ standardModel: "", actualModel: "" })
  renderMappings()
  const rows = elements.mappingList.querySelectorAll(".mapping-row")
  rows[rows.length - 1]?.querySelector("input")?.focus()
})

elements.manualModels.addEventListener("input", updateModelPlanSummary)
elements.duplicateTarget.addEventListener("change", updateDuplicateAction)

function isSecretInputVisible(input) {
  return input.tagName === "TEXTAREA"
    ? !input.classList.contains("masked")
    : input.type !== "password"
}

function setSecretInputVisible(input, visible) {
  if (input.tagName === "TEXTAREA") {
    input.classList.toggle("masked", !visible)
    return
  }
  input.type = visible ? "text" : "password"
}

function resetStaticCredentialVisibility() {
  for (const input of [
    elements.apiKey,
    elements.uniformQuota,
    elements.keyQuotas,
  ]) {
    setSecretInputVisible(input, true)
    const button = document.querySelector(`[data-toggle-secret="${input.id}"]`)
    if (button) button.textContent = "隐藏"
  }
}

document.querySelectorAll("[data-toggle-secret]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.toggleSecret)
    const visible = isSecretInputVisible(input)
    setSecretInputVisible(input, !visible)
    button.textContent = visible ? "显示" : "隐藏"
  })
})

elements.toggleConfig.addEventListener("click", () => {
  const isHidden = elements.configForm.classList.toggle("hidden")
  elements.toggleConfig.textContent = isHidden ? "展开设置" : "收起设置"
})

elements.providerSearch.addEventListener("input", renderProviders)

const resetOpenLoginWarning = () => {
  state.pendingInsecureLoginUrl = ""
  elements.openLoginPage.textContent = "打开网页登录"
  elements.openLoginPage.classList.remove("insecure")
}

function updateInsecureHttpVisibility() {
  let show = false
  try {
    const target = new URL(elements.targetUrl.value.trim())
    show =
      target.protocol === "http:" &&
      !["localhost", "127.0.0.1", "::1"].includes(target.hostname)
  } catch {
    // Keep the opt-in hidden until the address is complete.
  }
  elements.insecureHttpRow.classList.toggle("hidden", !show)
  if (!show) elements.allowInsecureHttp.checked = false
}

elements.targetUrl.addEventListener("input", () => {
  resetOpenLoginWarning()
  updateInsecureHttpVisibility()
  resetSavedTokenHintIfConnectionChanged()
})

elements.userId.addEventListener(
  "input",
  resetSavedTokenHintIfConnectionChanged,
)

elements.profileName.addEventListener("input", () => {
  state.profileNameEdited = true
})

elements.channelName.addEventListener("input", () => {
  state.channelNameEdited = true
})

elements.profileSelect.addEventListener("change", async () => {
  const profileId = elements.profileSelect.value
  if (!profileId) return
  hideStatus(elements.configStatus)
  try {
    const result = await api("/api/profiles/select", {
      method: "POST",
      body: JSON.stringify({ profileId }),
    })
    renderConnection(result.config)
    renderGroups(result.groups || [])
    closePreviewDialog()
    elements.loginPassword.value = ""
    elements.adminToken.value = ""
    showStatus(
      elements.configStatus,
      state.configured
        ? "已切换 New API，可以继续导入。"
        : "已切换站点；本地登录已失效，请重新登录。",
      !state.configured,
    )
    toast(`已切换到 ${result.config.name}`)
  } catch (error) {
    showStatus(elements.configStatus, error.message, true)
  }
})

elements.newProfile.addEventListener("click", () => {
  state.activeProfileId = ""
  state.configured = false
  renderGroups([])
  state.profileNameEdited = false
  elements.profileSelect.value = ""
  elements.profileName.value = ""
  elements.targetUrl.value = ""
  elements.loginUsername.value = ""
  elements.loginPassword.value = ""
  elements.userId.value = "1"
  elements.adminToken.value = ""
  state.credentialTargetUrl = ""
  state.credentialUserId = ""
  elements.adminToken.required = true
  elements.adminToken.placeholder = TOKEN_PLACEHOLDER
  elements.connectionPill.classList.remove("connected")
  elements.connectionPill.querySelector("strong").textContent = "新增站点"
  updateInsecureHttpVisibility()
  elements.configForm.classList.remove("hidden")
  hideStatus(elements.configStatus)
  elements.profileName.focus()
})

elements.openLoginPage.addEventListener("click", () => {
  hideStatus(elements.configStatus)
  try {
    const target = new URL(elements.targetUrl.value.trim())
    if (!["http:", "https:"].includes(target.protocol)) {
      throw new Error("New API 地址必须使用 HTTP 或 HTTPS")
    }
    if (target.username || target.password) {
      throw new Error("New API 地址中不能包含用户名或密码")
    }
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(
      target.hostname,
    )
    target.search = ""
    target.hash = ""
    const pathname = target.pathname.replace(/\/+$/, "")
    target.pathname = pathname.endsWith("/login")
      ? pathname
      : `${pathname}/login`
    if (
      target.protocol !== "https:" &&
      !isLoopback &&
      state.pendingInsecureLoginUrl !== target.href
    ) {
      state.pendingInsecureLoginUrl = target.href
      elements.openLoginPage.textContent = "仍然打开 HTTP 登录页"
      elements.openLoginPage.classList.add("insecure")
      showStatus(
        elements.configStatus,
        "风险提示：该站点没有 HTTPS，登录密码会通过公网明文传输，可能被截获。确认风险后再次点击打开。",
        true,
      )
      return
    }
    resetOpenLoginWarning()
    window.open(target.href, "_blank", "noopener,noreferrer")
  } catch (error) {
    showStatus(
      elements.configStatus,
      error instanceof Error ? error.message : "New API 地址不正确",
      true,
    )
  }
})

elements.configForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  hideStatus(elements.configStatus)
  const button = $("#login-button")
  setLoading(button, true)
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        profileId: state.activeProfileId,
        profileName: elements.profileName.value,
        profileNameEdited: state.profileNameEdited,
        targetUrl: elements.targetUrl.value,
        username: elements.loginUsername.value,
        password: elements.loginPassword.value,
        rememberSession: elements.rememberSession.checked,
        allowInsecureHttp: elements.allowInsecureHttp.checked,
      }),
    })
    elements.loginPassword.value = ""
    state.configured = true
    state.profileNameEdited = false
    state.activeProfileId = result.profile.profileId
    const profileSummary = {
      profileId: result.profile.profileId,
      name: result.profile.name,
      target: result.target,
    }
    state.profiles = [
      ...state.profiles.filter(
        (profile) => profile.profileId !== profileSummary.profileId,
      ),
      profileSummary,
    ]
    renderProfiles()
    renderGroups(result.groups || [])
    elements.connectionPill.classList.add("connected")
    elements.connectionPill.querySelector("strong").textContent = new URL(
      elements.targetUrl.value,
    ).host
    showStatus(
      elements.configStatus,
      elements.rememberSession.checked
        ? `已登录 ${result.username}：${result.target}。密码未保存，Session 已加密保存。`
        : `已登录 ${result.username}：${result.target}。密码和 Session 均未保存。`,
    )
    toast("New API 登录成功")
  } catch (error) {
    elements.loginPassword.value = ""
    showStatus(elements.configStatus, error.message, true)
    toast(error.message, true)
  } finally {
    setLoading(button, false)
  }
})

elements.tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  hideStatus(elements.configStatus)
  const button = $("#save-token")
  setLoading(button, true)
  try {
    const result = await api("/api/config", {
      method: "POST",
      body: JSON.stringify({
        profileId: state.activeProfileId,
        profileName: elements.profileName.value,
        profileNameEdited: state.profileNameEdited,
        targetUrl: elements.targetUrl.value,
        adminToken: elements.adminToken.value.trim(),
        rememberToken: elements.rememberToken.checked,
        allowInsecureHttp: elements.allowInsecureHttp.checked,
      }),
    })
    elements.adminToken.value = ""
    state.configured = true
    state.profileNameEdited = false
    state.activeProfileId = result.profile.profileId
    state.credentialTargetUrl = result.profile.targetUrl
    state.credentialUserId = result.profile.userId
    elements.adminToken.required = false
    elements.adminToken.placeholder = "已安全保存；修改时重新输入"
    const profileSummary = {
      profileId: result.profile.profileId,
      name: result.profile.name,
      target: result.target,
    }
    state.profiles = [
      ...state.profiles.filter(
        (profile) => profile.profileId !== profileSummary.profileId,
      ),
      profileSummary,
    ]
    renderProfiles()
    renderGroups(result.groups || [])
    elements.connectionPill.classList.add("connected")
    elements.connectionPill.querySelector("strong").textContent = new URL(
      elements.targetUrl.value,
    ).host
    showStatus(elements.configStatus, `令牌连接成功：${result.target}`)
    toast("New API 连接已经准备好")
  } catch (error) {
    elements.adminToken.value = ""
    if (/access token|Unauthorized|认证/i.test(error.message)) {
      elements.adminToken.placeholder = "令牌无效，请粘贴新的管理员系统访问令牌"
    }
    showStatus(elements.configStatus, error.message, true)
    toast(error.message, true)
  } finally {
    setLoading(button, false)
  }
})

function buildCredentialRequestBody() {
  return {
    providerId: state.selectedProvider.id,
    name: elements.channelName.value,
    automaticName: !state.channelNameEdited,
    groups: selectedGroups(),
    priority: elements.channelPriority.value,
    weight: elements.channelWeight.value,
    prioritySequence: {
      enabled: elements.priorityDescending.checked,
      step: elements.priorityStep.value,
    },
    configSource: selectedTemplateId()
      ? "template"
      : elements.configSource.value,
    templateChannelId: selectedTemplateId(),
    baseUrl: elements.sourceBaseUrl.value,
    apiKey: elements.apiKey.value,
    quotaMode: elements.quotaMode.value,
    uniformQuota: elements.uniformQuota.value,
    quotaLines: elements.keyQuotas.value,
    credentialMode: elements.credentialMode.value,
    credentialParts: Object.fromEntries(
      [
        ...elements.providerConfigFields.querySelectorAll(
          "[data-credential-part]",
        ),
      ].map((input) => [input.dataset.credentialPart, input.value]),
    ),
    providerExtra:
      elements.providerConfigFields.querySelector("[data-provider-extra]")
        ?.value || "",
    providerFlags: {
      ...Object.fromEntries(
        [
          ...elements.providerConfigFields.querySelectorAll(
            "[data-provider-flag]",
          ),
        ].map((input) => [input.dataset.providerFlag, input.checked]),
      ),
      ...(state.selectedProvider.id === "aws"
        ? { globalInference: elements.awsGlobalInference.checked }
        : {}),
    },
    providerModels: elements.providerModels.value,
    providerModelMappings: elements.providerModelMappings.value,
  }
}

function clearSensitiveCredentialInputs() {
  elements.apiKey.value = ""
  elements.uniformQuota.value = ""
  elements.keyQuotas.value = ""
  elements.providerConfigFields
    .querySelectorAll('[data-sensitive="true"]')
    .forEach((input) => {
      input.value = ""
    })
  resetStaticCredentialVisibility()
}

elements.credentialForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  if (!state.configured) {
    showStatus(elements.credentialStatus, "请先在上方连接 New API。", true)
    setAppView("sites")
    $("#connection").scrollIntoView({ behavior: "smooth" })
    return
  }
  hideStatus(elements.credentialStatus)
  setLoading(elements.previewButton, true)
  try {
    const body = buildCredentialRequestBody()
    state.pendingSchedule = elements.scheduleEnabled.checked
      ? {
          startAt: elements.scheduleStartAt.value,
          batchSize: elements.scheduleBatchSize.value,
          intervalMinutes: elements.scheduleIntervalMinutes.value,
        }
      : null
    const preview = await api("/api/preview", {
      method: "POST",
      body: JSON.stringify(body),
    })
    elements.channelName.value = preview.name
    renderPreview(preview)
    toast(
      `识别 ${preview.deduplication.inputCount} 条，去重后待添加 ${preview.keyCount} 条`,
    )
  } catch (error) {
    state.pendingSchedule = null
    showStatus(elements.credentialStatus, error.message, true)
  } finally {
    setLoading(elements.previewButton, false)
  }
})

elements.discardPreview.addEventListener("click", () => {
  if (state.createInFlight) return
  closePreviewDialog()
  toast("已返回，可继续修改 Key 或额度")
})

elements.previewDialog.addEventListener("cancel", (event) => {
  if (state.createInFlight) {
    event.preventDefault()
    return
  }
  closePreviewDialog()
})

async function createCurrentPreview({ forceNew = false } = {}) {
  if (!state.preview || state.createInFlight) return
  const hasDuplicates =
    state.pendingSchedule === null &&
    state.preview.duplicates.length > 0 &&
    !state.preview.templateChannelId
  const existingChannel = forceNew ? null : selectedDuplicateChannel()
  if (hasDuplicates && !forceNew && !elements.confirmDuplicates.checked) {
    const message = existingChannel
      ? existingChannel.isMultiKey
        ? "请先确认把 Key 追加到所选多 Key 渠道。"
        : "请先确认替换所选单 Key 渠道的原 Key。"
      : "请先确认是否仍要新增同来源渠道。"
    showStatus(elements.createStatus, message, true)
    return
  }
  hideStatus(elements.createStatus)
  state.createInFlight = true
  elements.discardPreview.disabled = true
  setLoading(elements.createChannel, true)
  try {
    if (state.pendingSchedule !== null) {
      const result = await api("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          previewId: state.preview.previewId,
          combineKeys:
            elements.batchMode.value === "multi_to_single" &&
            state.preview.keyCount > 1,
          manualModels: parseManualModels(),
          mappings: state.mappings,
          schedule: state.pendingSchedule,
        }),
      })
      clearSensitiveCredentialInputs()
      state.schedules = [
        result.schedule,
        ...state.schedules.filter(
          (schedule) => schedule.id !== result.schedule.id,
        ),
      ]
      renderSchedules()
      showStatus(
        elements.createStatus,
        `定时任务已保存：去重后共 ${result.schedule.counts.total} 条 Key，首次执行 ${formatDateTime(result.schedule.nextRunAt)}。`,
      )
      toast("定时上 Key 任务已确认保存")
      state.preview = null
      state.pendingSchedule = null
      elements.createChannel.querySelector("span").textContent = "任务已保存"
      elements.discardPreview.textContent = "关闭"
      return
    }
    const result = await api("/api/create", {
      method: "POST",
      body: JSON.stringify({
        previewId: state.preview.previewId,
        confirmDuplicates: forceNew || elements.confirmDuplicates.checked,
        existingChannelId: existingChannel?.id ?? null,
        manualModels: parseManualModels(),
        mappings: state.mappings,
        combineKeys:
          elements.batchMode.value === "multi_to_single" &&
          state.preview.keyCount > 1,
      }),
    })
    clearSensitiveCredentialInputs()
    if (result.continuationSchedule) {
      state.schedules = [
        result.continuationSchedule,
        ...state.schedules.filter(
          (schedule) => schedule.id !== result.continuationSchedule.id,
        ),
      ]
      renderSchedules()
      const pending = result.continuationSchedule.counts.pending
      showStatus(
        elements.createStatus,
        `首条已写入，剩余 ${pending} 条已进入安全队列；每分钟自动写入 1 条，避免触发 New API 限流。下一条：${formatDateTime(result.continuationSchedule.nextRunAt)}。`,
      )
      toast(`已安全排队：${pending} 条 Key 将自动写入`)
    } else if (result.recoverySchedule) {
      state.schedules = [
        result.recoverySchedule,
        ...state.schedules.filter(
          (schedule) => schedule.id !== result.recoverySchedule.id,
        ),
      ]
      renderSchedules()
      const pending = result.recoverySchedule.counts.pending
      showStatus(
        elements.createStatus,
        `部分完成：成功 ${result.successCount} 条，待续传 ${pending} 条。New API 触发限流，剩余 Key 已加密保留；成功项不会重复写入。下次自动继续：${formatDateTime(result.recoverySchedule.nextRunAt)}。`,
        false,
        { recovering: true },
      )
      toast(`已转自动续传：${pending} 条 Key 等待继续写入`)
    } else if (result.operation === "skipped") {
      showStatus(
        elements.createStatus,
        `没有重复写入：${result.skippedCount} 条 Key 已由另一批任务先完成。`,
      )
      toast("重复 Key 已自动跳过")
    } else if (result.operation === "updated") {
      const action =
        result.keyAction === "appended" ? "已追加 Key 到" : "已替换 Key："
      const enableCopy = result.channelEnabled
        ? "渠道已启用"
        : "但自动启用失败，请到 New API 检查状态"
      showStatus(
        elements.createStatus,
        `${action}“${result.channelName}”：成功 ${result.successCount} 条，失败 ${result.failedCount} 条；${enableCopy}。`,
        !result.success,
      )
      toast(
        result.success ? "同类渠道已更新" : "同类渠道已部分更新",
        !result.success,
      )
    } else if (result.operation === "created-multi-key") {
      showStatus(
        elements.createStatus,
        `已建立多 Key 渠道“${result.channelName}”，一次写入 ${result.successCount} 条 Key。`,
      )
      toast(`多 Key 渠道写入完成：${result.successCount} 条`)
    } else {
      const summary = `成功 ${result.successCount} 条，失败 ${result.failedCount} 条`
      showStatus(
        elements.createStatus,
        `批量写入完成：${summary}；每个渠道包含 ${result.modelCount} 个模型。`,
        result.failedCount > 0,
      )
      toast(
        result.failedCount > 0 ? `批量写入部分完成：${summary}` : summary,
        result.failedCount > 0,
      )
    }
    if (result.balance) renderBalance(result.balance, result.channelId)
    state.preview = null
    state.pendingSchedule = null
    elements.discardPreview.textContent = "关闭"
    elements.createChannel.querySelector("span").textContent =
      result.continuationSchedule
        ? "已进入安全队列"
        : result.recoverySchedule
          ? "已转自动续传"
          : result.operation === "updated"
            ? "更新完成"
            : result.operation === "skipped"
              ? "已自动去重"
              : "写入完成"
    if (result.successCount > 0) {
      try {
        await loadRecords()
      } catch (error) {
        toast(`渠道已写入，但记录刷新失败：${error.message}`, true)
      }
    }
  } catch (error) {
    showStatus(elements.createStatus, error.message, true)
  } finally {
    state.createInFlight = false
    setLoading(elements.createChannel, false)
    elements.createChannel.disabled = !state.preview
    elements.discardPreview.disabled = false
  }
}

elements.createChannel.addEventListener("click", () => createCurrentPreview())

elements.refreshBalance.addEventListener("click", async () => {
  if (!state.createdChannelId) return
  setLoading(elements.refreshBalance, true)
  try {
    const result = await api("/api/balance", {
      method: "POST",
      body: JSON.stringify({ channelId: state.createdChannelId }),
    })
    renderBalance(result.balance, result.channelId)
    toast(
      result.balance.status === "available"
        ? "渠道余额已刷新"
        : "该渠道暂时无法自动查询余额",
      result.balance.status !== "available",
    )
  } catch (error) {
    elements.balanceMessage.textContent = error.message
    toast(error.message, true)
  } finally {
    setLoading(elements.refreshBalance, false)
  }
})

function setUsageMonitorSyncStatus(copy, status = "") {
  const dot = document.createElement("i")
  elements.usageMonitorSyncStatus.replaceChildren(
    dot,
    document.createTextNode(` ${copy}`),
  )
  elements.usageMonitorSyncStatus.classList.toggle(
    "warning",
    status === "warning",
  )
  elements.usageMonitorSyncStatus.classList.toggle(
    "syncing",
    status === "syncing",
  )
}

async function refreshUsageRecords(records, button, options = {}) {
  const originalCopy = button.textContent
  button.disabled = true
  setUsageMonitorSyncStatus(
    options.automatic ? "自动校准中" : "正在校准",
    "syncing",
  )
  try {
    const refreshable = records.filter(
      (record) =>
        record.channelId &&
        (!record.sharedChannel || Number.isInteger(record.keyIndex)),
    )
    let updatedCount = 0
    let failedCount = 0
    let stoppedForRateLimit = false
    for (let index = 0; index < refreshable.length; index += 1) {
      button.textContent = `刷新中 ${index + 1}/${refreshable.length}`
      try {
        const result = await api("/api/imports/refresh", {
          method: "POST",
          body: JSON.stringify({ recordId: refreshable[index].id }),
        })
        updatedCount += 1
        state.records = state.records.map((record) =>
          record.id === result.record.id ? result.record : record,
        )
      } catch (error) {
        failedCount += 1
        if (/429|请求次数过多|限流/i.test(error.message)) {
          stoppedForRateLimit = true
          break
        }
      }
      if (index < refreshable.length - 1) {
        await pause(USAGE_REFRESH_INTERVAL_MS)
      }
    }
    renderUsageMonitor()
    renderRecords()
    setUsageMonitorSyncStatus(
      stoppedForRateLimit
        ? `限流保护：已完成 ${updatedCount} 条`
        : failedCount > 0
          ? `${updatedCount} 条已校准`
          : "刚刚已校准",
      failedCount > 0 ? "warning" : "",
    )
    if (!options.silent) {
      toast(
        stoppedForRateLimit
          ? `New API 已限流，已停止继续刷新，避免影响上 Key；本次完成 ${updatedCount} 条`
          : failedCount > 0
            ? `刷新完成：成功 ${updatedCount} 条，失败 ${failedCount} 条`
            : `已校准 ${updatedCount} 条 Key 累计用量`,
        failedCount > 0,
      )
    }
  } catch (error) {
    setUsageMonitorSyncStatus("校准失败", "warning")
    toast(error.message, true)
  } finally {
    button.disabled = false
    button.textContent = originalCopy
  }
}

async function autoRefreshUsageMonitor() {
  if (state.usageAutoRefreshStarted) return
  state.usageAutoRefreshStarted = true
  const staleBefore = Date.now() - 15 * 60 * 1000
  const staleRecords = currentUsageMonitorRecords().filter((record) => {
    if (!record.channelId || Number.isInteger(record.keyIndex)) return false
    const checkedAt = Date.parse(record.usageCheckedAt || "")
    return (
      record.usageMethod !== "database-stat" ||
      !Number.isFinite(checkedAt) ||
      checkedAt < staleBefore
    )
  })
  if (staleRecords.length === 0) {
    setUsageMonitorSyncStatus("数据已是最新")
    return
  }
  // Entering the usage page only refreshes a very small sample. A full stale
  // ledger can contain hundreds of channels and would otherwise consume New
  // API's shared management quota before the user starts importing Keys.
  await refreshUsageRecords(
    staleRecords.slice(0, 3),
    elements.refreshUsageMonitor,
    {
      automatic: true,
      silent: true,
    },
  )
}

elements.refreshRecords.addEventListener("click", async () => {
  const refreshable = filterUsageRecords(state.records, currentRecordFilters())
  await refreshUsageRecords(refreshable, elements.refreshRecords)
})

elements.refreshUsageMonitor.addEventListener("click", async () => {
  await refreshUsageRecords(
    currentUsageMonitorRecords(),
    elements.refreshUsageMonitor,
  )
})

elements.usageMonitorTarget.addEventListener("change", renderUsageMonitor)
for (const input of [elements.usageMonitorStart, elements.usageMonitorEnd]) {
  input.addEventListener("change", () => {
    markUsageMonitorRange()
    const start = elements.usageMonitorStart.value
    const end = elements.usageMonitorEnd.value
    if (start && end && start > end) {
      if (input === elements.usageMonitorStart) {
        elements.usageMonitorEnd.value = start
      } else {
        elements.usageMonitorStart.value = end
      }
    }
    renderUsageMonitor()
  })
}
for (const button of document.querySelectorAll("[data-usage-range]")) {
  button.addEventListener("click", () => {
    setUsageMonitorRange(button.dataset.usageRange)
    renderUsageMonitor()
  })
}

for (const filter of [
  elements.recordsTargetFilter,
  elements.recordsProviderFilter,
  elements.recordsStatusFilter,
]) {
  filter.addEventListener("change", renderRecords)
}
elements.recordsSearch.addEventListener("input", renderRecords)
elements.resetRecordFilters.addEventListener("click", () => {
  elements.recordsTargetFilter.value = ""
  elements.recordsProviderFilter.value = ""
  elements.recordsStatusFilter.value = ""
  elements.recordsSearch.value = ""
  renderRecords()
})

elements.refreshGroups.addEventListener("click", loadGroups)
elements.refreshSchedules.addEventListener("click", async () => {
  setLoading(elements.refreshSchedules, true)
  try {
    await loadSchedules()
    toast("定时队列已刷新")
  } catch (error) {
    toast(error.message, true)
  } finally {
    setLoading(elements.refreshSchedules, false)
  }
})

function updateScheduleForm() {
  const enabled = elements.scheduleEnabled.checked
  elements.scheduleOptions.classList.toggle("hidden", !enabled)
  elements.previewButton.querySelector("span").textContent = enabled
    ? "识别并预览定时任务"
    : "识别 Key 并预览"
  if (enabled && !elements.scheduleStartAt.value) {
    elements.scheduleStartAt.value = formatDateTimeInput(
      new Date(Date.now() + 10 * 60 * 1000),
    )
  }
}

elements.scheduleEnabled.addEventListener("change", updateScheduleForm)

function updateQuotaModeForm() {
  const uniform = elements.quotaMode.value === "uniform"
  elements.uniformQuotaField.classList.toggle("hidden", !uniform)
  elements.perLineQuotaField.classList.toggle("hidden", uniform)
  elements.uniformQuota.required = uniform
  elements.keyQuotas.required = false
  elements.quotaHelp.textContent = uniform
    ? "这个额度会应用到本批全部 Key；支持 485、485u、$485、485刀或 x。"
    : "每行对应左侧同一行 Key；可不填，未知额度填写 x。"
}

elements.quotaMode.addEventListener("change", updateQuotaModeForm)

function updatePrioritySequenceForm() {
  const multiKey = elements.batchMode.value === "multi_to_single"
  if (multiKey) elements.priorityDescending.checked = false
  elements.priorityDescending.disabled = multiKey
  const enabled = elements.priorityDescending.checked && !multiKey
  elements.priorityStepField.classList.toggle("hidden", !enabled)
  elements.priorityStep.disabled = !enabled
  if (enabled && !elements.channelPriority.value) {
    elements.channelPriority.value = "100"
  }
}

elements.batchMode.addEventListener("change", updatePrioritySequenceForm)
elements.priorityDescending.addEventListener(
  "change",
  updatePrioritySequenceForm,
)

async function bootstrap() {
  try {
    const response = await fetch("/api/bootstrap", { cache: "no-store" })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "初始化失败")
    state.sessionToken = payload.sessionToken
    state.providers = payload.providers
    state.profiles = payload.profiles || []
    state.activeProfileId = payload.config.profileId || ""
    renderProfiles()
    renderConnection(payload.config)
    renderCategories()
    renderProviders()
    renderGroups(payload.groups || [])
    state.schedules = payload.schedules || []
    renderSchedules()
    if (payload.deployment?.sharedDatabase) {
      elements.serviceLabel.textContent = "共享服务运行中"
      elements.serviceDetail.textContent = "站点、任务和记录由数据库同步"
    }
    elements.accessLogout.classList.toggle(
      "hidden",
      !payload.deployment?.accessProtected,
    )
    if (payload.groupsError) {
      elements.channelGroupsHelp.textContent = `分组读取失败：${payload.groupsError}`
    }
    setUsageMonitorRange("7")
    await loadRecords()
    updateScheduleForm()
    void autoRefreshUsageMonitor()
  } catch (error) {
    toast(error.message, true)
  }
}

setAppView(window.location.hash, { updateHash: false, scroll: false })
bootstrap()
