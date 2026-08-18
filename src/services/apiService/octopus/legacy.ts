import type {
  OctopusBaseUrl,
  OctopusChannel,
  OctopusChannelKey,
  OctopusCreateChannelInput,
  OctopusCustomHeader,
  OctopusFetchModelInput,
  OctopusKeyAddRequest,
  OctopusKeyUpdateRequest,
  OctopusOutboundType,
  OctopusUpdateChannelInput,
} from "~/types/octopus"

import {
  OCTOPUS_API_OPERATIONS,
  type OctopusApiOperation,
  type OctopusNativeRequest,
} from "./operations"

interface LegacyOctopusCreateChannelDto {
  name: string
  type: OctopusOutboundType
  enabled?: boolean
  base_urls: OctopusBaseUrl[]
  keys: OctopusChannelKey[]
  model?: string
  custom_model?: string
  proxy?: boolean
  auto_sync?: boolean
  auto_group: number
  custom_header?: OctopusCustomHeader[]
  param_override?: string
  channel_proxy?: string
  match_regex?: string
}

interface LegacyOctopusUpdateChannelDto {
  id: number
  name?: string
  type?: OctopusOutboundType
  enabled?: boolean
  base_urls?: OctopusBaseUrl[]
  model?: string
  custom_model?: string
  proxy?: boolean
  auto_sync?: boolean
  auto_group?: number
  custom_header?: OctopusCustomHeader[]
  param_override?: string
  channel_proxy?: string
  match_regex?: string
  keys_to_add?: OctopusKeyAddRequest[]
  keys_to_update?: OctopusKeyUpdateRequest[]
}

interface LegacyOctopusFetchModelDto {
  type: OctopusOutboundType
  base_urls: OctopusBaseUrl[]
  keys: OctopusChannelKey[]
  proxy?: boolean
}

const preserveBaseUrls = (
  source: OctopusChannel | undefined,
  baseUrl: string,
): OctopusBaseUrl[] => {
  const [primary, ...rest] = source?.base_urls ?? []
  return [
    {
      url: baseUrl,
      ...(primary?.delay === undefined ? {} : { delay: primary.delay }),
    },
    ...rest.map((item) => ({
      url: item.url,
      ...(item.delay === undefined ? {} : { delay: item.delay }),
    })),
  ]
}

const preserveKeys = (source: OctopusChannel): OctopusChannelKey[] =>
  source.keys.map((item) => ({
    ...(item.id === undefined ? {} : { id: item.id }),
    ...(item.channel_id === undefined ? {} : { channel_id: item.channel_id }),
    enabled: item.enabled,
    channel_key: item.channel_key,
    ...(item.remark === undefined ? {} : { remark: item.remark }),
    ...(item.status_code === undefined
      ? {}
      : { status_code: item.status_code }),
    ...(item.last_use_time_stamp === undefined
      ? {}
      : { last_use_time_stamp: item.last_use_time_stamp }),
    ...(item.total_cost === undefined ? {} : { total_cost: item.total_cost }),
  }))

const encodeCustomHeaders = (
  headers: OctopusCustomHeader[] | undefined,
): OctopusCustomHeader[] | undefined =>
  headers?.map((header) => ({
    header_key: header.header_key,
    header_value: header.header_value,
  }))

const encodeKeyMutation = (
  source: OctopusChannel | undefined,
  key: string | undefined,
): Pick<LegacyOctopusUpdateChannelDto, "keys_to_add" | "keys_to_update"> => {
  if (key === undefined) return {}

  const primary = source?.keys[0]
  if (primary?.id !== undefined) {
    return {
      keys_to_update: [
        {
          id: primary.id,
          enabled: primary.enabled,
          channel_key: key,
          remark: primary.remark,
        },
      ],
    }
  }

  return {
    keys_to_add: [
      {
        enabled: primary?.enabled ?? true,
        channel_key: key,
        remark: primary?.remark,
      },
    ],
  }
}

const encodeCreate = (
  input: OctopusCreateChannelInput,
): LegacyOctopusCreateChannelDto => ({
  name: input.name,
  type: input.type,
  enabled: input.enabled,
  base_urls: [{ url: input.baseUrl }],
  keys: [{ enabled: true, channel_key: input.key }],
  model: input.model,
  custom_model: input.customModel,
  proxy: input.proxy,
  auto_sync: input.autoSync,
  auto_group: 0,
  custom_header: encodeCustomHeaders(input.customHeaders),
  param_override: input.paramOverride,
  channel_proxy: input.channelProxy,
  match_regex: input.matchRegex,
})

const encodeUpdate = (
  input: OctopusUpdateChannelInput,
): LegacyOctopusUpdateChannelDto => ({
  id: input.id,
  name: input.name,
  type: input.type,
  enabled: input.enabled,
  ...(input.baseUrl === undefined
    ? {}
    : { base_urls: preserveBaseUrls(input.source, input.baseUrl) }),
  model: input.model,
  custom_model: input.customModel,
  proxy: input.proxy,
  auto_sync: input.autoSync,
  ...(input.source === undefined
    ? {}
    : { auto_group: input.source.auto_group }),
  custom_header: encodeCustomHeaders(input.customHeaders),
  param_override: input.paramOverride,
  channel_proxy: input.channelProxy,
  match_regex: input.matchRegex,
  ...encodeKeyMutation(input.source, input.key),
})

const encodeFetchModel = (
  input: OctopusFetchModelInput,
): LegacyOctopusFetchModelDto => ({
  type: input.type,
  base_urls:
    input.source === undefined
      ? [{ url: input.baseUrl }]
      : preserveBaseUrls(
          input.source,
          input.source.base_urls[0]?.url ?? input.baseUrl,
        ),
  keys:
    input.source === undefined
      ? [{ enabled: true, channel_key: input.key }]
      : preserveKeys(input.source),
  proxy: input.proxy,
})

/** Frozen request/response codec for JWT-era Octopus releases. */
export const legacyOctopusContract = {
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

  normalizeResponse(_operation: OctopusApiOperation, data: unknown): unknown {
    return data
  },
}
