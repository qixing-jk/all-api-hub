import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
  type OctopusChannelStats,
  type OctopusCreateChannelInput,
  type OctopusCustomHeader,
  type OctopusFetchModelInput,
  type OctopusUpdateChannelInput,
} from "~/types/octopus"

import {
  OCTOPUS_API_OPERATIONS,
  type OctopusApiOperation,
  type OctopusNativeRequest,
} from "./operations"

const OCTOPUS_V013_PROTOCOLS = {
  OpenAIChatCompletion: 1 << 1,
  OpenAIResponse: 1 << 2,
  AnthropicMessage: 1 << 3,
} as const

interface OctopusV013ChannelModelStatsDto {
  model_id: number
  model_name: string
}

interface OctopusV013ChannelStatsDto extends OctopusChannelStats {
  channel_name: string
  enabled: boolean
  models: OctopusV013ChannelModelStatsDto[]
}

interface OctopusV013ChannelKeyDto {
  name: string
  key: string
  enabled: boolean
}

interface OctopusV013ChannelGrantDto {
  model_name: string
  key_name: string
  protocols: number
}

interface OctopusV013ChannelDetailDto {
  id: number
  name: string
  dialect: string
  enabled: boolean
  base_url: string
  openai_chat_completion_path: string
  openai_response_path: string
  anthropic_message_path: string
  keys: OctopusV013ChannelKeyDto[]
  models: string[]
  grants: OctopusV013ChannelGrantDto[]
  proxy: boolean
  custom_header: OctopusCustomHeader[]
  param_override: string
  channel_proxy: string
  match_regex: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const invalidV013Response = (field?: string) =>
  new Error(
    field
      ? "Invalid Octopus v0.13 channel response: " + field
      : "Invalid Octopus v0.13 channel response",
  )

const requireString = (value: Record<string, unknown>, field: string) => {
  const candidate = value[field]
  if (typeof candidate !== "string") throw invalidV013Response(field)
  return candidate
}

const requireInteger = (value: Record<string, unknown>, field: string) => {
  const candidate = value[field]
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate)) {
    throw invalidV013Response(field)
  }
  return candidate
}

const requireFiniteNumber = (value: Record<string, unknown>, field: string) => {
  const candidate = value[field]
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw invalidV013Response(field)
  }
  return candidate
}

const requireBoolean = (value: Record<string, unknown>, field: string) => {
  const candidate = value[field]
  if (typeof candidate !== "boolean") throw invalidV013Response(field)
  return candidate
}

const requireArray = (value: Record<string, unknown>, field: string) => {
  const candidate = value[field]
  if (!Array.isArray(candidate)) throw invalidV013Response(field)
  return candidate
}

const parseCustomHeader = (value: unknown): OctopusCustomHeader => {
  if (!isRecord(value)) throw invalidV013Response("custom_header")
  return {
    header_key: requireString(value, "header_key"),
    header_value: requireString(value, "header_value"),
  }
}

const parseChannelKey = (value: unknown): OctopusV013ChannelKeyDto => {
  if (!isRecord(value)) throw invalidV013Response("keys")
  return {
    name: requireString(value, "name"),
    key: requireString(value, "key"),
    enabled: requireBoolean(value, "enabled"),
  }
}

const parseChannelGrant = (value: unknown): OctopusV013ChannelGrantDto => {
  if (!isRecord(value)) throw invalidV013Response("grants")
  return {
    model_name: requireString(value, "model_name"),
    key_name: requireString(value, "key_name"),
    protocols: requireInteger(value, "protocols"),
  }
}

const parseChannelStats = (value: unknown): OctopusV013ChannelStatsDto => {
  if (!isRecord(value)) throw invalidV013Response("stats")
  return {
    channel_id: requireInteger(value, "channel_id"),
    channel_name: requireString(value, "channel_name"),
    enabled: requireBoolean(value, "enabled"),
    input_token: requireFiniteNumber(value, "input_token"),
    output_token: requireFiniteNumber(value, "output_token"),
    input_cost: requireFiniteNumber(value, "input_cost"),
    output_cost: requireFiniteNumber(value, "output_cost"),
    wait_time: requireFiniteNumber(value, "wait_time"),
    request_success: requireFiniteNumber(value, "request_success"),
    request_failed: requireFiniteNumber(value, "request_failed"),
    models: requireArray(value, "models").map((model) => {
      if (!isRecord(model)) throw invalidV013Response("models")
      return {
        model_id: requireInteger(model, "model_id"),
        model_name: requireString(model, "model_name"),
      }
    }),
  }
}

const parseChannelDetail = (value: unknown): OctopusV013ChannelDetailDto => {
  if (!isRecord(value)) throw invalidV013Response()
  return {
    id: requireInteger(value, "id"),
    name: requireString(value, "name"),
    dialect: requireString(value, "dialect"),
    enabled: requireBoolean(value, "enabled"),
    base_url: requireString(value, "base_url"),
    openai_chat_completion_path: requireString(
      value,
      "openai_chat_completion_path",
    ),
    openai_response_path: requireString(value, "openai_response_path"),
    anthropic_message_path: requireString(value, "anthropic_message_path"),
    keys: requireArray(value, "keys").map(parseChannelKey),
    models: requireArray(value, "models").map((model) => {
      if (typeof model !== "string") throw invalidV013Response("models")
      return model
    }),
    grants: requireArray(value, "grants").map(parseChannelGrant),
    proxy: requireBoolean(value, "proxy"),
    custom_header: requireArray(value, "custom_header").map(parseCustomHeader),
    param_override: requireString(value, "param_override"),
    channel_proxy: requireString(value, "channel_proxy"),
    match_regex: requireString(value, "match_regex"),
  }
}

const inferOutboundType = (
  grants: OctopusV013ChannelGrantDto[],
): OctopusOutboundType => {
  const protocols = grants.reduce((all, grant) => all | grant.protocols, 0)
  if (protocols & OCTOPUS_V013_PROTOCOLS.OpenAIChatCompletion) {
    return OctopusOutboundType.OpenAIChat
  }
  if (protocols & OCTOPUS_V013_PROTOCOLS.OpenAIResponse) {
    return OctopusOutboundType.OpenAIResponse
  }
  if (protocols & OCTOPUS_V013_PROTOCOLS.AnthropicMessage) {
    return OctopusOutboundType.Anthropic
  }
  return OctopusOutboundType.OpenAIChat
}

const protocolForOutboundType = (type: OctopusOutboundType): number => {
  switch (type) {
    case OctopusOutboundType.OpenAIChat:
    case OctopusOutboundType.Gemini:
    case OctopusOutboundType.Volcengine:
      return OCTOPUS_V013_PROTOCOLS.OpenAIChatCompletion
    case OctopusOutboundType.OpenAIResponse:
      return OCTOPUS_V013_PROTOCOLS.OpenAIResponse
    case OctopusOutboundType.Anthropic:
      return OCTOPUS_V013_PROTOCOLS.AnthropicMessage
    case OctopusOutboundType.OpenAIEmbedding:
      break
  }
  throw new Error("Octopus v0.13 cannot represent this channel operation")
}

const protocolPathsForOutboundType = (type: OctopusOutboundType) =>
  type === OctopusOutboundType.Volcengine
    ? {
        openai_chat_completion_path: "/chat/completions",
        openai_response_path: "/responses",
        anthropic_message_path: "/messages",
      }
    : {
        openai_chat_completion_path: "/v1/chat/completions",
        openai_response_path: "/v1/responses",
        anthropic_message_path: "/v1/messages",
      }

const splitModels = (...values: Array<string | undefined>): string[] => {
  const models = values.flatMap((value) => value?.split(",") ?? [])
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))]
}

const createGrants = (
  models: string[],
  keyName: string | undefined,
  protocols: number,
): OctopusV013ChannelGrantDto[] =>
  keyName
    ? models.map((model_name) => ({ model_name, key_name: keyName, protocols }))
    : []

const encodeCreate = (
  input: OctopusCreateChannelInput,
): OctopusV013ChannelDetailDto => {
  const models = splitModels(input.model, input.customModel)
  const keyName = "default"
  const protocols = protocolForOutboundType(input.type)
  return {
    id: 0,
    name: input.name,
    dialect: "generic",
    enabled: input.enabled ?? true,
    base_url: input.baseUrl,
    ...protocolPathsForOutboundType(input.type),
    keys: [{ name: keyName, key: input.key, enabled: true }],
    models,
    grants: createGrants(models, keyName, protocols),
    proxy: input.proxy ?? false,
    custom_header: input.customHeaders ?? [],
    param_override: input.paramOverride ?? "",
    channel_proxy: input.channelProxy ?? "",
    match_regex: input.matchRegex ?? "",
  }
}

const encodeUpdate = (
  input: OctopusUpdateChannelInput,
  existing: OctopusV013ChannelDetailDto,
): OctopusV013ChannelDetailDto => {
  const existingType = inferOutboundType(existing.grants)
  const typeChanged = input.type !== undefined && input.type !== existingType
  const targetType = input.type ?? existingType
  const keys = existing.keys.map((key) => ({ ...key }))
  if (input.key !== undefined) {
    if (keys[0]) keys[0].key = input.key
    else keys.push({ name: "default", key: input.key, enabled: true })
  }

  const replacesModels =
    input.model !== undefined || input.customModel !== undefined
  const models = replacesModels
    ? splitModels(input.model, input.customModel)
    : [...existing.models]
  const modelNames = new Set(models)
  const keyNames = new Set(keys.map((key) => key.name))
  const protocols = protocolForOutboundType(targetType)
  let grants = existing.grants
    .filter(
      (grant) =>
        modelNames.has(grant.model_name) && keyNames.has(grant.key_name),
    )
    .map((grant) => ({
      ...grant,
      ...(typeChanged ? { protocols } : {}),
    }))

  if (replacesModels) {
    const grantedModels = new Set(grants.map((grant) => grant.model_name))
    grants = [
      ...grants,
      ...createGrants(
        models.filter((model) => !grantedModels.has(model)),
        keys[0]?.name,
        protocols,
      ),
    ]
  }

  return {
    ...existing,
    name: input.name ?? existing.name,
    enabled: input.enabled ?? existing.enabled,
    base_url: input.baseUrl ?? existing.base_url,
    ...(typeChanged ? protocolPathsForOutboundType(targetType) : {}),
    keys,
    models,
    grants,
    proxy: input.proxy ?? existing.proxy,
    custom_header: input.customHeaders ?? existing.custom_header,
    param_override: input.paramOverride ?? existing.param_override,
    channel_proxy: input.channelProxy ?? existing.channel_proxy,
    match_regex: input.matchRegex ?? existing.match_regex,
  }
}

const encodeFetchModel = (input: OctopusFetchModelInput) => ({
  channel: {
    name: input.source?.name ?? "",
    dialect: "generic",
    enabled: input.source?.enabled ?? true,
    base_url: input.baseUrl,
    ...protocolPathsForOutboundType(input.type),
    proxy: input.proxy ?? false,
    custom_header: input.source?.custom_header ?? [],
    param_override: input.source?.param_override ?? "",
    channel_proxy: input.source?.channel_proxy ?? "",
    match_regex: input.source?.match_regex ?? "",
  },
  key: input.key,
})

/**
 * Octopus v0.13 uses channel stats as list summaries and fetches full detail
 * only when an editor opens.
 * Source: https://github.com/bestruirui/octopus/blob/27aa40dc0f3b2902bce3e96ccdba019d17041606/web/src/api/channel.ts
 */
export const octopusV013Contract = {
  statsEndpoint: "/api/v1/channel/stats",

  detailEndpoint(channelId: number) {
    return "/api/v1/channel/detail/" + channelId
  },

  parseDetail(value: unknown): OctopusV013ChannelDetailDto {
    return parseChannelDetail(value)
  },

  parseStatsList(value: unknown): OctopusV013ChannelStatsDto[] {
    if (!Array.isArray(value)) throw invalidV013Response("stats")
    return value.map(parseChannelStats)
  },

  normalizeStatsChannel(stats: OctopusV013ChannelStatsDto): OctopusChannel {
    return {
      id: stats.channel_id,
      name: stats.channel_name,
      // The stats contract intentionally omits dialect/protocol details.
      type: OctopusOutboundType.OpenAIChat,
      enabled: stats.enabled,
      base_urls: [],
      keys: [],
      model: stats.models.map((model) => model.model_name).join(","),
      proxy: false,
      auto_sync: false,
      auto_group: OctopusAutoGroupType.None,
      stats: {
        channel_id: stats.channel_id,
        input_token: stats.input_token,
        output_token: stats.output_token,
        input_cost: stats.input_cost,
        output_cost: stats.output_cost,
        wait_time: stats.wait_time,
        request_success: stats.request_success,
        request_failed: stats.request_failed,
      },
    }
  },

  normalizeChannel(
    value: unknown,
    stats?: OctopusV013ChannelStatsDto,
  ): OctopusChannel {
    const detail = parseChannelDetail(value)
    if (stats && detail.id !== stats.channel_id) {
      throw invalidV013Response("channel_id")
    }

    return {
      id: detail.id,
      name: detail.name,
      type: inferOutboundType(detail.grants),
      enabled: detail.enabled,
      base_urls: [{ url: detail.base_url }],
      keys: detail.keys.map((key) => ({
        enabled: key.enabled,
        channel_key: key.key,
      })),
      model: detail.models.join(","),
      proxy: detail.proxy,
      auto_sync: false,
      auto_group: OctopusAutoGroupType.None,
      custom_header: detail.custom_header,
      param_override: detail.param_override,
      channel_proxy: detail.channel_proxy,
      match_regex: detail.match_regex,
      ...(stats
        ? {
            stats: {
              channel_id: stats.channel_id,
              input_token: stats.input_token,
              output_token: stats.output_token,
              input_cost: stats.input_cost,
              output_cost: stats.output_cost,
              wait_time: stats.wait_time,
              request_success: stats.request_success,
              request_failed: stats.request_failed,
            },
          }
        : {}),
    }
  },

  createRequest(
    operation: OctopusApiOperation,
    baseInit: RequestInit,
    existing?: OctopusV013ChannelDetailDto,
  ): OctopusNativeRequest {
    switch (operation.kind) {
      case OCTOPUS_API_OPERATIONS.ListChannels:
        return { endpoint: this.statsEndpoint, init: baseInit }
      case OCTOPUS_API_OPERATIONS.CreateChannel:
        return {
          endpoint: "/api/v1/channel/create",
          init: {
            ...baseInit,
            method: "POST",
            body: JSON.stringify(encodeCreate(operation.input)),
          },
        }
      case OCTOPUS_API_OPERATIONS.UpdateChannel:
        if (!existing) {
          throw new Error(
            "Octopus v0.13 update requires current channel detail",
          )
        }
        return {
          endpoint: "/api/v1/channel/update",
          init: {
            ...baseInit,
            method: "POST",
            body: JSON.stringify(encodeUpdate(operation.input, existing)),
          },
        }
      case OCTOPUS_API_OPERATIONS.DeleteChannel:
        return {
          endpoint: "/api/v1/channel/delete/" + operation.channelId,
          init: { ...baseInit, method: "DELETE" },
        }
      case OCTOPUS_API_OPERATIONS.FetchRemoteModels:
        return {
          endpoint: "/api/v1/channel/fetch-model",
          init: {
            ...baseInit,
            method: "POST",
            body: JSON.stringify(encodeFetchModel(operation.input)),
          },
        }
      case OCTOPUS_API_OPERATIONS.ListAvailableModels:
        return { endpoint: "/api/v1/model/list", init: baseInit }
      case OCTOPUS_API_OPERATIONS.ListGroups:
        return { endpoint: "/api/v1/group/list", init: baseInit }
    }
  },

  normalizeResponse(operation: OctopusApiOperation, data: unknown): unknown {
    switch (operation.kind) {
      case OCTOPUS_API_OPERATIONS.CreateChannel:
      case OCTOPUS_API_OPERATIONS.UpdateChannel:
        if (data === null || data === undefined) return data
        return this.normalizeChannel(data)
      case OCTOPUS_API_OPERATIONS.FetchRemoteModels:
        if (!Array.isArray(data)) throw invalidV013Response("models")
        return data.map((model) => {
          if (!isRecord(model)) throw invalidV013Response("models")
          return requireString(model, "name")
        })
      default:
        return data
    }
  },
}
