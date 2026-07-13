import { OctopusOutboundTypeNames } from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  createChannel as createOctopusChannel,
  deleteChannel as deleteOctopusChannel,
  fetchGroups,
  fetchAvailableModels as fetchOctopusAvailableModels,
  listChannels,
  searchChannels,
  updateChannel as updateOctopusChannel,
} from "~/services/apiService/octopus"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidOctopusConfig,
  fetchAvailableModels,
  mapChannelTypeToOctopusOutboundType,
  octopusChannelToManagedSite,
  prepareChannelFormData,
} from "~/services/managedSites/providers/octopus"
import { getNumericChannelType } from "~/services/managedSites/utils/channelType"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  ChannelFormData,
  CreateChannelPayload,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import {
  assertManagedUpstreamResourceRefScope,
  createManagedUpstreamResourceRef,
  MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES,
  MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS,
  MANAGED_UPSTREAM_RESOURCE_SECRET_STATES,
  MANAGED_UPSTREAM_RESOURCE_STATUSES,
  normalizeManagedUpstreamResourceScopeKey,
  type ManagedUpstreamResourceDetail,
  type ManagedUpstreamResourceFieldDescriptor,
  type ManagedUpstreamResourceRef,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"
import type {
  OctopusChannel,
  OctopusCreateChannelRequest,
  OctopusUpdateChannelRequest,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/core/error"

import { createManagedSiteConfigCapability } from "./config"

const toManagedSiteChannelListData = (
  channels: OctopusChannel[],
): ManagedSiteChannelListData => {
  const items = channels.map(octopusChannelToManagedSite)
  const typeCounts = items.reduce<Record<string, number>>((acc, channel) => {
    const type = String(channel.type)
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return {
    items,
    total: items.length,
    type_counts: typeCounts,
  }
}

const toOctopusCreateRequest = (
  channelData: CreateChannelPayload,
): OctopusCreateChannelRequest => {
  const channel = channelData.channel

  return {
    name: channel.name || "",
    type: mapChannelTypeToOctopusOutboundType(
      getNumericChannelType(channel.type),
      true,
    ),
    enabled: channel.status === 1,
    base_urls: [{ url: channel.base_url || "" }],
    keys: [{ enabled: true, channel_key: channel.key || "" }],
    model: channel.models,
    auto_sync: true,
    auto_group: 0,
  }
}

const toOctopusUpdateRequest = (channelData: UpdateChannelPayload) => ({
  id: channelData.id,
  name: channelData.name,
  type:
    channelData.type !== undefined
      ? mapChannelTypeToOctopusOutboundType(
          getNumericChannelType(channelData.type),
          true,
        )
      : undefined,
  enabled:
    "status" in channelData && channelData.status !== undefined
      ? channelData.status === 1
      : undefined,
  base_urls:
    "base_url" in channelData && channelData.base_url !== undefined
      ? [{ url: channelData.base_url }]
      : undefined,
  model: channelData.models,
})

export const octopusManagedSiteChannels: ManagedSiteChannelsCapability<OctopusConfig> =
  {
    search: async (config, keyword) => {
      try {
        return toManagedSiteChannelListData(
          await searchChannels(config, keyword),
        )
      } catch {
        return null
      }
    },
    list: async (config, options) =>
      toManagedSiteChannelListData(await listChannels(config, options)),
    create: async (config, channelData) => {
      try {
        const result = await createOctopusChannel(
          config,
          toOctopusCreateRequest(channelData),
        )
        return {
          success: result.success,
          data: result.data,
          message: result.message || "success",
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          message: getErrorMessage(error) || "Failed to create channel",
        }
      }
    },
    update: async (config, channelData) => {
      try {
        const result = await updateOctopusChannel(
          config,
          toOctopusUpdateRequest(channelData),
        )
        return {
          success: result.success,
          data: result.data,
          message: result.message || "success",
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          message: getErrorMessage(error) || "Failed to update channel",
        }
      }
    },
    delete: async (config, channelId) => {
      try {
        const result = await deleteOctopusChannel(config, channelId)
        return {
          success: result.success,
          data: result.data,
          message: result.message || "success",
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          message: getErrorMessage(error) || "Failed to delete channel",
        }
      }
    },
  }

const octopusManagedSiteConfig: ManagedSiteConfigCapability<OctopusConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.OCTOPUS, checkValidOctopusConfig)

const octopusManagedSiteQueries: ManagedSiteQueriesCapability<OctopusConfig> = {
  fetchSiteUserGroups: fetchGroups,
  fetchAccountAvailableModels: fetchOctopusAvailableModels,
}

const octopusManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const assertOctopusResourceRef = (
  config: OctopusConfig,
  ref: ManagedUpstreamResourceRef,
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.OCTOPUS,
    scopeKey: config.baseUrl,
  })

const splitDelimitedValues = (value?: string | null): string[] =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? []

const toOctopusResourceStatus = (channel: OctopusChannel) =>
  channel.enabled
    ? MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled
    : MANAGED_UPSTREAM_RESOURCE_STATUSES.Disabled

const toOctopusSecretState = (channel: OctopusChannel) => {
  const key = channel.keys[0]?.channel_key
  if (!key?.trim()) {
    return MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Unavailable
  }

  return hasUsableManagedSiteChannelKey(key)
    ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available
    : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked
}

const toOctopusResourceSummary = (
  config: OctopusConfig,
  channel: OctopusChannel,
): ManagedUpstreamResourceSummary => {
  const models = splitDelimitedValues(channel.model)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.OCTOPUS,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(config.baseUrl),
      resourceId: channel.id,
    }),
    displayName: channel.name,
    nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Outbound,
    status: toOctopusResourceStatus(channel),
    typeLabel: OctopusOutboundTypeNames[channel.type] ?? String(channel.type),
    endpointLabel: channel.base_urls[0]?.url ?? "",
    modelCount: models.length,
    modelPreview: models.slice(0, 3),
    secretState: toOctopusSecretState(channel),
    capabilities: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRevealSecret: false,
    },
  }
}

const toOctopusResourceListData = (
  config: OctopusConfig,
  channels: OctopusChannel[],
) => ({
  items: channels.map((channel) => toOctopusResourceSummary(config, channel)),
  total: channels.length,
})

const findOctopusChannelByRef = async (
  config: OctopusConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<OctopusChannel> => {
  assertOctopusResourceRef(config, ref)

  const channels = await listChannels(config)
  const channel = channels.find((item) => String(item.id) === ref.resourceId)

  if (!channel) {
    throw new Error(`Channel ${ref.resourceId} was not found`)
  }

  return channel
}

const prepareOctopusEditDraft = (
  detail: ManagedUpstreamResourceDetail<OctopusChannel>,
): ChannelFormData => {
  const channel = detail.native

  return {
    name: channel.name,
    type: channel.type,
    key: channel.keys[0]?.channel_key ?? "",
    base_url: channel.base_urls[0]?.url ?? "",
    models: splitDelimitedValues(channel.model),
    groups: ["default"],
    priority: 0,
    weight: 0,
    status: channel.enabled ? 1 : 2,
  }
}

const octopusResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
  [
    {
      name: "name",
      label: "Channel name",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      name: "key",
      label: "API key",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Secret,
    },
    {
      name: "base_url",
      label: "Base URL",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Text,
    },
    {
      name: "models",
      label: "Models",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.MultiSelect,
      required: true,
    },
  ]

const replacePrimaryBaseUrl = (
  native: OctopusChannel,
  baseUrl: string,
): OctopusChannel["base_urls"] => {
  const [primary, ...rest] = native.base_urls
  return [{ ...(primary ?? {}), url: baseUrl }, ...rest]
}

const buildOctopusKeyUpdate = (
  native: OctopusChannel,
  key: string,
): Pick<OctopusUpdateChannelRequest, "keys_to_add" | "keys_to_update"> => {
  const trimmedKey = key.trim()
  if (!hasUsableManagedSiteChannelKey(trimmedKey)) {
    return {}
  }

  const primaryKey = native.keys[0]
  if (!primaryKey?.id) {
    return {
      keys_to_add: [
        {
          enabled: primaryKey?.enabled ?? true,
          channel_key: trimmedKey,
          remark: primaryKey?.remark,
        },
      ],
    }
  }

  return {
    keys_to_update: [
      {
        id: primaryKey.id,
        enabled: primaryKey.enabled,
        channel_key: trimmedKey,
        remark: primaryKey.remark,
      },
    ],
  }
}

const toOctopusResourceUpdatePayload = (
  detail: ManagedUpstreamResourceDetail<OctopusChannel>,
  draft: ChannelFormData,
): OctopusUpdateChannelRequest => {
  const native = detail.native

  return {
    id: native.id,
    name: draft.name,
    type: mapChannelTypeToOctopusOutboundType(
      getNumericChannelType(draft.type),
      true,
    ),
    enabled: draft.status === 1,
    base_urls: replacePrimaryBaseUrl(native, draft.base_url),
    model: draft.models.join(","),
    custom_model: native.custom_model,
    proxy: native.proxy,
    auto_sync: native.auto_sync,
    auto_group: native.auto_group,
    custom_header: native.custom_header,
    channel_proxy: native.channel_proxy,
    param_override: native.param_override,
    match_regex: native.match_regex,
    ...buildOctopusKeyUpdate(native, draft.key),
  }
}

const toOctopusResourceMutationResponse = async (
  config: OctopusConfig,
  response:
    | ReturnType<typeof createOctopusChannel>
    | ReturnType<typeof updateOctopusChannel>,
) => {
  const resolvedResponse = await response
  return {
    ...resolvedResponse,
    message: resolvedResponse.message || "success",
    data: resolvedResponse.data
      ? toOctopusResourceSummary(config, resolvedResponse.data)
      : null,
  }
}

const toOctopusResourceDeleteResponse = async (
  response: ReturnType<typeof deleteOctopusChannel>,
) => {
  const resolvedResponse = await response
  return {
    ...resolvedResponse,
    data: resolvedResponse.data ?? null,
    message: resolvedResponse.message || "success",
  }
}

const octopusManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  OctopusConfig,
  OctopusChannel,
  ChannelFormData
> = {
  items: {
    list: async (config, options) =>
      toOctopusResourceListData(
        config,
        await listChannels(config, { signal: options?.signal }),
      ),
    search: async (config, keyword) => {
      try {
        return toOctopusResourceListData(
          config,
          await searchChannels(config, keyword),
        )
      } catch {
        return null
      }
    },
    getDetail: async (config, ref) => {
      const channel = await findOctopusChannelByRef(config, ref)
      return {
        summary: toOctopusResourceSummary(config, channel),
        native: channel,
      }
    },
    create: async (config, draft) =>
      await toOctopusResourceMutationResponse(
        config,
        createOctopusChannel(
          config,
          toOctopusCreateRequest(buildChannelPayload(draft)),
        ),
      ),
    update: async (config, detail, draft) =>
      await toOctopusResourceMutationResponse(
        config,
        updateOctopusChannel(
          config,
          toOctopusResourceUpdatePayload(detail, draft),
        ),
      ),
    delete: async (config, ref) => {
      assertOctopusResourceRef(config, ref)
      return await toOctopusResourceDeleteResponse(
        deleteOctopusChannel(config, Number(ref.resourceId)),
      )
    },
  },
  drafts: {
    prepareImportDraft: async (input) => {
      if (input.source && typeof input.source === "object") {
        return input.source as ChannelFormData
      }

      return {
        name: input.resource?.displayName ?? "",
        type: 0,
        key: "",
        base_url: input.resource?.endpointLabel ?? "",
        models: input.resource?.modelPreview ?? [],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }
    },
    prepareEditDraft: prepareOctopusEditDraft,
    describeFields: () => octopusResourceFieldDescriptors,
    validateDraft: (draft) => {
      const errors = []
      if (!draft.name.trim()) {
        errors.push({ field: "name", message: "Channel name is required" })
      }
      if (draft.models.length === 0) {
        errors.push({
          field: "models",
          message: "At least one model is required",
        })
      }

      return {
        valid: errors.length === 0,
        errors,
      }
    },
  },
}

export const octopusManagedSiteCapabilities = {
  channels: octopusManagedSiteChannels,
  resources: octopusManagedUpstreamResources,
  config: octopusManagedSiteConfig,
  queries: octopusManagedSiteQueries,
  channelDrafts: octopusManagedSiteChannelDrafts,
}
