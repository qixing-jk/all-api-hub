const PAGE_SIZE = 100
const MAX_CHANNEL_PAGES = 20
const MAX_USAGE_PAGES = 500

const requestHeaders = (config) => {
  const headers = {
    "Content-Type": "application/json",
    "New-API-User": config.userId,
  }
  if (config.sessionCookie) {
    headers.Cookie = config.sessionCookie
  } else {
    headers.Authorization = `Bearer ${config.adminToken}`
  }
  return headers
}

const getResponseCookies = (response) => {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean)
  return values
    .map((value) => String(value).split(";", 1)[0].trim())
    .filter((value) => value && !/[\r\n]/.test(value))
    .join("; ")
}

const safeUpstreamMessage = (payload, secrets) => {
  let message = String(payload?.message || payload?.error || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
  for (const secret of secrets) {
    if (secret) message = message.split(String(secret)).join("[已隐藏]")
  }
  if (!message || /<html|<!doctype/i.test(message)) return ""
  return message.slice(0, 240)
}

async function requestJson(url, options, secrets = []) {
  let response
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error("无法连接 New API，请检查地址和网络")
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // Keep the failure generic so response text can never leak a secret.
  }

  if (!response.ok || payload?.success === false) {
    const upstreamMessage = safeUpstreamMessage(payload, secrets)
    let message
    if (response.status === 401 || response.status === 403) {
      message = upstreamMessage
        ? `New API 管理员认证失败：${upstreamMessage}`
        : "New API 管理员认证失败"
    } else if (upstreamMessage) {
      message = `New API：${upstreamMessage}`
    } else {
      message = `New API 请求失败（HTTP ${response.status}）`
    }
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return payload
}

const channelListItems = (payload) => {
  const data = payload?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

const parseJsonObject = (value) => {
  try {
    const parsed = JSON.parse(String(value || "{}"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

const splitChannelValues = (value) =>
  [...new Set(String(value || "").split(","))]
    .map((item) => item.trim())
    .filter(Boolean)

const channelTemplateSummary = (channel) => ({
  id: Number(channel.id),
  name: String(channel.name || `渠道 #${channel.id}`),
  status: Number(channel.status) === 1 ? "正常" : "已停用",
  baseUrl: String(channel.base_url || ""),
  groups: splitChannelValues(channel.group),
  modelCount: splitChannelValues(channel.models).length,
})

export async function verifyNewApi(config) {
  await requestJson(
    `${config.targetUrl}/api/channel/?p=1&page_size=1`,
    { headers: requestHeaders(config) },
    [config.adminToken, config.sessionCookie].filter(Boolean),
  )
}

export async function discoverNewApiUserId({
  targetUrl,
  adminToken,
  preferredUserId = "",
}) {
  const preferred = Number(preferredUserId)
  const candidates = [
    ...(Number.isInteger(preferred) && preferred > 0 ? [preferred] : []),
    ...Array.from({ length: 50 }, (_, index) => index + 1),
  ].filter((value, index, values) => values.indexOf(value) === index)

  for (const userId of candidates) {
    let response
    try {
      response = await fetch(`${targetUrl}/api/channel/?p=1&page_size=1`, {
        headers: requestHeaders({
          targetUrl,
          adminToken,
          userId: String(userId),
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new Error("无法连接 New API，请检查地址和网络")
    }
    let payload = null
    try {
      payload = await response.json()
    } catch {
      // Fall through to the generic response error below.
    }
    if (response.ok && payload?.success !== false) return String(userId)
    if (response.status === 401) continue
    const message = safeUpstreamMessage(payload, [adminToken])
    if (message) throw new Error(`New API：${message}`)
    throw new Error(`New API 管理员认证失败（HTTP ${response.status}）`)
  }
  throw new Error("令牌有效，但未能自动找到对应用户 ID")
}

export async function fetchNewApiGroups(config) {
  // New API exposes the admin-configured channel groups as a string array.
  // https://github.com/QuantumNous/new-api/blob/main/controller/group.go
  const payload = await requestJson(
    `${config.targetUrl}/api/group/`,
    { headers: requestHeaders(config) },
    [config.adminToken, config.sessionCookie].filter(Boolean),
  )
  const groups = Array.isArray(payload?.data) ? payload.data : []
  return [...new Set(groups)]
    .filter((group) => typeof group === "string")
    .map((group) => group.trim())
    .filter(Boolean)
    .slice(0, 200)
}

export async function fetchNewApiDefaultModels(config, channelType) {
  // New API publishes the model list built into each channel adaptor. This
  // lets an administrator create channels without sending every provider key
  // upstream merely to discover models first.
  // https://github.com/QuantumNous/new-api/blob/main/controller/model.go
  const payload = await requestJson(
    `${config.targetUrl}/api/models`,
    { headers: requestHeaders(config) },
    [config.adminToken, config.sessionCookie].filter(Boolean),
  )
  const models = payload?.data?.[String(channelType)]
  return [...new Set(Array.isArray(models) ? models : [])]
    .filter((model) => typeof model === "string")
    .map((model) => model.trim())
    .filter(Boolean)
    .slice(0, 2000)
}

export async function fetchNewApiSystemName(targetUrl) {
  // New API exposes its configured display name through the public status API.
  // https://github.com/QuantumNous/new-api/blob/main/controller/misc.go
  const payload = await requestJson(`${targetUrl}/api/status`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(4_000),
  })
  return String(payload?.data?.system_name || "")
    .trim()
    .slice(0, 80)
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function requestUsageJson(url, config) {
  const secrets = [config.adminToken, config.sessionCookie].filter(Boolean)
  const retryDelays = [300, 800, 1600]
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestJson(
        url,
        { headers: requestHeaders(config) },
        secrets,
      )
    } catch (error) {
      if (error?.status !== 429 || attempt >= retryDelays.length) throw error
      await wait(retryDelays[attempt])
    }
  }
}

const usageQueryParams = (input) => {
  const params = new URLSearchParams({
    type: "2",
    channel: String(input.channelId),
    start_timestamp: String(input.startTimestamp),
  })
  if (Number.isFinite(input.endTimestamp)) {
    params.set("end_timestamp", String(input.endTimestamp))
  }
  return params
}

async function scanChannelUsageLogs(config, input) {
  const pageSize = 100
  let quota = 0
  let requestCount = 0
  let promptTokens = 0
  let completionTokens = 0
  let lastUsedAt = null
  let scannedLogCount = 0
  let totalLogCount = null
  let truncated = false

  for (let page = 1; page <= MAX_USAGE_PAGES; page += 1) {
    const params = usageQueryParams(input)
    params.set("p", String(page))
    params.set("page_size", String(pageSize))
    const payload = await requestUsageJson(
      `${config.targetUrl}/api/log/?${params}`,
      config,
    )
    const items = Array.isArray(payload?.data?.items) ? payload.data.items : []
    const reportedTotal = Number(payload?.data?.total)
    if (Number.isFinite(reportedTotal) && reportedTotal >= 0) {
      totalLogCount = reportedTotal
    }
    scannedLogCount += items.length
    for (const item of items) {
      if (Number.isInteger(input.keyIndex)) {
        let other = null
        try {
          other = JSON.parse(item?.other || "{}")
        } catch {
          // A malformed historical log cannot be attributed to one multi-key.
        }
        if (Number(other?.admin_info?.multi_key_index) !== input.keyIndex) {
          continue
        }
      }
      quota += Number(item?.quota) || 0
      promptTokens += Number(item?.prompt_tokens) || 0
      completionTokens += Number(item?.completion_tokens) || 0
      requestCount += 1
      const createdAt = Number(item?.created_at)
      if (
        Number.isFinite(createdAt) &&
        (!lastUsedAt || createdAt > lastUsedAt)
      ) {
        lastUsedAt = createdAt
      }
    }
    if (
      items.length < pageSize ||
      (totalLogCount != null && scannedLogCount >= totalLogCount)
    ) {
      break
    }
    if (page === MAX_USAGE_PAGES) truncated = true
  }

  return {
    quota,
    requestCount,
    promptTokens,
    completionTokens,
    lastUsedAt,
    scannedLogCount,
    totalLogCount,
    truncated,
    usageDetailsComplete: !truncated,
    usageMethod: "log-scan",
  }
}

async function fetchIndependentChannelUsage(config, input) {
  const params = usageQueryParams(input)
  // New API's admin stat endpoint performs the quota sum in the database. It
  // is exact for a one-key channel and avoids hundreds of paginated requests.
  // https://github.com/QuantumNous/new-api/blob/main/controller/log.go
  // https://github.com/QuantumNous/new-api/blob/main/model/log.go
  const statPayload = await requestUsageJson(
    `${config.targetUrl}/api/log/stat?${params}`,
    config,
  )
  const quota = Number(statPayload?.data?.quota)
  if (!Number.isFinite(quota)) {
    throw new Error("New API 没有返回可用的渠道消费统计")
  }

  let requestCount = null
  let promptTokens = null
  let completionTokens = null
  let lastUsedAt = null
  let scannedLogCount = 0
  let totalLogCount = null
  let usageDetailsComplete = false
  try {
    params.set("p", "1")
    params.set("page_size", "100")
    const detailPayload = await requestUsageJson(
      `${config.targetUrl}/api/log/?${params}`,
      config,
    )
    const items = Array.isArray(detailPayload?.data?.items)
      ? detailPayload.data.items
      : []
    const reportedTotal = Number(detailPayload?.data?.total)
    totalLogCount = Number.isFinite(reportedTotal)
      ? reportedTotal
      : items.length
    requestCount = totalLogCount
    scannedLogCount = items.length
    for (const item of items) {
      const createdAt = Number(item?.created_at)
      if (
        Number.isFinite(createdAt) &&
        (!lastUsedAt || createdAt > lastUsedAt)
      ) {
        lastUsedAt = createdAt
      }
    }
    if (totalLogCount <= items.length) {
      promptTokens = items.reduce(
        (total, item) => total + (Number(item?.prompt_tokens) || 0),
        0,
      )
      completionTokens = items.reduce(
        (total, item) => total + (Number(item?.completion_tokens) || 0),
        0,
      )
      usageDetailsComplete = true
    }
  } catch (error) {
    if (error?.status !== 429) throw error
    // The exact cost is already available from /api/log/stat. Keep it instead
    // of failing the whole refresh when optional log details are rate limited.
  }

  return {
    quota,
    requestCount,
    promptTokens,
    completionTokens,
    lastUsedAt,
    scannedLogCount,
    totalLogCount,
    truncated: false,
    usageDetailsComplete,
    usageMethod: "database-stat",
  }
}

export async function fetchChannelUsage(config, input) {
  let usage
  if (Number.isInteger(input.keyIndex)) {
    usage = await scanChannelUsageLogs(config, input)
  } else {
    try {
      usage = await fetchIndependentChannelUsage(config, input)
    } catch (error) {
      if (![404, 405].includes(error?.status)) throw error
      // Compatibility fallback for older New API forks without /api/log/stat.
      usage = await scanChannelUsageLogs(config, input)
    }
  }

  const statusPayload = await requestUsageJson(
    `${config.targetUrl}/api/status`,
    config,
  )
  const quotaPerUnit = Number(statusPayload?.data?.quota_per_unit) || 500_000
  return {
    spentUsd: Number((usage.quota / quotaPerUnit).toFixed(8)),
    requestCount: usage.requestCount,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    lastUsedAt: usage.lastUsedAt,
    quotaPerUnit,
    scannedLogCount: usage.scannedLogCount,
    totalLogCount: usage.totalLogCount,
    truncated: usage.truncated,
    usageDetailsComplete: usage.usageDetailsComplete,
    usageMethod: usage.usageMethod,
  }
}

export async function loginNewApi({ targetUrl, username, password }) {
  // New API password login establishes a server-side session and returns the
  // user id used by the required New-Api-User header.
  // https://github.com/QuantumNous/new-api/blob/main/controller/user.go
  let response
  try {
    response = await fetch(`${targetUrl}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error("无法连接 New API，请检查地址和网络")
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // Never expose upstream response bodies on a credential flow.
  }
  if (payload?.data?.require_2fa === true) {
    throw new Error("该账号启用了两步验证，请改用下方的访问令牌连接")
  }
  const userId = Number(payload?.data?.id)
  const sessionCookie = getResponseCookies(response)
  if (
    !response.ok ||
    payload?.success !== true ||
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !sessionCookie
  ) {
    throw new Error(
      "登录失败，请检查用户名和密码；启用验证码的站点请使用访问令牌",
    )
  }

  return {
    userId: String(userId),
    username: String(payload.data.username || username),
    role: Number(payload.data.role || 0),
    sessionCookie,
  }
}

export async function fetchChannelModels(config, input) {
  // New API performs provider-specific model discovery for every built-in type.
  // Contract: https://github.com/QuantumNous/new-api-docs/blob/main/docs/api/fei-channel-management.md#拉取全部渠道模型
  const payload = await requestJson(
    `${config.targetUrl}/api/channel/fetch_models`,
    {
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify({
        base_url: input.baseUrl,
        type: input.provider.channelType,
        key: input.apiKey,
      }),
    },
    [config.adminToken, config.sessionCookie, input.apiKey].filter(Boolean),
  )
  const rawModels = Array.isArray(payload?.data) ? payload.data : []
  return [...new Set(rawModels)]
    .filter((model) => typeof model === "string")
    .map((model) => model.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 2000)
}

export async function listChannelTemplates(config, provider) {
  const templates = []
  for (let page = 1; page <= MAX_CHANNEL_PAGES; page += 1) {
    const payload = await requestJson(
      `${config.targetUrl}/api/channel/?p=${page}&page_size=${PAGE_SIZE}`,
      { headers: requestHeaders(config) },
      [config.adminToken, config.sessionCookie].filter(Boolean),
    )
    const items = channelListItems(payload)
    templates.push(
      ...items
        .filter((item) => Number(item?.type) === provider.channelType)
        .map(channelTemplateSummary),
    )
    if (items.length < PAGE_SIZE) break
  }
  return templates
    .filter((item) => Number.isInteger(item.id) && item.id > 0)
    .sort((left, right) => right.id - left.id)
    .slice(0, 500)
}

export async function fetchChannelTemplate(config, channelId, provider) {
  const id = Number(channelId)
  if (!Number.isInteger(id) || id <= 0) throw new Error("请选择已有渠道")
  const payload = await requestJson(
    `${config.targetUrl}/api/channel/${id}`,
    { headers: requestHeaders(config) },
    [config.adminToken, config.sessionCookie].filter(Boolean),
  )
  const channel = payload?.data
  if (!channel || Number(channel.type) !== provider.channelType) {
    throw new Error("所选渠道类型与当前 Key 来源不一致")
  }
  const modelMapping = parseJsonObject(channel.model_mapping)
  return {
    ...channelTemplateSummary(channel),
    models: splitChannelValues(channel.models),
    modelMappings: Object.entries(modelMapping).map(
      ([standardModel, actualModel]) => ({
        standardModel,
        actualModel: String(actualModel || ""),
      }),
    ),
    channelOther: String(channel.other || ""),
    channelSettings: parseJsonObject(channel.settings),
    advanced: {
      openai_organization: channel.openai_organization ?? "",
      test_model: channel.test_model ?? "",
      status_code_mapping: channel.status_code_mapping ?? "",
      priority: Number(channel.priority) || 0,
      weight: Number(channel.weight) || 0,
      auto_ban: Number(channel.auto_ban ?? 1),
      tag: channel.tag ?? "",
      setting: channel.setting ?? "",
      param_override: channel.param_override ?? "",
      header_override: channel.header_override ?? "",
      remark: channel.remark ?? "",
    },
  }
}

export async function findSimilarChannels(config, provider) {
  const matches = []
  for (let page = 1; page <= MAX_CHANNEL_PAGES; page += 1) {
    const payload = await requestJson(
      `${config.targetUrl}/api/channel/?p=${page}&page_size=${PAGE_SIZE}`,
      { headers: requestHeaders(config) },
      [config.adminToken, config.sessionCookie].filter(Boolean),
    )
    const items = channelListItems(payload)
    for (const item of items) {
      const sameType = Number(item?.type) === provider.channelType
      const providerBaseUrl = String(
        provider.resolvedBaseUrl || provider.baseUrl || "",
      ).replace(/\/+$/, "")
      const sameBaseUrl = Boolean(
        providerBaseUrl &&
          String(item?.base_url || "").replace(/\/+$/, "") === providerBaseUrl,
      )
      if (sameType || sameBaseUrl) {
        matches.push({
          id: item.id,
          name: String(item.name || `渠道 #${item.id}`),
          status: Number(item.status) === 1 ? "正常" : "已停用",
          isMultiKey: item?.channel_info?.is_multi_key === true,
          multiKeySize: Number(item?.channel_info?.multi_key_size) || 0,
        })
      }
    }
    if (items.length < PAGE_SIZE) break
  }
  return matches.slice(0, 20)
}

export async function updateExistingChannelKey(config, input) {
  // New API only applies key_mode=append to a channel already configured for
  // multiple keys; otherwise its PUT contract replaces the single saved key.
  // https://github.com/QuantumNous/new-api/blob/main/controller/channel.go
  return await requestJson(
    `${config.targetUrl}/api/channel/`,
    {
      method: "PUT",
      headers: requestHeaders(config),
      body: JSON.stringify({
        id: input.channelId,
        key: input.apiKey,
        ...(input.append ? { key_mode: "append" } : {}),
      }),
    },
    [config.adminToken, config.sessionCookie, input.apiKey].filter(Boolean),
  )
}

export async function setChannelEnabled(config, channelId) {
  return await requestJson(
    `${config.targetUrl}/api/channel/${channelId}/status`,
    {
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify({ status: 1 }),
    },
    [config.adminToken, config.sessionCookie].filter(Boolean),
  )
}

const buildChannelPayload = (input, key) => ({
  ...(input.templateConfig || {}),
  name: input.name,
  type: input.provider.channelType,
  key,
  base_url: input.baseUrl,
  models: input.models.join(","),
  model_mapping: JSON.stringify(input.modelMapping || {}),
  settings: JSON.stringify(input.channelSettings || {}),
  other: input.channelOther || "",
  group: input.groups.join(","),
  groups: input.groups,
  priority: input.templateConfig?.priority ?? 0,
  weight: input.templateConfig?.weight ?? 0,
  status: 1,
})

export async function createNewApiChannel(config, input) {
  // New API channel contract follows QuantumNous/new-api's POST /api/channel/.
  const payload = {
    mode: "single",
    channel: buildChannelPayload(input, input.apiKey),
  }

  return await requestJson(
    `${config.targetUrl}/api/channel/`,
    {
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify(payload),
    },
    [config.adminToken, config.sessionCookie, input.apiKey].filter(Boolean),
  )
}

export async function createNewApiMultiKeyChannel(config, input) {
  // New API's multi_to_single mode stores all submitted keys in one channel
  // and records the selected key index in consumption logs.
  // https://github.com/QuantumNous/new-api/blob/main/controller/channel.go
  let key = input.apiKeys.join("\n")
  if (
    input.provider.channelType === 41 &&
    input.channelSettings?.vertex_key_type !== "api_key"
  ) {
    try {
      key = JSON.stringify(input.apiKeys.map((value) => JSON.parse(value)))
    } catch {
      throw new Error("Vertex AI 批量服务账号必须是有效 JSON")
    }
  }
  return await requestJson(
    `${config.targetUrl}/api/channel/`,
    {
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify({
        mode: "multi_to_single",
        multi_key_mode: "random",
        channel: buildChannelPayload(input, key),
      }),
    },
    [config.adminToken, config.sessionCookie, ...input.apiKeys].filter(Boolean),
  )
}

export async function findCreatedChannel(config, input) {
  const payload = await requestJson(
    `${config.targetUrl}/api/channel/search?keyword=${encodeURIComponent(input.name)}`,
    { headers: requestHeaders(config) },
    [config.adminToken, config.sessionCookie].filter(Boolean),
  )
  const expectedBaseUrl = String(input.baseUrl || "").replace(/\/+$/, "")
  const matches = channelListItems(payload).filter((channel) => {
    const sameName = String(channel?.name || "") === input.name
    const sameType = Number(channel?.type) === input.provider.channelType
    const sameBaseUrl =
      String(channel?.base_url || "").replace(/\/+$/, "") === expectedBaseUrl
    return sameName && sameType && sameBaseUrl
  })
  return (
    matches.sort((left, right) => Number(right.id) - Number(left.id))[0] ?? null
  )
}

export async function refreshChannelBalance(config, channelId) {
  // New API converts provider-specific balance responses to a USD channel
  // balance. Unsupported providers return a normal API failure instead.
  // https://github.com/QuantumNous/new-api/blob/main/model/channel.go
  // https://github.com/QuantumNous/new-api-docs-v1/blob/main/content/docs/ja/api/management/channel-management/channel-update_balance-get.mdx
  let response
  try {
    response = await fetch(
      `${config.targetUrl}/api/channel/update_balance/${channelId}`,
      {
        headers: requestHeaders(config),
        signal: AbortSignal.timeout(15_000),
      },
    )
  } catch {
    return {
      status: "unavailable",
      reason: "余额查询暂时无法连接，请稍后重试",
    }
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // Keep provider response bodies out of UI and logs.
  }

  const balance = Number(payload?.balance ?? payload?.data?.balance)
  if (!response.ok || payload?.success === false || !Number.isFinite(balance)) {
    return {
      status: "unsupported",
      reason: "该渠道或上游暂不支持自动查询余额",
    }
  }

  return {
    status: "available",
    currency: "USD",
    balance,
  }
}
