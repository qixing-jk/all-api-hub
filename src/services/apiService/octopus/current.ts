import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
  type OctopusCreateChannelInput,
  type OctopusFetchModelInput,
  type OctopusUpdateChannelInput,
} from "~/types/octopus"

import {
  OCTOPUS_API_OPERATIONS,
  type OctopusApiOperation,
  type OctopusNativeRequest,
} from "./operations"

type CurrentOctopusChannelType =
  | "openai"
  | "openai_responses"
  | "anthropic"
  | "gemini"
  | "volcengine"

interface CurrentOctopusCustomHeaderDto {
  header_key: string
  header_value: string
}

interface CurrentOctopusChannelStatsDto {
  channel_id: number
  input_token: number
  output_token: number
  input_cost: number
  output_cost: number
  wait_time: number
  request_success: number
  request_failed: number
}

interface CurrentOctopusChannelDto {
  id: number
  name: string
  type: CurrentOctopusChannelType
  enabled: boolean
  base_url: string
  key: string
  model: string
  custom_model?: string
  proxy: boolean
  auto_sync: boolean
  custom_header: CurrentOctopusCustomHeaderDto[]
  param_override?: string
  channel_proxy?: string
  match_regex?: string
  stats?: CurrentOctopusChannelStatsDto
}

interface CurrentOctopusCreateChannelDto {
  name: string
  type: CurrentOctopusChannelType
  enabled?: boolean
  base_url: string
  key: string
  model?: string
  custom_model?: string
  proxy?: boolean
  auto_sync?: boolean
  custom_header?: CurrentOctopusCustomHeaderDto[]
  param_override?: string
  channel_proxy?: string
  match_regex?: string
}

interface CurrentOctopusUpdateChannelDto {
  id: number
  name?: string
  type?: CurrentOctopusChannelType
  enabled?: boolean
  base_url?: string
  key?: string
  model?: string
  custom_model?: string
  proxy?: boolean
  auto_sync?: boolean
  custom_header?: CurrentOctopusCustomHeaderDto[]
  param_override?: string
  channel_proxy?: string
  match_regex?: string
}

interface CurrentOctopusFetchModelDto {
  type: CurrentOctopusChannelType
  base_url: string
  key: string
  proxy?: boolean
  channel_proxy?: string
  match_regex?: string
  custom_header?: CurrentOctopusCustomHeaderDto[]
}

const isCurrentOctopusChannelType = (
  value: unknown,
): value is CurrentOctopusChannelType =>
  value === "openai" ||
  value === "openai_responses" ||
  value === "anthropic" ||
  value === "gemini" ||
  value === "volcengine"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requireString = (
  value: Record<string, unknown>,
  field: string,
): string => {
  const candidate = value[field]
  if (typeof candidate !== "string") {
    throw new Error(`Invalid current Octopus channel response: ${field}`)
  }
  return candidate
}

const requireNumber = (
  value: Record<string, unknown>,
  field: string,
): number => {
  const candidate = value[field]
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate)) {
    throw new Error(`Invalid current Octopus channel response: ${field}`)
  }
  return candidate
}

const requireFiniteNumber = (
  value: Record<string, unknown>,
  field: string,
): number => {
  const candidate = value[field]
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new Error(`Invalid current Octopus channel response: ${field}`)
  }
  return candidate
}

const requireBoolean = (
  value: Record<string, unknown>,
  field: string,
): boolean => {
  const candidate = value[field]
  if (typeof candidate !== "boolean") {
    throw new Error(`Invalid current Octopus channel response: ${field}`)
  }
  return candidate
}

const parseCurrentCustomHeader = (
  value: unknown,
): CurrentOctopusCustomHeaderDto => {
  if (!isRecord(value)) {
    throw new Error("Invalid current Octopus channel response: custom_header")
  }
  return {
    header_key: requireString(value, "header_key"),
    header_value: requireString(value, "header_value"),
  }
}

const parseCurrentStats = (
  value: unknown,
): CurrentOctopusChannelStatsDto | undefined => {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) {
    throw new Error("Invalid current Octopus channel response: stats")
  }
  return {
    channel_id: requireNumber(value, "channel_id"),
    input_token: requireFiniteNumber(value, "input_token"),
    output_token: requireFiniteNumber(value, "output_token"),
    input_cost: requireFiniteNumber(value, "input_cost"),
    output_cost: requireFiniteNumber(value, "output_cost"),
    wait_time: requireFiniteNumber(value, "wait_time"),
    request_success: requireFiniteNumber(value, "request_success"),
    request_failed: requireFiniteNumber(value, "request_failed"),
  }
}

const toCurrentOctopusChannelType = (
  type: OctopusOutboundType,
): CurrentOctopusChannelType | null => {
  switch (type) {
    case OctopusOutboundType.OpenAIChat:
      return "openai"
    case OctopusOutboundType.OpenAIResponse:
      return "openai_responses"
    case OctopusOutboundType.Anthropic:
      return "anthropic"
    case OctopusOutboundType.Gemini:
      return "gemini"
    case OctopusOutboundType.Volcengine:
      return "volcengine"
    case OctopusOutboundType.OpenAIEmbedding:
      return null
  }
  return null
}

const fromCurrentOctopusChannelType = (
  type: CurrentOctopusChannelType,
): OctopusOutboundType => {
  switch (type) {
    case "openai":
      return OctopusOutboundType.OpenAIChat
    case "openai_responses":
      return OctopusOutboundType.OpenAIResponse
    case "anthropic":
      return OctopusOutboundType.Anthropic
    case "gemini":
      return OctopusOutboundType.Gemini
    case "volcengine":
      return OctopusOutboundType.Volcengine
  }
}

const parseCurrentChannel = (value: unknown): CurrentOctopusChannelDto => {
  if (!isRecord(value)) {
    throw new Error("Invalid current Octopus channel response")
  }
  const type = value.type
  if (!isCurrentOctopusChannelType(type)) {
    throw new Error(`Unsupported current Octopus channel type: ${String(type)}`)
  }
  const customHeader = value.custom_header
  if (
    customHeader !== undefined &&
    customHeader !== null &&
    !Array.isArray(customHeader)
  ) {
    throw new Error("Invalid current Octopus channel response: custom_header")
  }

  return {
    id: requireNumber(value, "id"),
    name: requireString(value, "name"),
    type,
    enabled: requireBoolean(value, "enabled"),
    base_url: requireString(value, "base_url"),
    key: requireString(value, "key"),
    model: requireString(value, "model"),
    custom_model:
      typeof value.custom_model === "string" ? value.custom_model : undefined,
    proxy: requireBoolean(value, "proxy"),
    auto_sync: requireBoolean(value, "auto_sync"),
    custom_header: (customHeader ?? []).map(parseCurrentCustomHeader),
    param_override:
      typeof value.param_override === "string"
        ? value.param_override
        : undefined,
    channel_proxy:
      typeof value.channel_proxy === "string" ? value.channel_proxy : undefined,
    match_regex:
      typeof value.match_regex === "string" ? value.match_regex : undefined,
    stats: parseCurrentStats(value.stats),
  }
}

const normalizeCurrentChannel = (value: unknown): OctopusChannel => {
  const current = parseCurrentChannel(value)
  return {
    id: current.id,
    name: current.name,
    type: fromCurrentOctopusChannelType(current.type),
    enabled: current.enabled,
    base_urls: [{ url: current.base_url }],
    keys: [{ enabled: true, channel_key: current.key }],
    model: current.model,
    custom_model: current.custom_model,
    proxy: current.proxy,
    auto_sync: current.auto_sync,
    auto_group: OctopusAutoGroupType.None,
    custom_header: current.custom_header,
    param_override: current.param_override,
    channel_proxy: current.channel_proxy,
    match_regex: current.match_regex,
    stats: current.stats,
  }
}

const requireCurrentType = (type: OctopusOutboundType) => {
  const currentType = toCurrentOctopusChannelType(type)
  if (currentType === null) {
    throw new Error(
      "The current Octopus API cannot represent this channel operation",
    )
  }
  return currentType
}

const encodeCustomHeaders = (
  headers: OctopusCreateChannelInput["customHeaders"],
): CurrentOctopusCustomHeaderDto[] | undefined =>
  headers?.map((header) => ({
    header_key: header.header_key,
    header_value: header.header_value,
  }))

const encodeCreate = (
  input: OctopusCreateChannelInput,
): CurrentOctopusCreateChannelDto => ({
  name: input.name,
  type: requireCurrentType(input.type),
  enabled: input.enabled,
  base_url: input.baseUrl,
  key: input.key,
  model: input.model,
  custom_model: input.customModel,
  proxy: input.proxy,
  auto_sync: input.autoSync,
  custom_header: encodeCustomHeaders(input.customHeaders),
  param_override: input.paramOverride,
  channel_proxy: input.channelProxy,
  match_regex: input.matchRegex,
})

const encodeUpdate = (
  input: OctopusUpdateChannelInput,
): CurrentOctopusUpdateChannelDto => ({
  id: input.id,
  name: input.name,
  type: input.type === undefined ? undefined : requireCurrentType(input.type),
  enabled: input.enabled,
  base_url: input.baseUrl,
  key: input.key,
  model: input.model,
  custom_model: input.customModel,
  proxy: input.proxy,
  auto_sync: input.autoSync,
  custom_header: encodeCustomHeaders(input.customHeaders),
  param_override: input.paramOverride,
  channel_proxy: input.channelProxy,
  match_regex: input.matchRegex,
})

const encodeFetchModel = (
  input: OctopusFetchModelInput,
): CurrentOctopusFetchModelDto => ({
  type: requireCurrentType(input.type),
  base_url: input.baseUrl,
  key: input.key,
  proxy: input.proxy,
  channel_proxy: input.source?.channel_proxy,
  match_regex: input.source?.match_regex,
  custom_header: encodeCustomHeaders(input.source?.custom_header),
})

/**
 * Request/response codec maintained against the latest Octopus contract.
 * Contract source:
 * https://github.com/bestruirui/octopus/blob/4928a04b25d2cedb266ad5949896084989875b42/web/src/api/channel.ts
 */
export const currentOctopusContract = {
  createRequest(
    operation: OctopusApiOperation,
    baseInit: RequestInit,
  ): OctopusNativeRequest {
    switch (operation.kind) {
      case OCTOPUS_API_OPERATIONS.ListChannels:
        return { endpoint: "/api/v1/channel/list", init: baseInit }
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
        return {
          endpoint: "/api/v1/channel/update",
          init: {
            ...baseInit,
            method: "POST",
            body: JSON.stringify(encodeUpdate(operation.input)),
          },
        }
      case OCTOPUS_API_OPERATIONS.DeleteChannel:
        return {
          endpoint: `/api/v1/channel/delete/${operation.channelId}`,
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
      case OCTOPUS_API_OPERATIONS.ListChannels:
        if (!Array.isArray(data)) {
          throw new Error("Invalid current Octopus channel list response")
        }
        return data.map(normalizeCurrentChannel)
      case OCTOPUS_API_OPERATIONS.CreateChannel:
      case OCTOPUS_API_OPERATIONS.UpdateChannel:
        if (data === null || data === undefined) return data
        return normalizeCurrentChannel(data)
      default:
        return data
    }
  },
}
