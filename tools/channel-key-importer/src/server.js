import { randomBytes, timingSafeEqual } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { BalanceStore } from "./balanceStore.js"
import {
  applyQuotaLines,
  buildResourceChannelName,
  parseBatchKeys,
} from "./batchKeys.js"
import {
  buildAwsInferenceProfileMappings,
  getAwsRuntimeBaseUrl,
  resolveChannelInput,
  validateBatchCredentialEntries,
} from "./channelConfig.js"
import {
  ConfigStore,
  findProfileForRecord,
  getCredentialAccount,
} from "./configStore.js"
import { ImportStore } from "./importStore.js"
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
  findSimilarChannels,
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
  getProvider,
  listPublicProviders,
  resolveProviderBaseUrl,
} from "./providers.js"
import {
  isAllowedApiRequestOrigin,
  isAllowedHostHeader,
  maskTargetUrl,
  normalizeTargetUrl,
  validateUserId,
} from "./security.js"

const HOST = "127.0.0.1"
const DEFAULT_PORT = Number(process.env.CHANNEL_IMPORTER_PORT || 4179)
const MODULE_PATH = fileURLToPath(import.meta.url)
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url))
const SESSION_TOKEN = randomBytes(32).toString("base64url")
const MAX_BODY_BYTES = 64 * 1024

const configStore = new ConfigStore()
const balanceStore = new BalanceStore()
const importStore = new ImportStore()
const previewStore = new PreviewStore()

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
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
  const session = configStore.readSession(targetUrl, userId)
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
  const session = configStore.readSession(config.targetUrl, config.userId)
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

const buildEntryBaseUrl = (preview, entry) =>
  preview.provider.id === "aws" &&
  preview.channelSettings?.aws_key_type === "api_key"
    ? getAwsRuntimeBaseUrl(entry.apiKey)
    : preview.baseUrl

async function handleApi(request, response, url, port) {
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
      providers: listPublicProviders(),
      profiles: profiles.map(({ profileId, name, targetUrl }) => ({
        profileId,
        name,
        target: maskTargetUrl(targetUrl),
      })),
      config: publicConfig,
      groups,
      groupsError,
    })
  }

  if (
    !isAllowedApiRequestOrigin(request.method, request.headers.origin, port)
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

  if (request.method === "GET" && url.pathname === "/api/groups") {
    const runtimeConfig = await getRuntimeConfig()
    return sendJson(response, 200, {
      groups: await fetchNewApiGroups(runtimeConfig),
    })
  }

  if (request.method === "POST" && url.pathname === "/api/channel-templates") {
    const body = await readJsonBody(request)
    const provider = getProvider(String(body.providerId || ""))
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
    configStore.saveSession({ targetUrl, ...login })
    const profile = await configStore.saveConfig({
      profileId: String(body.profileId || ""),
      ...profileName,
      targetUrl,
      userId: login.userId,
      rememberToken: false,
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
    configStore.clearSession(targetUrl, userId)
    const profile = await configStore.saveConfig({
      profileId: String(body.profileId || ""),
      ...profileName,
      targetUrl,
      userId,
      rememberToken,
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
    const provider = getProvider(String(body.providerId || ""))
    if (!provider.importable) throw new Error(provider.description)
    const configSource = String(body.configSource || "")
    if (!["template", "fetch", "new-api", "manual"].includes(configSource)) {
      throw new Error("请选择复制已有渠道、自动获取模型或手动填写")
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
    const useRawCredentials = Boolean(
      provider.channelConfig.credentialModes?.length &&
        String(body.apiKey || "").trim(),
    )
    const channelInput = resolveChannelInput(provider, {
      ...body,
      configSource,
      useRawCredentials,
    })
    let keys
    if (useRawCredentials) {
      keys = parseBatchKeys(body.apiKey, "", {
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
    if (String(body.quotaLines || "").trim()) {
      keys = applyQuotaLines(keys, body.quotaLines)
    }
    const credentialMode =
      template?.channelSettings?.aws_key_type ||
      template?.channelSettings?.vertex_key_type ||
      String(body.credentialMode || "")
    validateBatchCredentialEntries(provider, credentialMode, keys)
    keys = [...new Map(keys.map((entry) => [entry.apiKey, entry])).values()]
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
    const invalidGroup = groups.find(
      (group) => !availableGroups.includes(group),
    )
    if (invalidGroup) throw new Error(`渠道分组已不存在：${invalidGroup}`)
    if (groups.join(",").length > 64) {
      throw new Error("所选渠道分组名称总长度不能超过 64 个字符")
    }
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
    const duplicates = await findSimilarChannels(
      runtimeConfig,
      resolvedProvider,
    )
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
    const providerMappings = template
      ? template.modelMappings
      : channelInput.providerMappings
    const previewId = previewStore.create({
      provider,
      keys,
      baseUrl,
      name,
      groups,
      models,
      duplicates,
      profileId: runtimeConfig.profileId,
      channelOther: template?.channelOther ?? channelInput.channelOther,
      channelSettings:
        template?.channelSettings ?? channelInput.channelSettings,
      providerMappings,
      awsEntryRouting: template ? false : channelInput.awsEntryRouting,
      templateConfig: template?.advanced || null,
      templateChannelId: template?.id || null,
      templateChannelName: template?.name || "",
      automaticName,
    })
    return sendJson(response, 200, {
      previewId,
      provider: {
        name: provider.name,
        channelType: provider.channelType,
        baseUrl,
      },
      name,
      groups,
      models,
      duplicates,
      keyCount: keys.length,
      quotaTotal: keys.every(({ quota }) => Number.isFinite(quota))
        ? keys.reduce((total, { quota }) => total + quota, 0)
        : null,
      modelSource:
        configSource === "template"
          ? `template:${template.name}`
          : configSource,
      templateChannelId: template?.id || null,
      templateChannelName: template?.name || "",
      providerMappings,
      expiresInSeconds: 300,
    })
  }

  if (request.method === "POST" && url.pathname === "/api/create") {
    const body = await readJsonBody(request)
    const previewId = String(body.previewId || "")
    const preview = previewStore.get(previewId)
    const isTemplateClone = Number.isInteger(preview.templateChannelId)
    if (
      !isTemplateClone &&
      preview.duplicates.length > 0 &&
      body.confirmDuplicates !== true
    ) {
      throw new Error("发现同来源渠道，请确认后再添加")
    }
    const existingChannelId = isTemplateClone
      ? 0
      : Number(body.existingChannelId || 0)
    const existingChannel = existingChannelId
      ? preview.duplicates.find(
          (channel) => Number(channel.id) === existingChannelId,
        )
      : null
    if (existingChannelId && !existingChannel) {
      throw new Error("所选同类渠道不在本次预览中，请重新预览")
    }
    const runtimeConfig = await getRuntimeConfig(preview.profileId)
    if (existingChannel) {
      if (preview.keys.length > 1 && !existingChannel.isMultiKey) {
        throw new Error("单 Key 渠道不能批量写入，请选择多 Key 渠道或分别新建")
      }
      const updatedEntries = []
      const updateFailures = []
      let nextKeyIndex = existingChannel.multiKeySize || 0
      for (const [index, entry] of preview.keys.entries()) {
        try {
          await updateExistingChannelKey(runtimeConfig, {
            channelId: existingChannel.id,
            apiKey: entry.apiKey,
            append: existingChannel.isMultiKey,
          })
          updatedEntries.push({
            ...entry,
            keyIndex: existingChannel.isMultiKey ? nextKeyIndex : null,
          })
          if (existingChannel.isMultiKey) nextKeyIndex += 1
        } catch (error) {
          updateFailures.push({
            keyIndex: index + 1,
            error: error instanceof Error ? error.message : "写入失败",
          })
        }
      }
      if (updatedEntries.length === 0) {
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
      for (const entry of updatedEntries) {
        records.push(
          await importStore.record({
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
            operation: existingChannel.isMultiKey ? "appended" : "replaced",
            channelId: existingChannel.id,
            channelName: existingChannel.name,
          }),
        )
      }
      previewStore.delete(previewId)
      return sendJson(response, 200, {
        success: updateFailures.length === 0 && channelEnabled,
        operation: "updated",
        keyAction: existingChannel.isMultiKey ? "appended" : "replaced",
        channelId: existingChannel.id,
        channelName: existingChannel.name,
        balance,
        keyCount: preview.keys.length,
        successCount: updatedEntries.length,
        failedCount: updateFailures.length,
        channelEnabled,
        failures: updateFailures,
        records,
      })
    }
    const modelPlan = buildPreviewModelPlan(preview, body)
    if (body.combineKeys === true && preview.keys.length > 1) {
      if (
        preview.provider.id === "vertex-ai" &&
        preview.channelSettings?.vertex_key_type === "api_key"
      ) {
        throw new Error("Vertex API Key 模式不支持合并为多 Key 渠道")
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
      for (const [keyIndex, entry] of preview.keys.entries()) {
        records.push(
          await importStore.record({
            profileId: runtimeConfig.profileId,
            targetName: runtimeConfig.name,
            targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
            providerName: preview.provider.name,
            apiKey: entry.apiKey,
            quota: entry.quota,
            currentBalance: null,
            sharedChannel: true,
            keyIndex,
            operation: "created-multi-key",
            channelId: createdChannel?.id,
            channelName: preview.name,
          }),
        )
      }
      previewStore.delete(previewId)
      return sendJson(response, 200, {
        success: true,
        operation: "created-multi-key",
        channelId: createdChannel?.id ?? null,
        channelName: preview.name,
        keyCount: preview.keys.length,
        successCount: preview.keys.length,
        failedCount: 0,
        modelCount: modelPlan.models.length,
        mappingCount: Object.keys(modelPlan.modelMapping).length,
        balance: { status: "unavailable" },
        records,
      })
    }

    const results = []
    const concurrency = 5
    for (let offset = 0; offset < preview.keys.length; offset += concurrency) {
      await Promise.all(
        preview.keys
          .slice(offset, offset + concurrency)
          .map(async (entry, relativeIndex) => {
            const index = offset + relativeIndex
            const entryModelPlan = buildEntryModelPlan(
              preview,
              modelPlan,
              entry,
            )
            const createInput = {
              ...preview,
              apiKey: entry.apiKey,
              baseUrl: buildEntryBaseUrl(preview, entry),
              name: preview.automaticName
                ? buildResourceChannelName(preview.provider.name, [entry], {
                    index,
                    total: preview.keys.length,
                  })
                : preview.keys.length > 1
                  ? `${preview.name} · ${index + 1}`.slice(0, 80)
                  : preview.name,
              ...entryModelPlan,
            }
            try {
              await createNewApiChannel(runtimeConfig, createInput)
              let createdChannel = null
              let balance = {
                status: "unavailable",
                reason: "渠道已创建，但暂时无法定位新渠道进行余额查询",
              }
              try {
                createdChannel = await findCreatedChannel(
                  runtimeConfig,
                  createInput,
                )
                if (createdChannel?.id && preview.keys.length === 1) {
                  balance = await enrichBalance(
                    runtimeConfig,
                    createdChannel.id,
                  )
                }
              } catch {
                // Channel creation already succeeded; balance lookup is best-effort.
              }
              const record = await importStore.record({
                profileId: runtimeConfig.profileId,
                targetName: runtimeConfig.name,
                targetUrl: maskTargetUrl(runtimeConfig.targetUrl),
                providerName: preview.provider.name,
                apiKey: entry.apiKey,
                quota: entry.quota,
                currentBalance:
                  balance.status === "available"
                    ? balance.currentBalance
                    : null,
                operation: "created",
                channelId: createdChannel?.id,
                channelName: createInput.name,
              })
              results.push({
                success: true,
                channelId: createdChannel?.id ?? null,
                channelName: createInput.name,
                balance,
                record,
              })
            } catch (error) {
              results.push({
                success: false,
                keyIndex: index + 1,
                error: error instanceof Error ? error.message : "写入失败",
              })
            }
          }),
      )
    }
    previewStore.delete(previewId)
    const successful = results.filter((result) => result.success)
    const failed = results.filter((result) => !result.success)
    const latest = successful.at(-1)
    return sendJson(response, 200, {
      success: failed.length === 0,
      operation: "created",
      channelId: latest?.channelId ?? null,
      channelName: preview.name,
      keyCount: preview.keys.length,
      successCount: successful.length,
      failedCount: failed.length,
      modelCount: preview.models.length,
      mappingCount: body.mappings?.length || 0,
      balance: latest?.balance || { status: "unavailable" },
      results,
    })
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
  ".js": "text/javascript; charset=utf-8",
}

async function serveStatic(response, pathname) {
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
  const fileName = pathname === "/" ? "index.html" : pathname.slice(1)
  if (!new Set(["index.html", "styles.css", "app.js"]).has(fileName)) {
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

export async function startImporterServer({
  host = HOST,
  port = DEFAULT_PORT,
  openBrowser = false,
  tokenStore = null,
} = {}) {
  configStore.setTokenStore(tokenStore)
  let activePort = port
  const server = createServer(async (request, response) => {
    try {
      if (!isAllowedHostHeader(request.headers.host, activePort)) {
        return sendJson(response, 403, { error: "Host 校验失败" })
      }
      const url = new URL(request.url || "/", `http://${request.headers.host}`)
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, response, url, activePort)
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
  if (openBrowser && process.platform === "darwin") {
    const { execFile } = await import("node:child_process")
    execFile("open", [url])
  }
  return {
    server,
    url,
    close: async () =>
      await new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()))
      }),
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
