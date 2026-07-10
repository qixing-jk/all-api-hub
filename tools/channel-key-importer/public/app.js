import {
  filterUsageDashboardRecords,
  filterUsageRecords,
  gatewaySpent,
  groupUsageDashboardByDay,
  groupUsageDashboardByTarget,
  localDateKey,
  summarizeUsageDashboard,
  summarizeUsageRecords,
  usageState,
} from "./usageStats.js"

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
  mappings: [],
  createdChannelId: null,
  pendingInsecureLoginUrl: "",
  credentialTargetUrl: "",
  credentialUserId: "",
  usageAutoRefreshStarted: false,
}

const TOKEN_PLACEHOLDER = "粘贴管理员的系统访问令牌"

const $ = (selector) => document.querySelector(selector)
const elements = {
  connectionPill: $("#connection-pill"),
  configForm: $("#config-form"),
  configStatus: $("#config-status"),
  targetUrl: $("#target-url"),
  profileSelect: $("#profile-select"),
  profileName: $("#profile-name"),
  newProfile: $("#new-profile"),
  loginUsername: $("#login-username"),
  loginPassword: $("#login-password"),
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
  keyQuotas: $("#key-quotas"),
  awsGlobalField: $("#aws-global-field"),
  awsGlobalInference: $("#aws-global-inference"),
  autoWrite: $("#auto-write"),
  scheduleEnabled: $("#schedule-enabled"),
  scheduleOptions: $("#schedule-options"),
  scheduleStartAt: $("#schedule-start-at"),
  scheduleBatchSize: $("#schedule-batch-size"),
  scheduleIntervalMinutes: $("#schedule-interval-minutes"),
  batchMode: $("#batch-mode"),
  keyLabel: $("#key-label"),
  unsupportedNote: $("#unsupported-note"),
  previewButton: $("#preview-button"),
  previewPanel: $("#preview-panel"),
  previewName: $("#preview-name"),
  previewProvider: $("#preview-provider"),
  previewBaseUrl: $("#preview-base-url"),
  previewGroups: $("#preview-groups"),
  previewAwsRoutingFact: $("#preview-aws-routing-fact"),
  previewAwsRouting: $("#preview-aws-routing"),
  modelCount: $("#model-count"),
  batchKeyCount: $("#batch-key-count"),
  batchQuotaTotal: $("#batch-quota-total"),
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

const setLoading = (button, loading) => {
  button.classList.toggle("loading", loading)
  button.disabled = loading
}

const showStatus = (element, message, isError = false) => {
  element.textContent = message
  element.classList.remove("hidden")
  element.classList.toggle("error", isError)
}

const hideStatus = (element) => {
  element.textContent = ""
  element.classList.add("hidden")
  element.classList.remove("error")
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
  if (!response.ok) throw new Error(payload.error || "操作失败")
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

function selectProvider(provider) {
  state.selectedProvider = provider
  state.preview = null
  elements.previewPanel.classList.add("hidden")
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
  elements.keyQuotas.value = ""
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
    ? "可整段粘贴多条完整凭证；每条后面可带额度。上方字段用于单条录入。"
    : "可整段粘贴几十条 Key；Key 后可带额度，支持空格、|、逗号或冒号分隔。"
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
  if (field.secret && !field.multiline) input.type = "password"
  input.placeholder = field.placeholder || ""
  input.value = field.defaultValue || ""
  input.autocomplete = "new-password"
  input.dataset[valueKind] = field.id
  const sensitive = field.secret || Boolean(field.fileAccept)
  if (sensitive) input.dataset.sensitive = "true"
  label.append(title)
  if (sensitive && field.multiline) {
    const wrapper = document.createElement("div")
    wrapper.className = "secret-input textarea-secret"
    const toggle = document.createElement("button")
    toggle.type = "button"
    toggle.textContent = "显示"
    toggle.addEventListener("click", () => {
      input.classList.toggle("revealed")
      toggle.textContent = input.classList.contains("revealed")
        ? "隐藏"
        : "显示"
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
  elements.createChannel.querySelector("span").textContent = "确认写入 New API"
  elements.balanceCard.classList.add("hidden")
  elements.previewName.textContent = preview.name
  elements.previewProvider.textContent = `${preview.provider.name} / TYPE ${preview.provider.channelType}`
  elements.previewBaseUrl.textContent =
    preview.provider.baseUrl || "New API 默认"
  elements.previewGroups.textContent = preview.groups.join("、")
  elements.previewAwsRoutingFact.classList.toggle("hidden", !preview.awsRouting)
  elements.previewAwsRouting.textContent = preview.awsRouting
    ? `${preview.awsRouting.regions.join("、")} · ${
        preview.awsRouting.globalInference ? "Global 全球路由" : "区域路由"
      }`
    : "—"
  elements.modelCount.textContent = String(preview.models.length)
  elements.batchKeyCount.textContent = String(preview.keyCount || 1)
  elements.batchQuotaTotal.textContent = Number.isFinite(preview.quotaTotal)
    ? formatUsd(preview.quotaTotal)
    : "未全部填写"
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
    preview.duplicates.length > 0 && !preview.templateChannelId
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
  elements.previewPanel.scrollIntoView({ behavior: "smooth", block: "start" })
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
      "确认写入 New API"
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
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const formatUsageTime = (timestamp) => {
  if (timestamp == null || timestamp === "") return "尚未使用"
  return Number.isFinite(Number(timestamp))
    ? formatDateTime(Number(timestamp) * 1000)
    : "尚未使用"
}

const scheduleStatusCopy = (status) =>
  ({
    active: "等待执行",
    running: "正在写入",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
  })[status] || status

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
  for (const record of records) {
    const row = document.createElement("tr")
    const timeTarget = document.createElement("td")
    const time = document.createElement("strong")
    time.textContent = new Date(record.importedAt).toLocaleString("zh-CN")
    const target = document.createElement("small")
    target.textContent = `${record.targetName || "New API"} · ${record.targetUrl}`
    timeTarget.append(time, target)

    const sourceKey = document.createElement("td")
    const source = document.createElement("strong")
    source.textContent = record.providerName
    const key = document.createElement("small")
    key.textContent = `${record.keyHint} · ${record.keyFingerprint}`
    sourceKey.append(source, key)

    const channel = document.createElement("td")
    channel.className = "channel-cell"
    channel.textContent = record.channelName || "未定位"
    if (record.channelId) {
      const channelId = document.createElement("small")
      channelId.textContent = `渠道 #${record.channelId}`
      channel.append(channelId)
    }
    const quotaBalance = document.createElement("td")
    const quota = document.createElement("strong")
    quota.textContent = Number.isFinite(record.quota)
      ? formatUsd(record.quota)
      : "额度 x"
    const balance = document.createElement("small")
    balance.textContent = Number.isFinite(record.currentBalance)
      ? `上游余额 ${formatUsd(record.currentBalance)}`
      : "上游余额未查询"
    quotaBalance.append(quota, balance)
    if (Number.isFinite(record.upstreamSpent)) {
      const upstreamSpent = document.createElement("small")
      upstreamSpent.textContent = `上游差额 ${formatUsd(record.upstreamSpent)}`
      quotaBalance.append(upstreamSpent)
    }
    const spent = document.createElement("td")
    const status = document.createElement("span")
    const statusInfo = usageStateCopy(record)
    status.className = `usage-status ${statusInfo.className}`.trim()
    status.textContent = statusInfo.copy
    const cost = document.createElement("strong")
    cost.className = "usage-cost"
    cost.textContent = usageCopy(record)
    spent.append(status, cost)
    const trackedSpent = gatewaySpent(record)
    if (Number.isFinite(record.quota) && trackedSpent != null) {
      const remaining = document.createElement("small")
      remaining.textContent = `剩余录入额度 ${formatUsd(
        Math.max(0, record.quota - trackedSpent),
      )}`
      spent.append(remaining)
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
      spent.append(progress)
    }
    if (record.usageTruncated) {
      const partial = document.createElement("small")
      partial.textContent = "日志超过 50,000 条，金额和 Token 仅为已扫描部分"
      spent.append(partial)
    }
    const traffic = document.createElement("td")
    const requests = document.createElement("strong")
    requests.textContent = Number.isFinite(record.requestCount)
      ? `${formatInteger(record.requestCount)} 次`
      : "请求数待同步"
    const inputTokens = document.createElement("small")
    inputTokens.textContent = Number.isFinite(record.promptTokens)
      ? `输入 ${formatCompact(record.promptTokens)}`
      : "输入 Token —"
    const outputTokens = document.createElement("small")
    outputTokens.textContent = Number.isFinite(record.completionTokens)
      ? `输出 ${formatCompact(record.completionTokens)}`
      : "输出 Token —"
    const totalTokens = document.createElement("small")
    totalTokens.textContent =
      record.usageDetailsComplete === false
        ? "金额准确 · Token 明细未完整"
        : `合计 ${formatCompact(
            (record.promptTokens || 0) + (record.completionTokens || 0),
          )} tokens`
    traffic.append(requests, inputTokens, outputTokens, totalTokens)
    const activity = document.createElement("td")
    const lastUsed = document.createElement("strong")
    lastUsed.textContent = formatUsageTime(record.lastUsedAt)
    const checked = document.createElement("small")
    checked.textContent = record.checkedAt
      ? `刷新于 ${formatDateTime(record.checkedAt)}`
      : "尚未刷新"
    activity.append(lastUsed, checked)
    const action = document.createElement("td")
    const refresh = document.createElement("button")
    refresh.type = "button"
    refresh.className = "table-action"
    refresh.textContent = "刷新消耗"
    refresh.disabled =
      !record.channelId ||
      (record.sharedChannel && !Number.isInteger(record.keyIndex))
    refresh.addEventListener("click", () =>
      refreshImportRecord(record, refresh),
    )
    action.append(refresh)
    row.append(
      timeTarget,
      sourceKey,
      channel,
      quotaBalance,
      spent,
      traffic,
      activity,
      action,
    )
    elements.recordsBody.append(row)
  }
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
    const card = document.createElement("article")
    card.className = "schedule-card"
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
    status.className = `schedule-status ${schedule.status}`.trim()
    status.textContent = scheduleStatusCopy(schedule.status)
    header.append(titleWrap, status)

    const metrics = document.createElement("div")
    metrics.className = "schedule-metrics"
    const metricItems = [
      ["总 Key", `${schedule.counts.total}`],
      ["待写入", `${schedule.counts.pending}`],
      ["已写入", `${schedule.counts.imported}`],
      ["失败", `${schedule.counts.failed}`],
      [
        "下一次",
        schedule.status === "active"
          ? formatDateTime(schedule.nextRunAt)
          : scheduleStatusCopy(schedule.status),
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
    details.textContent = `每次 ${schedule.batchSize} 条；间隔 ${
      schedule.intervalMinutes
    } 分钟；最近执行 ${formatDateTime(schedule.lastRunAt)}。`
    if (schedule.lastError) {
      const error = document.createElement("p")
      error.className = "schedule-error"
      error.textContent = schedule.lastError
      card.append(header, metrics, details, error)
    } else {
      card.append(header, metrics, details)
    }

    const actions = document.createElement("div")
    actions.className = "schedule-actions"
    const runNow = document.createElement("button")
    runNow.type = "button"
    runNow.className = "table-action"
    runNow.textContent = "立即上一批"
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
    actions.append(runNow, toggle, cancel)
    card.append(actions)
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
    toast(action === "run" ? "已执行一批定时 Key" : "定时任务已更新")
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

document.querySelectorAll("[data-toggle-secret]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.toggleSecret)
    if (input.tagName === "TEXTAREA") {
      input.classList.toggle("revealed")
      button.textContent = input.classList.contains("revealed")
        ? "隐藏"
        : "显示"
      return
    }
    input.type = input.type === "password" ? "text" : "password"
    button.textContent = input.type === "password" ? "显示" : "隐藏"
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
    state.preview = null
    elements.previewPanel.classList.add("hidden")
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
      `已登录 ${result.username}：${result.target}。密码没有保存，关闭本地服务后需要重新登录。`,
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
    configSource: selectedTemplateId()
      ? "template"
      : elements.configSource.value,
    templateChannelId: selectedTemplateId(),
    baseUrl: elements.sourceBaseUrl.value,
    apiKey: elements.apiKey.value,
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
  elements.keyQuotas.value = ""
  elements.providerConfigFields
    .querySelectorAll('[data-sensitive="true"]')
    .forEach((input) => {
      input.value = ""
    })
  elements.apiKey.classList.remove("revealed")
}

elements.credentialForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  if (!state.configured) {
    showStatus(elements.credentialStatus, "请先在上方连接 New API。", true)
    $("#connection").scrollIntoView({ behavior: "smooth" })
    return
  }
  hideStatus(elements.credentialStatus)
  setLoading(elements.previewButton, true)
  try {
    const body = buildCredentialRequestBody()
    if (elements.scheduleEnabled.checked) {
      const result = await api("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          combineKeys: elements.batchMode.value === "multi_to_single",
          schedule: {
            startAt: elements.scheduleStartAt.value,
            batchSize: elements.scheduleBatchSize.value,
            intervalMinutes: elements.scheduleIntervalMinutes.value,
          },
        }),
      })
      clearSensitiveCredentialInputs()
      state.schedules = [result.schedule, ...state.schedules]
      renderSchedules()
      showStatus(
        elements.credentialStatus,
        `定时任务已保存：共 ${result.schedule.counts.total} 条 Key，首次执行 ${formatDateTime(result.schedule.nextRunAt)}。`,
      )
      toast("定时上 Key 任务已保存")
      return
    }
    const preview = await api("/api/preview", {
      method: "POST",
      body: JSON.stringify(body),
    })
    clearSensitiveCredentialInputs()
    elements.channelName.value = preview.name
    renderPreview(preview)
    toast(
      `已读取 ${preview.keyCount} 条 Key 和 ${preview.models.length} 个模型`,
    )
    if (elements.autoWrite.checked) {
      await createCurrentPreview({ forceNew: true })
    }
  } catch (error) {
    showStatus(elements.credentialStatus, error.message, true)
  } finally {
    setLoading(elements.previewButton, false)
  }
})

elements.discardPreview.addEventListener("click", () => {
  state.preview = null
  elements.previewPanel.classList.add("hidden")
  toast("这次预览已放弃")
})

async function createCurrentPreview({ forceNew = false } = {}) {
  if (!state.preview) return
  const hasDuplicates =
    state.preview.duplicates.length > 0 && !state.preview.templateChannelId
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
  setLoading(elements.createChannel, true)
  try {
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
    if (result.operation === "updated") {
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
    renderBalance(result.balance, result.channelId)
    state.preview = null
    elements.createChannel.disabled = true
    elements.createChannel.querySelector("span").textContent =
      result.operation === "updated" ? "更新完成" : "写入完成"
    try {
      await loadRecords()
    } catch (error) {
      toast(`渠道已写入，但记录刷新失败：${error.message}`, true)
    }
  } catch (error) {
    showStatus(elements.createStatus, error.message, true)
  } finally {
    setLoading(elements.createChannel, false)
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
    for (let index = 0; index < refreshable.length; index += 2) {
      button.textContent = `刷新中 ${Math.min(
        index + 2,
        refreshable.length,
      )}/${refreshable.length}`
      const results = await Promise.allSettled(
        refreshable.slice(index, index + 2).map((record) =>
          api("/api/imports/refresh", {
            method: "POST",
            body: JSON.stringify({ recordId: record.id }),
          }),
        ),
      )
      for (const result of results) {
        if (result.status !== "fulfilled") {
          failedCount += 1
          continue
        }
        updatedCount += 1
        state.records = state.records.map((record) =>
          record.id === result.value.record.id ? result.value.record : record,
        )
      }
    }
    renderUsageMonitor()
    renderRecords()
    setUsageMonitorSyncStatus(
      failedCount > 0 ? `${updatedCount} 条已校准` : "刚刚已校准",
      failedCount > 0 ? "warning" : "",
    )
    if (!options.silent) {
      toast(
        failedCount > 0
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
  await refreshUsageRecords(staleRecords, elements.refreshUsageMonitor, {
    automatic: true,
    silent: true,
  })
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
  elements.autoWrite.disabled = enabled
  if (enabled) elements.autoWrite.checked = false
  elements.previewButton.querySelector("span").textContent = enabled
    ? "保存定时上 Key 任务"
    : "批量添加到 New API"
  if (enabled && !elements.scheduleStartAt.value) {
    elements.scheduleStartAt.value = formatDateTimeInput(
      new Date(Date.now() + 10 * 60 * 1000),
    )
  }
}

elements.scheduleEnabled.addEventListener("change", updateScheduleForm)

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

bootstrap()
