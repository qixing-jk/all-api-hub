import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
  type OctopusCreateChannelRequest,
  type OctopusFetchModelRequest,
  type OctopusUpdateChannelRequest,
} from "~/types/octopus"

export const OCTOPUS_CHANNEL_ENDPOINTS = {
  List: "/api/v1/channel/list",
  Create: "/api/v1/channel/create",
  Update: "/api/v1/channel/update",
  FetchModel: "/api/v1/channel/fetch-model",
} as const

type CurrentOctopusChannelType =
  | "openai"
  | "openai_responses"
  | "anthropic"
  | "gemini"
  | "volcengine"

type CurrentOctopusChannel = Omit<
  OctopusChannel,
  "type" | "base_urls" | "keys" | "auto_group"
> & {
  type: CurrentOctopusChannelType
  base_url: string
  key: string
}

const toCurrentChannelType = (
  type: OctopusOutboundType,
): CurrentOctopusChannelType => {
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
      throw new Error(
        "The current Octopus cookie API no longer supports the OpenAI Embedding channel type",
      )
  }
  throw new Error(`Unsupported Octopus channel type: ${String(type)}`)
}

const fromCurrentChannelType = (
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
  throw new Error(`Unsupported Octopus cookie channel type: ${String(type)}`)
}

const parseJsonRequestBody = <T>(body: BodyInit | null | undefined): T => {
  if (typeof body !== "string") {
    throw new Error("Octopus channel requests require a JSON body")
  }
  return JSON.parse(body) as T
}

const getFirstBaseUrl = (baseUrls: Array<{ url: string }> | undefined) =>
  baseUrls?.[0]?.url

const getFirstKey = (keys: Array<{ channel_key?: string }> | undefined) =>
  keys?.find((key) => key.channel_key?.trim())?.channel_key

const assertSingleMutationBaseUrl = (
  baseUrls: Array<{ url: string; delay?: number }> | undefined,
  required: boolean,
) => {
  if (baseUrls === undefined && !required) return
  if (baseUrls?.length !== 1 || baseUrls[0].delay !== undefined) {
    throw new Error(
      "The current Octopus cookie API requires exactly one channel Base URL without legacy metadata",
    )
  }
}

const assertDefaultAutoGroup = (
  autoGroup: OctopusAutoGroupType | undefined,
) => {
  if (autoGroup !== undefined && autoGroup !== OctopusAutoGroupType.None) {
    throw new Error(
      "The current Octopus cookie API cannot represent legacy automatic grouping",
    )
  }
}

const assertSingleCreateKey = (keys: OctopusCreateChannelRequest["keys"]) => {
  if (keys.length !== 1) {
    throw new Error(
      "The current Octopus cookie API requires exactly one channel key",
    )
  }
  const { channel_key: _key, enabled, ...metadata } = keys[0]
  if (
    enabled !== true ||
    Object.values(metadata).some((value) => value !== undefined)
  ) {
    throw new Error(
      "The current Octopus cookie API cannot represent legacy channel key metadata",
    )
  }
}

const getUpdateKey = (
  keysToAdd: OctopusUpdateChannelRequest["keys_to_add"],
  keysToUpdate: OctopusUpdateChannelRequest["keys_to_update"],
) => {
  if (keysToUpdate?.length) {
    throw new Error(
      "The current Octopus cookie API cannot target individual legacy channel keys",
    )
  }
  if (!keysToAdd?.length) return undefined
  if (keysToAdd.length !== 1) {
    throw new Error(
      "The current Octopus cookie API can replace only one channel key",
    )
  }
  const [{ channel_key: key, enabled, remark }] = keysToAdd
  if (enabled === false || remark !== undefined) {
    throw new Error(
      "The current Octopus cookie API cannot represent legacy channel key metadata",
    )
  }
  return key
}

const adaptCreateRequest = (body: BodyInit | null | undefined) => {
  const legacy = parseJsonRequestBody<OctopusCreateChannelRequest>(body)
  const { base_urls, keys, auto_group, ...current } = legacy
  assertSingleMutationBaseUrl(base_urls, true)
  assertSingleCreateKey(keys)
  assertDefaultAutoGroup(auto_group)
  return {
    ...current,
    type: toCurrentChannelType(legacy.type),
    base_url: getFirstBaseUrl(base_urls) ?? "",
    key: getFirstKey(keys) ?? "",
  }
}

const adaptUpdateRequest = (body: BodyInit | null | undefined) => {
  const legacy = parseJsonRequestBody<OctopusUpdateChannelRequest>(body)
  const {
    base_urls,
    keys_to_add,
    keys_to_update,
    keys_to_delete: _keysToDelete,
    auto_group,
    type,
    ...current
  } = legacy
  assertSingleMutationBaseUrl(base_urls, false)
  assertDefaultAutoGroup(auto_group)
  if (_keysToDelete?.length) {
    throw new Error(
      "The current Octopus cookie API cannot delete individual legacy channel keys",
    )
  }
  const key = getUpdateKey(keys_to_add, keys_to_update)
  return {
    ...current,
    ...(type === undefined ? {} : { type: toCurrentChannelType(type) }),
    ...(base_urls === undefined
      ? {}
      : { base_url: getFirstBaseUrl(base_urls) ?? "" }),
    ...(key === undefined ? {} : { key }),
  }
}

const adaptFetchModelRequest = (body: BodyInit | null | undefined) => {
  const legacy = parseJsonRequestBody<OctopusFetchModelRequest>(body)
  const { base_urls, keys, ...current } = legacy
  return {
    ...current,
    type: toCurrentChannelType(legacy.type),
    base_url: getFirstBaseUrl(base_urls) ?? "",
    key: getFirstKey(keys) ?? "",
  }
}

/**
 * Adapts only cookie-authenticated channel calls to Octopus' current wire
 * contract. Legacy bearer/JWT deployments keep their original payloads.
 *
 * Upstream contract:
 * https://github.com/bestruirui/octopus/blob/4928a04b25d2cedb266ad5949896084989875b42/web/src/api/channel.ts
 */
export const adaptCurrentOctopusChannelRequest = (
  endpoint: string,
  init: RequestInit,
): RequestInit => {
  let body: unknown
  switch (endpoint) {
    case OCTOPUS_CHANNEL_ENDPOINTS.Create:
      body = adaptCreateRequest(init.body)
      break
    case OCTOPUS_CHANNEL_ENDPOINTS.Update:
      body = adaptUpdateRequest(init.body)
      break
    case OCTOPUS_CHANNEL_ENDPOINTS.FetchModel:
      body = adaptFetchModelRequest(init.body)
      break
    default:
      return init
  }
  return { ...init, body: JSON.stringify(body) }
}

const normalizeCurrentChannel = (
  current: CurrentOctopusChannel,
): OctopusChannel => {
  const { base_url, key, type, custom_header, ...legacy } = current
  return {
    ...legacy,
    type: fromCurrentChannelType(type),
    base_urls: [{ url: base_url }],
    keys: [{ enabled: true, channel_key: key }],
    auto_group: OctopusAutoGroupType.None,
    custom_header: custom_header ?? [],
  }
}

export const normalizeCurrentOctopusChannelData = (
  endpoint: string,
  data: unknown,
): unknown => {
  if (endpoint === OCTOPUS_CHANNEL_ENDPOINTS.List && Array.isArray(data)) {
    return data.map((channel) =>
      normalizeCurrentChannel(channel as CurrentOctopusChannel),
    )
  }
  if (
    (endpoint === OCTOPUS_CHANNEL_ENDPOINTS.Create ||
      endpoint === OCTOPUS_CHANNEL_ENDPOINTS.Update) &&
    data &&
    typeof data === "object" &&
    "type" in data
  ) {
    return normalizeCurrentChannel(data as CurrentOctopusChannel)
  }
  return data
}
