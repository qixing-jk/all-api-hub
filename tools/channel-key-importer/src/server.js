import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { AccessSessionManager } from "./accessAuth.js"
import { BalanceStore } from "./balanceStore.js"
import {
  applyQuotaLines,
  applyUniformQuota,
  buildResourceChannelName,
  parseBatchKeys,
} from "./batchKeys.js"
import {
  appendAwsRegionToChannelName,
  buildAwsGlobalMappings,
  buildAwsInferenceProfileMappings,
  getAwsEntryChannelSettings,
  getAwsRuntimeBaseUrl,
  inferAwsCredentialMode,
  normalizeAwsBatchCredentialInput,
  resolveChannelInput,
  summarizeAwsCredentials,
  validateBatchCredentialEntries,
} from "./channelConfig.js"
import {
  ConfigStore,
  findProfileForRecord,
  getCredentialAccount,
} from "./configStore.js"
import { CustomProviderStore } from "./customProviderStore.js"
import { ImportStore, keyIdentity } from "./importStore.js"
import { buildModelPlan, buildProviderPrefixMappings } from "./modelPlan.js"
import {
  createNewApiChannel,
  createNewApiMultiKeyChannel,
  discoverNewApiUserId,
  fetchChannelModels,
  fetchChannelTemplate,
  fetchChannelUsage,
  fetchNewApiDefaultModels,
  fetchNewApiGroups,
  fetchNewApiSystemName,
  findCreatedChannel,
  findCreatedChannels,
  findSimilarChannels,
  isRateLimitError,
  listChannelTemplates,
  loginNewApi,
  refreshChannelBalance,
  setChannelEnabled,
  updateExistingChannelKey,
  verifyNewApi,
} from "./newApiClient.js"
import { PreviewStore } from "./previewStore.js"
import { getProviderIconSvg } from "./providerIcons.js"
import {
  createCustomOpenAIProvider,
  CUSTOM_OPENAI_PROVIDER_PREFIX,
  getProvider,
  listPublicProviders,
  resolveProviderBaseUrl,
} from "./providers.js"
import { ScheduleStore } from "./scheduleStore.js"
import {
  isAllowedApiRequestOrigin,
  isAllowedHostHeader,
  maskTargetUrl,
  normalizeTargetUrl,
  validateUserId,
} from "./security.js"
import {
  createSharedTokenStore,
  sqliteStorageEnabled,
} from "./sharedStorage.js"

const HOST = process.env.DATAEYESAI_HOST || "127.0.0.1"
const DEFAULT_PORT = Number(process.env.CHANNEL_IMPORTER_PORT || 4179)
const MODULE_PATH = fileURLToPath(import.meta.url)
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url))
const SESSION_TOKEN = randomBytes(32).toString("base64url")
const MAX_BODY_BYTES = 64 * 1024
const IDLE_SCHEDULE_CHECK_MS = 60_000
const MAX_TIMER_DELAY_MS = 2_147_483_647
const MIN_CHANNEL_PRIORITY = -2_147_483_648
const MAX_CHANNEL_ROUTING_VALUE = 2_147_483_647
const configuredRateLimitFallback = Number(
  process.env.DATAEYESAI_RATE_LIMIT_FALLBACK_SECONDS || 180,
)
const RATE_LIMIT_RECOVERY_DELAY_MS =
  (Number.isFinite(configuredRateLimitFallback)
    ? Math.max(10, configuredRateLimitFallback)
    : 180) * 1000
const RATE_LIMIT_RECOVERY_BATCH_SIZE = 1
// New API's default global limiter is shared by all management calls from the
// same IP. A verified first mutation is followed by one Key per minute so the
// importer does not exhaust that quota before the next scheduled write.
// https://github.com/QuantumNous/new-api-docs-v1/blob/main/content/docs/zh/installation/config-maintenance/environment-variables.mdx
const SAFE_BULK_CONTINUATION_DELAY_MS = 65_000

const configStore = new ConfigStore()
const customProviderStore = new CustomProviderStore()
const balanceStore = new BalanceStore()
const importStore = new ImportStore()
const previewStore = new PreviewStore()
const scheduleStore = new ScheduleStore()
let channelOperationQueue = Promise.resolve()

const runChannelOperation = async (operation) => {
  const result = channelOperationQueue.then(operation, operation)
  channelOperationQueue = result.catch(() => {})
  return await result
}

const listAvailableProviders = async () => [
  ...(await customProviderStore.list()).map(createCustomOpenAIProvider),
  ...listPublicProviders(),
]

async function resolveRequestedProvider(providerId) {
  const id = String(providerId || "")
  if (!id.startsWith(CUSTOM_OPENAI_PROVIDER_PREFIX)) return getProvider(id)
  const preset = await customProviderStore.get(
    id.slice(CUSTOM_OPENAI_PROVIDER_PREFIX.length),
  )
  if (!preset) throw new Error("自定义供应商已不存在，请重新选择")
  return createCustomOpenAIProvider(preset)
}

const sendJson = (response, status, payload, headers = {}) => {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""))
  const rightBuffer = Buffer.from(String(right || ""))
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error("请求内容过大")
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
  } catch {
    throw new Error("请求格式不正确")
  }
}

const getRuntimeConfig = async (profileId = "") => {
  const config = await configStore.readConfig(profileId)
  const targetUrl = normalizeTargetUrl(config.targetUrl, {
    allowInsecureHttp: config.allowInsecureHttp,
  })
  const userId = validateUserId(config.userId)
  const session = await configStore.readSession(
    targetUrl,
    userId,
    config.rememberSession,
  )
  if (session?.sessionCookie) {
    return { ...config, targetUrl, userId, ...session }
  }
  const account = getCredentialAccount(targetUrl, userId)
  const adminToken = await configStore.readToken(account, config.rememberToken)
  if (!adminToken) throw new Error("请先登录 New API")
  return { ...config, targetUrl, userId, adminToken }
}

const getRuntimeConfigForRecord = async (record) => {
  const profile = findProfileForRecord(record, await configStore.listProfiles())
  if (!profile) throw new Error("找不到该记录对应的 New API 站点")
  return await getRuntimeConfig(profile.profileId)
}

const getPublicConfig = async (config) => {
  if (!config?.targetUrl || !config?.userId) {
    return {
      ...config,
      hasToken: false,
      hasSession: false,
      username: "",
    }
  }
  const session = await configStore.readSession(
    config.targetUrl,
    config.userId,
    config.rememberSession,
  )
  const token = await configStore.readToken(
    getCredentialAccount(config.targetUrl, config.userId),
    config.rememberToken,
  )
  return {
    ...config,
    hasToken: Boolean(token),
    hasSession: Boolean(session?.sessionCookie),
    username: session?.username || "",
  }
}

const channelFailureResult = (error, entry, keyIndex) => ({
  success: false,
  keyIndex,
  ...(entry?.id ? { entryId: entry.id } : {}),
  error: error instanceof Error ? error.message : "写入失败",
  retryable: isRateLimitError(error),
  ...(Number.isFinite(error?.retryAfterMs)
    ? { retryAfterMs: Math.max(0, error.retryAfterMs) }
    : {}),
})

const deferredRateLimitResult = (entry, keyIndex, limited) => ({
  success: false,
  keyIndex,
  ...(entry?.id ? { entryId: entry.id } : {}),
  error: "New API 限流，已停止继续请求并转入自动续传",
  retryable: true,
  deferred: true,
  ...(Number.isFinite(limited?.retryAfterMs)
    ? { retryAfterMs: limited.retryAfterMs }
    : {}),
})

const enrichBalance = async (runtimeConfig, channelId) => {
  let balance = await refreshChannelBalance(runtimeConfig, channelId)
  if (balance.status === "available") {
    balance = {
      ...balance,
      ...(await balanceStore.record(
        {
          targetUrl: runtimeConfig.targetUrl,
          userId: runtimeConfig.userId,
          channelId,
        },
        balance.balance,
      )),
    }
  }
  return balance
}

const resolveProfileName = async (body, targetUrl, existingConfig) => {
  const requestedName = String(body.profileName || "")
    .trim()
    .slice(0, 80)
  if (body.profileNameEdited === true && requestedName) {
    return { name: requestedName, nameSource: "custom" }
  }
  try {
    const detectedName = await fetchNewApiSystemName(targetUrl)
    if (detectedName) return { name: detectedName, nameSource: "detected" }
  } catch {
    // Status-name discovery is optional; connection verification remains valid.
  }
  return {
    name: existingConfig?.name || requestedName || new URL(targetUrl).host,
    nameSource: existingConfig?.nameSource || "host",
  }
}

const buildPreviewModelPlan = (preview, body) => {
  const automaticMappings =
    preview.provider.channelConfig?.autoMapProviderPrefix === true
      ? buildProviderPrefixMappings([
          ...preview.models,
          ...(Array.isArray(body.manualModels) ? body.manualModels : []),
        ])
      : []
  const requiredMappings = [
    ...automaticMappings,
    ...(Array.isArray(preview.providerMappings)
      ? preview.providerMappings
      : []),
  ]
  const submittedMappings = Array.isArray(body.mappings) ? body.mappings : []
  const submittedAliases = new Set(
    submittedMappings.map((mapping) => mapping?.standardModel),
  )
  return buildModelPlan({
    fetchedModels: [
      ...preview.models,
      ...(preview.providerMappings || []).map((mapping) => mapping.actualModel),
    ],
    manualModels: body.manualModels,
    mappings: [
      ...requiredMappings.filter(
        (mapping) => !submittedAliases.has(mapping.standardModel),
      ),
      ...submittedMappings,
    ],
    hideMappedActualModels:
      preview.provider.channelConfig?.autoMapProviderPrefix === true ||
      (preview.providerMappings || []).length > 0,
    allowMappedStandardModels: Number.isInteger(preview.templateChannelId),
  })
}

const buildEntryModelPlan = (preview, modelPlan, entry) => {
  if (!preview.awsEntryRouting) return modelPlan
  const region = entry.apiKey.split("|").at(-1)?.trim()
  const modelMapping = { ...modelPlan.modelMapping }
  for (const mapping of buildAwsInferenceProfileMappings(
    preview.models,
    region,
  )) {
    if (!modelMapping[mapping.standardModel]) {
      modelMapping[mapping.standardModel] = mapping.actualModel
    }
  }
  return { ...modelPlan, modelMapping }
}

const buildEntryChannelSettings = (preview, entry) =>
  preview.provider.id === "aws" && preview.awsAutoCredentialMode
    ? getAwsEntryChannelSettings(entry.apiKey, preview.channelSettings)
    : preview.channelSettings

const buildEntryBaseUrl = (preview, entry) =>
  preview.provider.id === "aws" &&
  buildEntryChannelSettings(preview, entry)?.aws_key_type === "api_key"
    ? getAwsRuntimeBaseUrl(entry.apiKey)
    : preview.baseUrl

export function normalizeChannelRoutingValue(
  value,
  label,
  minimum = MIN_CHANNEL_PRIORITY,
) {
  if (value == null || String(value).trim() === "") return null
  const number = Number(value)
  if (
    !Number.isInteger(number) ||
    number < minimum ||
    number > MAX_CHANNEL_ROUTING_VALUE
  ) {
    throw new Error(
      `${label}必须是 ${minimum} 到 ${MAX_CHANNEL_ROUTING_VALUE} 之间的整数`,
    )
  }
  return number
}

export function normalizePrioritySequence(input, priority, keyCount) {
  const enabled = input?.enabled === true
  const step = enabled
    ? normalizeChannelRoutingValue(input.step, "优先级递减步长", 1)
    : 1
  if (enabled) {
    const lastPriority = priority - step * Math.max(0, keyCount - 1)
    if (lastPriority < MIN_CHANNEL_PRIORITY) {
      throw new Error("批量递减后的优先级超出 New API 支持范围")
    }
  }
  return { enabled, step }
}

export function resolveEntryPriority(preview, entry, localIndex) {
  if (!preview.prioritySequence?.enabled) return preview.priority
  const sequenceIndex = Number.isInteger(entry.priorityIndex)
    ? entry.priorityIndex
    : localIndex
  return preview.priority - preview.prioritySequence.step * sequenceIndex
}

export function deduplicateCredentialEntries(
  entries,
  existingFingerprints = new Set(),
  queuedFingerprints = new Set(),
) {
  const seen = new Set()
  const keys = []
  const summary = {
    inputCount: entries.length,
    inputDuplicateCount: 0,
    existingDuplicateCount: 0,
    queuedDuplicateCount: 0,
    acceptedCount: 0,
    skippedCount: 0,
  }
  for (const entry of entries) {
    if (!entry.apiKey) {
      keys.push(entry)
      continue
    }
    const fingerprint = keyIdentity(entry.apiKey).keyFingerprint
    if (seen.has(fingerprint)) {
      summary.inputDuplicateCount += 1
      continue
    }
    seen.add(fingerprint)
    if (existingFingerprints.has(fingerprint)) {
      summary.existingDuplicateCount += 1
      continue
    }
    if (queuedFingerprints.has(fingerprint)) {
      summary.queuedDuplicateCount += 1
      continue
    }
    keys.push(entry)
  }
  summary.acceptedCount = keys.length
  summary.skippedCount = summary.inputCount - summary.acceptedCount
  return { keys, summary }
}

async function buildCredentialPreview(body) {
  const provider = await resolveRequestedProvider(body.providerId)
  if (!provider.importable) throw new Error(provider.description)
  const configSource = String(body.configSource || "")
  if (!["template", "fetch", "new-api", "manual"].includes(configSource)) {
    throw new Error("请选择复制已有渠道、自动获取模型或手动填写")
  }
  if (
    configSource === "fetch" &&
    provider.channelConfig.supportsModelFetch !== true
  ) {
    throw new Error(
      "该渠道不能从供应商自动获取模型，请复制已有渠道、从 New API 获取或手动填写模型",
    )
  }
  const runtimeConfig = await getRuntimeConfig()
  const template =
    configSource === "template"
      ? await fetchChannelTemplate(
          runtimeConfig,
          body.templateChannelId,
          provider,
        )
      : null
  const normalizedApiKey =
    provider.id === "aws"
      ? normalizeAwsBatchCredentialInput(body.apiKey)
      : String(body.apiKey || "")
  const useRawCredentials = Boolean(
    provider.channelConfig.credentialModes?.length && normalizedApiKey.trim(),
  )
  const channelInput = resolveChannelInput(provider, {
    ...body,
    apiKey: normalizedApiKey,
    configSource,
    useRawCredentials,
  })
  let keys
  if (useRawCredentials) {
    keys = parseBatchKeys(normalizedApiKey, "", {
      allowInlineQuota: true,
      deduplicate: false,
    })
  } else if (provider.channelConfig.credentialModes?.length) {
    keys = parseBatchKeys(channelInput.apiKey, "", {
      allowInlineQuota: true,
      deduplicate: false,
    })
  } else if (provider.keyOptional && !channelInput.apiKey) {
    keys = [{ apiKey: "", quota: null }]
  } else {
    keys = parseBatchKeys(channelInput.apiKey, "", {
      allowInlineQuota: true,
      deduplicate: false,
    })
  }
  if (body.quotaMode === "uniform") {
    keys = applyUniformQuota(keys, body.uniformQuota)
  } else if (String(body.quotaLines || "").trim()) {
    keys = applyQuotaLines(keys, body.quotaLines)
  }
  const awsAutoCredentialMode = provider.id === "aws" && useRawCredentials
  const credentialMode = awsAutoCredentialMode
    ? "auto"
    : template?.channelSettings?.aws_key_type ||
      template?.channelSettings?.vertex_key_type ||
      String(body.credentialMode || "")
  validateBatchCredentialEntries(provider, credentialMode, keys)
  const candidateApiKeys = keys.map((entry) => entry.apiKey).filter(Boolean)
  const existingFingerprints = await importStore.findExistingFingerprints({
    profileId: runtimeConfig.profileId,
    targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
    apiKeys: candidateApiKeys,
  })
  const queuedFingerprints = await scheduleStore.findQueuedFingerprints({
    profileId: runtimeConfig.profileId,
    apiKeys: candidateApiKeys,
  })
  const deduplication = deduplicateCredentialEntries(
    keys,
    existingFingerprints,
    queuedFingerprints,
  )
  keys = deduplication.keys
  if (keys.length === 0) {
    throw new Error(
      `识别到 ${deduplication.summary.inputCount} 条 Key，但均为本批重复、已录入或已在定时队列中，无需再次添加`,
    )
  }
  if (!provider.keyOptional && keys.some(({ apiKey }) => apiKey.length < 8)) {
    throw new Error("存在不完整的 API Key 或组合凭证")
  }
  const baseUrl = template
    ? template.baseUrl
    : resolveProviderBaseUrl(provider, body.baseUrl)
  const requestedName = String(body.name || "")
    .trim()
    .slice(0, 80)
  if (!requestedName) throw new Error("请输入渠道名称")
  const automaticName = body.automaticName === true
  const name = automaticName
    ? buildResourceChannelName(provider.name, keys)
    : requestedName
  const availableGroups = await fetchNewApiGroups(runtimeConfig)
  const requestedGroups = Array.isArray(body.groups)
    ? body.groups.map((group) => String(group).trim()).filter(Boolean)
    : []
  const groups = [...new Set(requestedGroups)]
  if (groups.length === 0) throw new Error("请至少选择一个渠道分组")
  const invalidGroup = groups.find((group) => !availableGroups.includes(group))
  if (invalidGroup) throw new Error(`渠道分组已不存在：${invalidGroup}`)
  if (groups.join(",").length > 64) {
    throw new Error("所选渠道分组名称总长度不能超过 64 个字符")
  }
  const priorityOverride = normalizeChannelRoutingValue(
    body.priority,
    "渠道优先级",
  )
  const weightOverride = normalizeChannelRoutingValue(
    body.weight,
    "渠道权重",
    0,
  )
  const resolvedPriority = priorityOverride ?? template?.advanced?.priority ?? 0
  const prioritySequence = normalizePrioritySequence(
    body.prioritySequence,
    resolvedPriority,
    keys.length,
  )
  const resolvedProvider = { ...provider, resolvedBaseUrl: baseUrl }
  const defaultModels =
    configSource === "new-api"
      ? await fetchNewApiDefaultModels(runtimeConfig, provider.channelType)
      : configSource === "fetch"
        ? await fetchChannelModels(runtimeConfig, {
            provider,
            baseUrl,
            apiKey: keys[0]?.apiKey || "",
          })
        : []
  const duplicates = await findSimilarChannels(runtimeConfig, resolvedProvider)
  const models = template
    ? template.models
    : configSource === "new-api" || configSource === "fetch"
      ? defaultModels
      : channelInput.models
  if (models.length === 0) {
    throw new Error(
      template
        ? "所选已有渠道没有配置模型，请换一个渠道"
        : configSource === "new-api" || configSource === "fetch"
          ? "没有获取到模型，请改为复制已有渠道或手动填写"
          : "请填写至少一个模型",
    )
  }
  const globalInference =
    provider.id === "aws" && body.providerFlags?.globalInference === true
  let providerMappings = template
    ? template.modelMappings
    : channelInput.providerMappings
  if (globalInference) {
    providerMappings = buildAwsGlobalMappings(models, providerMappings)
  }
  const awsRouting =
    provider.id === "aws"
      ? summarizeAwsCredentials(keys, globalInference)
      : null
  return {
    provider,
    keys,
    baseUrl,
    name,
    groups,
    priority: resolvedPriority,
    weight: weightOverride ?? template?.advanced?.weight ?? 0,
    prioritySequence,
    routingOverrides: {
      priority: priorityOverride,
      weight: weightOverride,
    },
    models,
    duplicates,
    profileId: runtimeConfig.profileId,
    targetName: runtimeConfig.name,
    targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
    channelOther: template?.channelOther ?? channelInput.channelOther,
    channelSettings: template?.channelSettings ?? channelInput.channelSettings,
    providerMappings,
    awsAutoCredentialMode,
    awsEntryRouting:
      provider.id === "aws" && useRawCredentials
        ? true
        : template
          ? false
          : channelInput.awsEntryRouting,
    templateConfig: template?.advanced || null,
    templateChannelId: template?.id || null,
    templateChannelName: template?.name || "",
    automaticName,
    awsRouting,
    deduplication: deduplication.summary,
    modelSource:
      configSource === "template" ? `template:${template.name}` : configSource,
  }
}

const buildPreviewResponse = (preview, previewId) => ({
  previewId,
  provider: {
    name: preview.provider.name,
    channelType: preview.provider.channelType,
    baseUrl: preview.baseUrl,
  },
  name: preview.name,
  groups: preview.groups,
  priority: preview.priority,
  weight: preview.weight,
  prioritySequence: preview.prioritySequence,
  models: preview.models,
  duplicates: preview.duplicates,
  keyCount: preview.keys.length,
  quotaTotal: preview.keys.every(({ quota }) => Number.isFinite(quota))
    ? preview.keys.reduce((total, { quota }) => total + quota, 0)
    : null,
  knownQuotaTotal: preview.keys.reduce(
    (total, { quota }) => total + (Number.isFinite(quota) ? quota : 0),
    0,
  ),
  modelSource: preview.modelSource,
  templateChannelId: preview.templateChannelId,
  templateChannelName: preview.templateChannelName,
  providerMappings: preview.providerMappings,
  awsRouting: preview.awsRouting,
  deduplication: preview.deduplication || {
    inputCount: preview.keys.length,
    inputDuplicateCount: 0,
    existingDuplicateCount: 0,
    queuedDuplicateCount: 0,
    acceptedCount: preview.keys.length,
    skippedCount: 0,
  },
  unknownQuotaCount: preview.keys.filter(({ quota }) => !Number.isFinite(quota))
    .length,
  expiresInSeconds: 300,
})

async function createChannelsFromPreview(preview, body) {
  const originalKeyCount = preview.keys.length
  const existingFingerprints = await importStore.findExistingFingerprints({
    profileId: preview.profileId,
    targetUrl: preview.targetUrl,
    apiKeys: preview.keys.map((entry) => entry.apiKey).filter(Boolean),
  })
  if (existingFingerprints.size > 0) {
    preview = {
      ...preview,
      keys: preview.keys.filter(
        (entry) =>
          !entry.apiKey ||
          !existingFingerprints.has(keyIdentity(entry.apiKey).keyFingerprint),
      ),
    }
  }
  const lateDuplicateCount = originalKeyCount - preview.keys.length
  if (preview.keys.length === 0) {
    return {
      success: true,
      operation: "skipped",
      keyCount: originalKeyCount,
      successCount: 0,
      failedCount: 0,
      skippedCount: lateDuplicateCount,
      modelCount: preview.models.length,
      mappingCount: body.mappings?.length || 0,
      balance: { status: "unavailable" },
      results: [],
      records: [],
    }
  }
  const importBatchId = randomUUID()
  const isTemplateClone = Number.isInteger(preview.templateChannelId)
  if (
    !isTemplateClone &&
    (preview.duplicates || []).length > 0 &&
    body.confirmDuplicates !== true
  ) {
    throw new Error("发现同来源渠道，请确认后再添加")
  }
  const existingChannelId = isTemplateClone
    ? 0
    : Number(body.existingChannelId || 0)
  const existingChannel = existingChannelId
    ? (preview.duplicates || []).find(
        (channel) => Number(channel.id) === existingChannelId,
      )
    : null
  if (existingChannelId && !existingChannel) {
    throw new Error("所选同类渠道不在本次预览中，请重新预览")
  }
  const runtimeConfig = await getRuntimeConfig(preview.profileId)
  if (
    preview.prioritySequence?.enabled &&
    preview.keys.length > 1 &&
    (existingChannel || body.combineKeys === true)
  ) {
    throw new Error("优先级依次递减只适用于每条 Key 新建独立渠道")
  }
  if (existingChannel) {
    if (preview.keys.length > 1 && !existingChannel.isMultiKey) {
      throw new Error("单 Key 渠道不能批量写入，请选择多 Key 渠道或分别新建")
    }
    const updatedEntries = []
    const updateFailures = []
    let rateLimitedFailure = null
    let nextKeyIndex = existingChannel.multiKeySize || 0
    for (const [index, entry] of preview.keys.entries()) {
      if (rateLimitedFailure) {
        updateFailures.push(
          deferredRateLimitResult(entry, index + 1, rateLimitedFailure),
        )
        continue
      }
      try {
        await updateExistingChannelKey(runtimeConfig, {
          channelId: existingChannel.id,
          apiKey: entry.apiKey,
          append: existingChannel.isMultiKey,
          priority: preview.routingOverrides?.priority,
          weight: preview.routingOverrides?.weight,
        })
        updatedEntries.push({
          ...entry,
          sourceKeyIndex: index + 1,
          keyIndex: existingChannel.isMultiKey ? nextKeyIndex : null,
        })
        if (existingChannel.isMultiKey) nextKeyIndex += 1
      } catch (error) {
        const failure = channelFailureResult(error, entry, index + 1)
        updateFailures.push(failure)
        if (failure.retryable) rateLimitedFailure = failure
      }
    }
    if (updatedEntries.length === 0) {
      if (rateLimitedFailure) {
        return {
          success: false,
          operation: "updated",
          keyAction: existingChannel.isMultiKey ? "appended" : "replaced",
          channelId: existingChannel.id,
          channelName: existingChannel.name,
          balance: { status: "unavailable" },
          keyCount: preview.keys.length,
          successCount: 0,
          failedCount: updateFailures.length,
          skippedCount: lateDuplicateCount,
          channelEnabled: Number(existingChannel.status) === 1,
          failures: updateFailures,
          results: updateFailures,
          records: [],
        }
      }
      throw new Error(updateFailures[0]?.error || "Key 写入失败")
    }
    let channelEnabled = true
    try {
      await setChannelEnabled(runtimeConfig, existingChannel.id)
    } catch {
      channelEnabled = false
    }
    let balance = {
      status: "unavailable",
      reason: "渠道已更新，但暂时无法查询余额",
    }
    try {
      balance = await enrichBalance(runtimeConfig, existingChannel.id)
    } catch {
      // The key update already succeeded; balance lookup is best-effort.
    }
    const records = []
    const results = []
    for (const entry of updatedEntries) {
      const record = await importStore.record({
        importBatchId,
        profileId: runtimeConfig.profileId,
        targetName: runtimeConfig.name,
        targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
        providerName: preview.provider.name,
        apiKey: entry.apiKey,
        quota: entry.quota,
        currentBalance:
          !existingChannel.isMultiKey && balance.status === "available"
            ? balance.currentBalance
            : null,
        sharedChannel: existingChannel.isMultiKey,
        keyIndex: entry.keyIndex,
        batchItemIndex: entry.sourceKeyIndex,
        operation: existingChannel.isMultiKey ? "appended" : "replaced",
        channelId: existingChannel.id,
        channelName: existingChannel.name,
      })
      records.push(record)
      results.push({
        success: true,
        keyIndex: entry.sourceKeyIndex,
        ...(entry.id ? { entryId: entry.id } : {}),
        channelId: existingChannel.id,
        channelName: existingChannel.name,
        record,
      })
    }
    return {
      success: updateFailures.length === 0 && channelEnabled,
      operation: "updated",
      keyAction: existingChannel.isMultiKey ? "appended" : "replaced",
      channelId: existingChannel.id,
      channelName: existingChannel.name,
      balance,
      keyCount: preview.keys.length,
      successCount: updatedEntries.length,
      failedCount: updateFailures.length,
      skippedCount: lateDuplicateCount,
      channelEnabled,
      failures: updateFailures,
      results: [...results, ...updateFailures].sort(
        (left, right) => left.keyIndex - right.keyIndex,
      ),
      records,
    }
  }
  const modelPlan = buildPreviewModelPlan(preview, body)
  if (body.combineKeys === true && preview.keys.length > 1) {
    if (
      preview.provider.id === "vertex-ai" &&
      preview.channelSettings?.vertex_key_type === "api_key"
    ) {
      throw new Error("Vertex API Key 模式不支持合并为多 Key 渠道")
    }
    if (preview.provider.id === "aws" && preview.awsAutoCredentialMode) {
      const credentialModes = new Set(
        preview.keys.map((entry) => inferAwsCredentialMode(entry.apiKey)),
      )
      if (credentialModes.size > 1) {
        throw new Error(
          "AWS API Key 与 AK/SK 不能合并到同一个多 Key 渠道，请使用每条 Key 独立渠道",
        )
      }
      const baseUrls = new Set(
        preview.keys.map((entry) => buildEntryBaseUrl(preview, entry)),
      )
      if (baseUrls.size > 1) {
        throw new Error(
          "不同 AWS 地区不能合并到同一个多 Key 渠道，请使用每条 Key 独立渠道",
        )
      }
    }
    const routedModelPlans = preview.keys.map((entry) =>
      buildEntryModelPlan(preview, modelPlan, entry),
    )
    const mappingVariants = new Set(
      routedModelPlans.map((plan) => JSON.stringify(plan.modelMapping)),
    )
    if (mappingVariants.size > 1) {
      throw new Error(
        "AWS Key 的地区需要不同模型映射，请使用每条 Key 独立渠道或启用 Global",
      )
    }
    const createInput = {
      ...preview,
      apiKeys: preview.keys.map((entry) => entry.apiKey),
      name:
        preview.provider.id === "aws"
          ? appendAwsRegionToChannelName(preview.name, preview.keys[0].apiKey)
          : preview.name,
      baseUrl: buildEntryBaseUrl(preview, preview.keys[0]),
      channelSettings: buildEntryChannelSettings(preview, preview.keys[0]),
      ...routedModelPlans[0],
    }
    await createNewApiMultiKeyChannel(runtimeConfig, createInput)
    let createdChannel = null
    try {
      createdChannel = await findCreatedChannel(runtimeConfig, createInput)
    } catch {
      // The channel is already created; the ledger can still retain the keys.
    }
    const records = []
    const results = []
    for (const [keyIndex, entry] of preview.keys.entries()) {
      const record = await importStore.record({
        importBatchId,
        profileId: runtimeConfig.profileId,
        targetName: runtimeConfig.name,
        targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
        providerName: preview.provider.name,
        apiKey: entry.apiKey,
        quota: entry.quota,
        currentBalance: null,
        sharedChannel: true,
        keyIndex,
        batchItemIndex: keyIndex + 1,
        operation: "created-multi-key",
        channelId: createdChannel?.id,
        channelName: createInput.name,
      })
      records.push(record)
      results.push({
        success: true,
        keyIndex: keyIndex + 1,
        ...(entry.id ? { entryId: entry.id } : {}),
        channelId: createdChannel?.id ?? null,
        channelName: createInput.name,
        record,
      })
    }
    return {
      success: true,
      operation: "created-multi-key",
      channelId: createdChannel?.id ?? null,
      channelName: createInput.name,
      keyCount: preview.keys.length,
      successCount: preview.keys.length,
      failedCount: 0,
      skippedCount: lateDuplicateCount,
      modelCount: modelPlan.models.length,
      mappingCount: Object.keys(modelPlan.modelMapping).length,
      balance: { status: "unavailable" },
      results,
      records,
    }
  }

  const results = []
  const acknowledged = []
  let rateLimitedFailure = null
  for (const [index, entry] of preview.keys.entries()) {
    const originalIndex = Number.isInteger(entry.priorityIndex)
      ? entry.priorityIndex
      : index
    if (rateLimitedFailure) {
      results.push(
        deferredRateLimitResult(entry, originalIndex + 1, rateLimitedFailure),
      )
      continue
    }
    const originalTotal = Number.isInteger(preview.originalKeyCount)
      ? preview.originalKeyCount
      : preview.keys.length
    const entryModelPlan = buildEntryModelPlan(preview, modelPlan, entry)
    const baseName = preview.automaticName
      ? buildResourceChannelName(preview.provider.name, [entry], {
          index: originalIndex,
          total: originalTotal,
        })
      : originalTotal > 1
        ? `${preview.name} · ${originalIndex + 1}`.slice(0, 80)
        : preview.name
    const createInput = {
      ...preview,
      priority: resolveEntryPriority(preview, entry, index),
      apiKey: entry.apiKey,
      baseUrl: buildEntryBaseUrl(preview, entry),
      channelSettings: buildEntryChannelSettings(preview, entry),
      name:
        preview.provider.id === "aws"
          ? appendAwsRegionToChannelName(baseName, entry.apiKey)
          : baseName,
      ...entryModelPlan,
    }
    try {
      await createNewApiChannel(runtimeConfig, createInput)
      acknowledged.push({ entry, index: originalIndex, createInput })
    } catch (error) {
      const failure = channelFailureResult(error, entry, originalIndex + 1)
      results.push(failure)
      if (failure.retryable) rateLimitedFailure = failure
    }
  }

  // New API's successful AddChannel response does not include an id. For a
  // bulk import, locate every acknowledged channel with paginated list calls
  // instead of issuing one search request per Key. This roughly halves the
  // management API traffic that shares New API's global per-IP rate limit.
  // https://github.com/QuantumNous/new-api/blob/main/controller/channel.go
  // https://github.com/QuantumNous/new-api/blob/main/router/api-router.go
  let createdChannels = new Map()
  try {
    createdChannels =
      acknowledged.length === 1
        ? new Map([
            [
              acknowledged[0].createInput,
              await findCreatedChannel(
                runtimeConfig,
                acknowledged[0].createInput,
              ),
            ],
          ])
        : await findCreatedChannels(
            runtimeConfig,
            acknowledged.map((item) => item.createInput),
          )
  } catch {
    // A success:true mutation is authoritative. A lookup failure is retained
    // as an acknowledged-but-unlocated record and must never retry the POST.
  }

  for (const { entry, index, createInput } of acknowledged) {
    const createdChannel = createdChannels.get(createInput) || null
    let balance = {
      status: "unavailable",
      reason: createdChannel?.id
        ? "批量渠道已定位，可稍后刷新余额"
        : "渠道已提交成功，但暂时无法定位渠道 ID",
    }
    if (createdChannel?.id && preview.keys.length === 1) {
      try {
        balance = await enrichBalance(runtimeConfig, createdChannel.id)
      } catch {
        // Channel creation already succeeded; balance lookup is best-effort.
      }
    }
    const record = await importStore.record({
      importBatchId,
      profileId: runtimeConfig.profileId,
      targetName: runtimeConfig.name,
      targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
      providerName: preview.provider.name,
      apiKey: entry.apiKey,
      quota: entry.quota,
      batchItemIndex: index + 1,
      currentBalance:
        balance.status === "available" ? balance.currentBalance : null,
      operation: "created",
      channelId: createdChannel?.id,
      channelName: createInput.name,
    })
    results.push({
      success: true,
      keyIndex: index + 1,
      ...(entry.id ? { entryId: entry.id } : {}),
      channelId: createdChannel?.id ?? null,
      channelName: createInput.name,
      verification: createdChannel?.id ? "located" : "acknowledged",
      balance,
      record,
    })
  }
  results.sort((left, right) => (left.keyIndex || 0) - (right.keyIndex || 0))
  const successful = results.filter((result) => result.success)
  const failed = results.filter((result) => !result.success)
  const latest = successful.at(-1)
  return {
    success: failed.length === 0,
    operation: "created",
    channelId: latest?.channelId ?? null,
    channelName: latest?.channelName ?? preview.name,
    keyCount: preview.keys.length,
    successCount: successful.length,
    failedCount: failed.length,
    skippedCount: lateDuplicateCount,
    modelCount: preview.models.length,
    mappingCount: body.mappings?.length || 0,
    balance: latest?.balance || { status: "unavailable" },
    results,
  }
}

const resultFailures = (result) =>
  [...(result.results || []), ...(result.failures || [])].filter(
    (item) => item?.success === false,
  )

async function createRateLimitRecovery(
  preview,
  body,
  result,
  requestId,
  now = new Date(),
) {
  const failures = resultFailures(result).filter(isRateLimitError)
  const byIndex = new Map(failures.map((item) => [Number(item.keyIndex), item]))
  const keys = preview.keys.flatMap((entry, index) => {
    const failure = byIndex.get(index + 1)
    if (!failure) return []
    return [
      {
        ...entry,
        priorityIndex: Number.isInteger(entry.priorityIndex)
          ? entry.priorityIndex
          : index,
      },
    ]
  })
  if (keys.length === 0) return null
  const retryAfterValues = failures
    .map((item) => item.retryAfterMs)
    .filter(Number.isFinite)
  const retryDelay =
    retryAfterValues.length > 0
      ? Math.max(0, ...retryAfterValues)
      : RATE_LIMIT_RECOVERY_DELAY_MS
  const combineKeys = body.combineKeys === true
  return await scheduleStore.create({
    preview: {
      ...preview,
      originalKeyCount: preview.originalKeyCount || preview.keys.length,
      keys,
    },
    createOptions: {
      confirmDuplicates: true,
      existingChannelId: Number(body.existingChannelId || 0) || null,
      manualModels: Array.isArray(body.manualModels) ? body.manualModels : [],
      mappings: Array.isArray(body.mappings) ? body.mappings : [],
      combineKeys,
    },
    schedule: {
      startAt: new Date(now.getTime() + retryDelay).toISOString(),
      batchSize: combineKeys
        ? keys.length
        : Math.min(RATE_LIMIT_RECOVERY_BATCH_SIZE, keys.length),
      intervalMinutes: 1,
    },
    kind: "recovery",
    requestId: `rate-limit:${requestId}`,
  })
}

async function createPacedContinuation(
  preview,
  body,
  keys,
  requestId,
  now = new Date(),
) {
  if (keys.length === 0) return null
  return await scheduleStore.create({
    preview: {
      ...preview,
      originalKeyCount: preview.originalKeyCount || preview.keys.length,
      keys,
    },
    createOptions: {
      confirmDuplicates: true,
      existingChannelId: null,
      manualModels: Array.isArray(body.manualModels) ? body.manualModels : [],
      mappings: Array.isArray(body.mappings) ? body.mappings : [],
      combineKeys: false,
    },
    schedule: {
      startAt: new Date(
        now.getTime() + SAFE_BULK_CONTINUATION_DELAY_MS,
      ).toISOString(),
      batchSize: 1,
      intervalMinutes: 1,
    },
    kind: "paced",
    requestId: `paced:${requestId}`,
  })
}

async function runDueScheduleBatch(now = new Date()) {
  const claim = await scheduleStore.claimDueJob(now)
  if (!claim) return null
  try {
    const result = await runChannelOperation(() =>
      createChannelsFromPreview(claim.preview, {
        ...claim.createOptions,
        confirmDuplicates: true,
      }),
    )
    return await scheduleStore.completeRun(claim.id, result, new Date())
  } catch (error) {
    return await scheduleStore.failRun(claim.id, error, new Date())
  }
}

async function handleApi(
  request,
  response,
  url,
  port,
  onScheduleChanged = async () => {},
  publicOrigins = [],
  accessProtected = false,
) {
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    let profiles = await configStore.listProfiles()
    const unnamedProfiles = profiles.filter(
      (profile) => profile.nameSource === "host",
    )
    const detectedNames = await Promise.all(
      unnamedProfiles.map(async (profile) => {
        try {
          return await fetchNewApiSystemName(profile.targetUrl)
        } catch {
          return ""
        }
      }),
    )
    for (const [index, profile] of unnamedProfiles.entries()) {
      if (detectedNames[index]) {
        await configStore.saveDetectedName(
          profile.profileId,
          detectedNames[index],
        )
      }
    }
    profiles = await configStore.listProfiles()
    const config = await configStore.readConfig()
    const publicConfig = await getPublicConfig(config)
    let groups = []
    let groupsError = ""
    if (publicConfig.hasToken || publicConfig.hasSession) {
      try {
        groups = await fetchNewApiGroups(await getRuntimeConfig())
      } catch (error) {
        groupsError =
          error instanceof Error ? error.message : "读取 New API 分组失败"
      }
    }
    return sendJson(response, 200, {
      sessionToken: SESSION_TOKEN,
      providers: await listAvailableProviders(),
      customProviders: await customProviderStore.list(),
      profiles: profiles.map(({ profileId, name, targetUrl }) => ({
        profileId,
        name,
        target: maskTargetUrl(targetUrl),
      })),
      config: publicConfig,
      groups,
      groupsError,
      schedules: await scheduleStore.list(),
      deployment: {
        accessProtected,
        sharedDatabase: sqliteStorageEnabled(),
      },
    })
  }

  if (
    !isAllowedApiRequestOrigin(
      request.method,
      request.headers.origin,
      port,
      publicOrigins,
    )
  ) {
    return sendJson(response, 403, { error: "来源校验失败" })
  }
  if (!safeEqual(request.headers["x-importer-session"], SESSION_TOKEN)) {
    return sendJson(response, 403, { error: "本地会话已失效，请刷新页面" })
  }

  if (request.method === "POST" && url.pathname === "/api/profiles/select") {
    const body = await readJsonBody(request)
    const config = await configStore.selectProfile(String(body.profileId || ""))
    return sendJson(response, 200, {
      success: true,
      config: await getPublicConfig(config),
      groups: await fetchNewApiGroups(await getRuntimeConfig(config.profileId)),
    })
  }

  if (request.method === "GET" && url.pathname === "/api/imports") {
    return sendJson(response, 200, { records: await importStore.list() })
  }

  if (request.method === "GET" && url.pathname === "/api/schedules") {
    return sendJson(response, 200, { schedules: await scheduleStore.list() })
  }

  if (request.method === "GET" && url.pathname === "/api/groups") {
    const runtimeConfig = await getRuntimeConfig()
    return sendJson(response, 200, {
      groups: await fetchNewApiGroups(runtimeConfig),
    })
  }

  if (request.method === "POST" && url.pathname === "/api/custom-providers") {
    const body = await readJsonBody(request)
    const provider = await customProviderStore.save({
      id: body.id,
      name: body.name,
      baseUrl: body.baseUrl,
    })
    return sendJson(response, 200, {
      provider,
      customProviders: await customProviderStore.list(),
      providers: await listAvailableProviders(),
    })
  }

  const customProviderDeleteMatch = url.pathname.match(
    /^\/api\/custom-providers\/([^/]+)$/,
  )
  if (request.method === "DELETE" && customProviderDeleteMatch) {
    await customProviderStore.remove(
      decodeURIComponent(customProviderDeleteMatch[1]),
    )
    return sendJson(response, 200, {
      success: true,
      customProviders: await customProviderStore.list(),
      providers: await listAvailableProviders(),
    })
  }

  if (request.method === "POST" && url.pathname === "/api/channel-templates") {
    const body = await readJsonBody(request)
    const provider = await resolveRequestedProvider(body.providerId)
    if (!provider.importable) throw new Error(provider.description)
    const templates = await listChannelTemplates(
      await getRuntimeConfig(),
      provider,
    )
    return sendJson(response, 200, { templates })
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJsonBody(request)
    const allowInsecureHttp = body.allowInsecureHttp === true
    const targetUrl = normalizeTargetUrl(body.targetUrl, {
      allowInsecureHttp,
    })
    const username = String(body.username || "").trim()
    const password = String(body.password || "")
    if (!username || !password) throw new Error("请输入用户名和密码")
    const login = await loginNewApi({ targetUrl, username, password })
    const runtimeConfig = {
      targetUrl,
      userId: login.userId,
      sessionCookie: login.sessionCookie,
    }
    try {
      await verifyNewApi(runtimeConfig)
    } catch (error) {
      if (error instanceof Error && error.message.includes("认证失败")) {
        throw new Error("登录成功，但该账号没有渠道管理权限")
      }
      throw error
    }
    const existingConfig = body.profileId
      ? await configStore.readConfig(String(body.profileId))
      : null
    const profileName = await resolveProfileName(
      body,
      targetUrl,
      existingConfig,
    )
    const rememberSession = body.rememberSession === true
    await configStore.saveSession({ targetUrl, ...login }, rememberSession)
    const profile = await configStore.saveConfig({
      profileId: String(body.profileId || ""),
      ...profileName,
      targetUrl,
      userId: login.userId,
      rememberToken: false,
      rememberSession,
      allowInsecureHttp,
    })
    return sendJson(response, 200, {
      success: true,
      target: maskTargetUrl(targetUrl),
      username: login.username,
      profile,
      groups: await fetchNewApiGroups(runtimeConfig),
    })
  }

  if (request.method === "POST" && url.pathname === "/api/config") {
    const body = await readJsonBody(request)
    const allowInsecureHttp = body.allowInsecureHttp === true
    const targetUrl = normalizeTargetUrl(body.targetUrl, {
      allowInsecureHttp,
    })
    const adminToken = String(body.adminToken || "").trim()
    if (adminToken.length < 8) throw new Error("请输入完整的管理员 Token")
    const rememberToken = body.rememberToken === true
    const existingConfig = body.profileId
      ? await configStore.readConfig(String(body.profileId))
      : null
    const userId = await discoverNewApiUserId({
      targetUrl,
      adminToken,
      preferredUserId: existingConfig?.userId,
    })
    await configStore.saveToken(
      getCredentialAccount(targetUrl, userId),
      adminToken,
      rememberToken,
    )
    const profileName = await resolveProfileName(
      body,
      targetUrl,
      existingConfig,
    )
    await configStore.clearSession(targetUrl, userId)
    const profile = await configStore.saveConfig({
      profileId: String(body.profileId || ""),
      ...profileName,
      targetUrl,
      userId,
      rememberToken,
      rememberSession: false,
      allowInsecureHttp,
    })
    return sendJson(response, 200, {
      success: true,
      target: maskTargetUrl(targetUrl),
      profile,
      groups: await fetchNewApiGroups({
        ...profile,
        targetUrl,
        userId,
        adminToken,
      }),
    })
  }

  if (request.method === "POST" && url.pathname === "/api/preview") {
    const body = await readJsonBody(request)
    const preview = await buildCredentialPreview(body)
    const previewId = previewStore.create(preview)
    return sendJson(response, 200, buildPreviewResponse(preview, previewId))
  }

  if (request.method === "POST" && url.pathname === "/api/create") {
    const body = await readJsonBody(request)
    const previewId = String(body.previewId || "")
    const preview = previewStore.claim(previewId)
    try {
      const shouldPaceBulkWrite =
        body.combineKeys !== true &&
        !Number(body.existingChannelId || 0) &&
        preview.keys.length > 1
      const indexedKeys = preview.keys.map((entry, index) => ({
        ...entry,
        priorityIndex: Number.isInteger(entry.priorityIndex)
          ? entry.priorityIndex
          : index,
      }))
      const operationPreview = shouldPaceBulkWrite
        ? {
            ...preview,
            originalKeyCount: preview.originalKeyCount || preview.keys.length,
            keys: [indexedKeys[0]],
          }
        : preview
      const result = await runChannelOperation(() =>
        createChannelsFromPreview(operationPreview, body),
      )
      const rateLimitedFailure = resultFailures(result).find(isRateLimitError)
      let recoverySchedule = null
      let continuationSchedule = null
      if (shouldPaceBulkWrite && rateLimitedFailure) {
        const queuedResult = {
          ...result,
          keyCount: preview.keys.length,
          successCount: 0,
          failedCount: preview.keys.length,
          results: indexedKeys.map((entry, index) =>
            index === 0
              ? rateLimitedFailure
              : deferredRateLimitResult(entry, index + 1, rateLimitedFailure),
          ),
        }
        recoverySchedule = await createRateLimitRecovery(
          { ...preview, keys: indexedKeys },
          body,
          queuedResult,
          previewId,
        )
      } else if (shouldPaceBulkWrite && result.successCount > 0) {
        continuationSchedule = await createPacedContinuation(
          { ...preview, keys: indexedKeys },
          body,
          indexedKeys.slice(1),
          previewId,
        )
      } else {
        recoverySchedule = await createRateLimitRecovery(
          preview,
          body,
          result,
          previewId,
        )
      }
      previewStore.delete(previewId)
      if (recoverySchedule || continuationSchedule) await onScheduleChanged()
      return sendJson(response, 200, {
        ...result,
        ...(shouldPaceBulkWrite
          ? {
              keyCount: preview.keys.length,
              queuedCount:
                continuationSchedule?.counts.pending ||
                recoverySchedule?.counts.pending ||
                0,
            }
          : {}),
        ...(recoverySchedule ? { recoverySchedule } : {}),
        ...(continuationSchedule ? { continuationSchedule } : {}),
      })
    } catch (error) {
      if (isRateLimitError(error)) {
        const failure = channelFailureResult(error, preview.keys[0], 1)
        const results = preview.keys.map((entry, index) =>
          index === 0
            ? failure
            : deferredRateLimitResult(entry, index + 1, failure),
        )
        const queuedResult = {
          success: false,
          operation: "queued",
          keyCount: preview.keys.length,
          successCount: 0,
          failedCount: preview.keys.length,
          modelCount: preview.models.length,
          mappingCount: body.mappings?.length || 0,
          balance: { status: "unavailable" },
          results,
        }
        const recoverySchedule = await createRateLimitRecovery(
          preview,
          body,
          queuedResult,
          previewId,
        )
        previewStore.delete(previewId)
        await onScheduleChanged()
        return sendJson(response, 200, {
          ...queuedResult,
          recoverySchedule,
        })
      }
      previewStore.release(previewId)
      throw error
    }
  }

  if (request.method === "POST" && url.pathname === "/api/schedules") {
    const body = await readJsonBody(request)
    const previewId = String(body.previewId || "")
    const preview = previewId
      ? previewStore.claim(previewId)
      : await buildCredentialPreview(body)
    try {
      const schedule = await scheduleStore.create({
        preview,
        createOptions: {
          confirmDuplicates: true,
          existingChannelId: null,
          manualModels: Array.isArray(body.manualModels)
            ? body.manualModels
            : [],
          mappings: Array.isArray(body.mappings) ? body.mappings : [],
          combineKeys: body.combineKeys === true,
        },
        schedule: body.schedule,
        requestId: previewId,
      })
      if (previewId) previewStore.delete(previewId)
      await onScheduleChanged()
      return sendJson(response, 200, { schedule })
    } catch (error) {
      if (previewId) previewStore.release(previewId)
      throw error
    }
  }

  const scheduleSettingsMatch = url.pathname.match(
    /^\/api\/schedules\/([^/]+)\/settings$/,
  )
  if (request.method === "POST" && scheduleSettingsMatch) {
    const body = await readJsonBody(request)
    const schedule = await scheduleStore.updateSchedule(
      scheduleSettingsMatch[1],
      body.schedule,
    )
    await onScheduleChanged()
    return sendJson(response, 200, { schedule })
  }

  const scheduleActionMatch = url.pathname.match(
    /^\/api\/schedules\/([^/]+)\/(run|pause|resume|cancel|retry-failed)$/,
  )
  if (request.method === "POST" && scheduleActionMatch) {
    const [, scheduleId, action] = scheduleActionMatch
    if (action === "retry-failed") {
      const schedule = await scheduleStore.retryFailed(scheduleId, new Date())
      await onScheduleChanged()
      return sendJson(response, 200, { schedule })
    }
    if (action === "run") {
      const claim = await scheduleStore.claimJobNow(scheduleId, new Date())
      if (!claim || claim.id !== scheduleId) {
        return sendJson(response, 200, {
          schedule: (await scheduleStore.list()).find(
            (item) => item.id === scheduleId,
          ),
        })
      }
      try {
        const result = await runChannelOperation(() =>
          createChannelsFromPreview(claim.preview, {
            ...claim.createOptions,
            confirmDuplicates: true,
          }),
        )
        const schedule = await scheduleStore.completeRun(
          claim.id,
          result,
          new Date(),
        )
        await onScheduleChanged()
        return sendJson(response, 200, { schedule })
      } catch (error) {
        const schedule = await scheduleStore.failRun(
          claim.id,
          error,
          new Date(),
        )
        await onScheduleChanged()
        return sendJson(response, 200, { schedule })
      }
    }
    const status =
      action === "cancel"
        ? "cancelled"
        : action === "pause"
          ? "paused"
          : "active"
    const schedule = await scheduleStore.updateStatus(scheduleId, status)
    await onScheduleChanged()
    return sendJson(response, 200, { schedule })
  }

  if (request.method === "POST" && url.pathname === "/api/balance") {
    const body = await readJsonBody(request)
    const channelId = Number(body.channelId)
    if (!Number.isInteger(channelId) || channelId <= 0) {
      throw new Error("渠道 ID 不正确")
    }
    const runtimeConfig = await getRuntimeConfig()
    let balance = await refreshChannelBalance(runtimeConfig, channelId)
    if (balance.status === "available") {
      balance = {
        ...balance,
        ...(await balanceStore.record(
          {
            targetUrl: runtimeConfig.targetUrl,
            userId: runtimeConfig.userId,
            channelId,
          },
          balance.balance,
        )),
      }
    }
    return sendJson(response, 200, { channelId, balance })
  }

  if (request.method === "POST" && url.pathname === "/api/imports/refresh") {
    const body = await readJsonBody(request)
    const record = (await importStore.list()).find(
      (item) => item.id === String(body.recordId || ""),
    )
    if (!record?.channelId) throw new Error("该记录没有可查询的渠道")
    if (record.sharedChannel && !Number.isInteger(record.keyIndex)) {
      throw new Error("这条旧记录没有 Key 索引，无法拆分实时用量")
    }
    const runtimeConfig = await getRuntimeConfigForRecord(record)
    if (!record.sharedChannel) {
      try {
        const balance = await enrichBalance(runtimeConfig, record.channelId)
        if (balance.status === "available") {
          await importStore.updateBalance(record.id, balance.currentBalance)
        }
      } catch {
        // Gateway usage remains available even if the provider has no balance API.
      }
    }
    const usage = await fetchChannelUsage(runtimeConfig, {
      channelId: record.channelId,
      keyIndex: record.keyIndex,
      startTimestamp: Math.floor(new Date(record.importedAt).getTime() / 1000),
    })
    const updated = await importStore.updateUsage(record.id, usage, {
      profileId: runtimeConfig.profileId,
      targetName: runtimeConfig.name,
      targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
    })
    return sendJson(response, 200, { record: updated })
  }

  return sendJson(response, 404, { error: "接口不存在" })
}

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
}

const STATIC_FILES = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "usageStats.js",
  "viewState.js",
  "assets/operations-board.jpg",
])

const LOGIN_STATIC_FILES = new Set([
  "login.html",
  "login.css",
  "login.js",
  "assets/operations-board.jpg",
])

async function serveStatic(response, pathname, { login = false } = {}) {
  const providerIconMatch = pathname.match(
    /^\/provider-icons\/([a-z0-9-]+)\.svg$/,
  )
  if (providerIconMatch) {
    const svg = await getProviderIconSvg(providerIconMatch[1])
    if (!svg) {
      response.writeHead(404).end("Not found")
      return
    }
    response.writeHead(200, {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    })
    response.end(svg)
    return
  }
  const fileName =
    pathname === "/" ? (login ? "login.html" : "index.html") : pathname.slice(1)
  const allowedFiles = login ? LOGIN_STATIC_FILES : STATIC_FILES
  if (!allowedFiles.has(fileName)) {
    response.writeHead(404).end("Not found")
    return
  }
  const body = await readFile(join(PUBLIC_DIR, fileName))
  const extension = fileName.slice(fileName.lastIndexOf("."))
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "Content-Type": CONTENT_TYPES[extension],
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  })
  response.end(body)
}

export function calculateScheduleDelay(nextRunAt, now = Date.now()) {
  if (!nextRunAt) return IDLE_SCHEDULE_CHECK_MS
  const timestamp = new Date(nextRunAt).getTime()
  if (!Number.isFinite(timestamp)) return IDLE_SCHEDULE_CHECK_MS
  return Math.min(MAX_TIMER_DELAY_MS, Math.max(0, timestamp - now))
}

export async function startImporterServer({
  host = HOST,
  port = DEFAULT_PORT,
  openBrowser = false,
  tokenStore = null,
  accessSessions = new AccessSessionManager(),
  publicHosts = String(process.env.DATAEYESAI_PUBLIC_HOSTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  publicOrigins = String(process.env.DATAEYESAI_PUBLIC_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
} = {}) {
  configStore.setTokenStore(tokenStore || createSharedTokenStore())
  let activePort = port
  let scheduleTimer = null
  let scheduleRunning = false
  let scheduleGeneration = 0
  let closing = false
  const scheduleNextRun = async () => {
    const generation = ++scheduleGeneration
    if (scheduleTimer) {
      clearTimeout(scheduleTimer)
      scheduleTimer = null
    }
    const nextRunAt = await scheduleStore.nextRunAt()
    if (closing || generation !== scheduleGeneration) return
    scheduleTimer = setTimeout(runSchedules, calculateScheduleDelay(nextRunAt))
  }
  const runSchedules = async () => {
    if (scheduleRunning) return
    scheduleRunning = true
    try {
      while (await runDueScheduleBatch()) {
        // Keep draining due batches so a sleeping laptop catches up gradually.
      }
    } catch (error) {
      process.stderr.write(
        `dataeyesai 定时上 Key 失败：${error instanceof Error ? error.message : "未知错误"}\n`,
      )
    } finally {
      scheduleRunning = false
      await scheduleNextRun()
    }
  }
  const server = createServer(async (request, response) => {
    try {
      if (!isAllowedHostHeader(request.headers.host, activePort, publicHosts)) {
        return sendJson(response, 403, { error: "Host 校验失败" })
      }
      const url = new URL(request.url || "/", `http://${request.headers.host}`)
      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        if (
          !isAllowedApiRequestOrigin(
            request.method,
            request.headers.origin,
            activePort,
            publicOrigins,
          )
        ) {
          return sendJson(response, 403, { error: "来源校验失败" })
        }
        const body = await readJsonBody(request)
        const session = accessSessions.login(
          request.socket.remoteAddress,
          body.accessKey,
        )
        return sendJson(
          response,
          200,
          { success: true },
          session.cookie ? { "Set-Cookie": session.cookie } : {},
        )
      }
      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        return sendJson(
          response,
          200,
          { success: true },
          { "Set-Cookie": accessSessions.logout(request.headers.cookie) },
        )
      }
      const authenticated = accessSessions.authenticate(request.headers.cookie)
      if (!authenticated) {
        if (url.pathname.startsWith("/api/")) {
          return sendJson(response, 401, { error: "请先输入系统访问密钥" })
        }
        if (request.method !== "GET") {
          response.writeHead(405).end("Method not allowed")
          return
        }
        return await serveStatic(response, url.pathname, { login: true })
      }
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(
          request,
          response,
          url,
          activePort,
          scheduleNextRun,
          publicOrigins,
          accessSessions.enabled,
        )
      }
      if (request.method !== "GET") {
        response.writeHead(405).end("Method not allowed")
        return
      }
      await serveStatic(response, url.pathname)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "操作失败，请稍后重试"
      sendJson(response, 400, { error: message })
    }
  })

  await new Promise((resolveListen, reject) => {
    const onError = (error) => reject(error)
    server.once("error", onError)
    server.listen(port, host, () => {
      server.off("error", onError)
      const address = server.address()
      activePort = typeof address === "object" && address ? address.port : port
      resolveListen()
    })
  })
  const url = `http://${host}:${activePort}`
  process.stdout.write(`dataeyesai 已启动：${url}\n`)
  // Use the nearest queued timestamp instead of coarse polling so a task can
  // start on its selected second. Network and upstream latency still apply.
  void runSchedules()
  if (openBrowser && process.platform === "darwin") {
    const { execFile } = await import("node:child_process")
    execFile("open", [url])
  }
  return {
    server,
    url,
    close: async () => {
      closing = true
      scheduleGeneration += 1
      if (scheduleTimer) clearTimeout(scheduleTimer)
      await new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()))
      })
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === MODULE_PATH) {
  startImporterServer({
    openBrowser:
      process.env.CHANNEL_IMPORTER_NO_OPEN !== "1" &&
      process.platform === "darwin",
  }).catch((error) => {
    process.stderr.write(
      `dataeyesai 启动失败：${error instanceof Error ? error.message : "未知错误"}\n`,
    )
    process.exitCode = 1
  })
}
