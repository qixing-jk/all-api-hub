import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  AxonHubChannelTypeNames,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  createAxonHubChannel,
  deleteAxonHubChannel,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
} from "~/services/apiService/axonHub"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidAxonHubConfig,
  createChannel,
  deleteChannel,
  fetchAvailableModels,
  listChannels,
  prepareChannelFormData,
  searchChannel,
  updateChannel,
} from "~/services/managedSites/providers/axonHub"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  type AxonHubChannelWithData,
  type ChannelFormData,
  type ManagedSiteChannel,
  type ManagedSiteChannelListData,
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
import { normalizeList } from "~/utils/core/string"

import { createManagedSiteConfigCapability } from "./config"
import { emptyManagedSiteQueries } from "./unsupportedQueries"

export const axonHubManagedSiteChannels: ManagedSiteChannelsCapability<AxonHubConfig> =
  {
    search: searchChannel,
    list: listChannels,
    create: createChannel,
    update: updateChannel,
    delete: deleteChannel,
  }

const axonHubManagedSiteConfig: ManagedSiteConfigCapability<AxonHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.AXON_HUB,
    checkValidAxonHubConfig,
  )

const axonHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const assertAxonHubResourceRef = (
  config: AxonHubConfig,
  ref: ManagedUpstreamResourceRef,
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.AXON_HUB,
    scopeKey: config.baseUrl,
  })

const toAxonHubStatus = (status?: number) =>
  status === CHANNEL_STATUS.Enable
    ? AXON_HUB_CHANNEL_STATUS.ENABLED
    : AXON_HUB_CHANNEL_STATUS.DISABLED

const toChannelStatus = (status: AxonHubChannel["status"]) =>
  status === AXON_HUB_CHANNEL_STATUS.ENABLED
    ? CHANNEL_STATUS.Enable
    : CHANNEL_STATUS.ManuallyDisabled

const getAxonHubCredentialKey = (credentials: AxonHubChannel["credentials"]) =>
  credentials?.apiKeys?.map((key) => key.trim()).find(Boolean) ??
  credentials?.apiKey?.trim() ??
  ""

const getAxonHubCredentialKeys = (
  credentials: AxonHubChannel["credentials"],
) => [
  ...(credentials?.apiKeys ?? []).map((key) => key.trim()).filter(Boolean),
  ...(credentials?.apiKey?.trim() ? [credentials.apiKey.trim()] : []),
]

const getAxonHubModelList = (channel: AxonHubChannel) =>
  normalizeList([
    ...(channel.supportedModels ?? []),
    ...(channel.manualModels ?? []),
  ])

const toAxonHubResourceStatus = (channel: AxonHubChannel) => {
  switch (channel.status) {
    case AXON_HUB_CHANNEL_STATUS.ENABLED:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled
    case AXON_HUB_CHANNEL_STATUS.DISABLED:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Disabled
    default:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Unknown
  }
}

const toAxonHubSecretState = (channel: AxonHubChannel) => {
  const key = getAxonHubCredentialKey(channel.credentials)
  if (!key) {
    return MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Unavailable
  }

  return hasUsableManagedSiteChannelKey(key)
    ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available
    : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked
}

const toAxonHubResourceSummary = (
  config: AxonHubConfig,
  channel: AxonHubChannel,
): ManagedUpstreamResourceSummary => {
  const models = getAxonHubModelList(channel)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(config.baseUrl),
      resourceId: channel.id,
    }),
    displayName: channel.name,
    nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
    status: toAxonHubResourceStatus(channel),
    typeLabel:
      AxonHubChannelTypeNames[
        channel.type as keyof typeof AxonHubChannelTypeNames
      ] ?? String(channel.type),
    endpointLabel: channel.baseURL,
    modelCount: models.length,
    modelPreview: models.slice(0, 3),
    secretState: toAxonHubSecretState(channel),
    capabilities: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRevealSecret: false,
    },
  }
}

const rowToAxonHubNativeChannel = (row: ManagedSiteChannel): AxonHubChannel => {
  const native = (row as Partial<AxonHubChannelWithData>)._axonHubData
  if (native) {
    return native
  }

  throw new Error("AxonHub channel row is missing native channel detail")
}

const toAxonHubResourceListData = (
  config: AxonHubConfig,
  channels: ManagedSiteChannelListData,
) => {
  const nativeChannels = channels.items.map(rowToAxonHubNativeChannel)

  return {
    items: nativeChannels.map((channel) =>
      toAxonHubResourceSummary(config, channel),
    ),
    total: channels.total ?? nativeChannels.length,
  }
}

const findAxonHubChannelByRef = async (
  config: AxonHubConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<AxonHubChannel> => {
  assertAxonHubResourceRef(config, ref)

  const channels = await listChannels(config)
  const channel = channels.items
    .map(rowToAxonHubNativeChannel)
    .find((item) => item.id === ref.resourceId)

  if (!channel) {
    throw new Error(`Channel ${ref.resourceId} was not found`)
  }

  return channel
}

const prepareAxonHubEditDraft = (
  detail: ManagedUpstreamResourceDetail<AxonHubChannel>,
): ChannelFormData => {
  const channel = detail.native

  return {
    name: channel.name,
    type: channel.type,
    key: getAxonHubCredentialKey(channel.credentials),
    base_url: channel.baseURL,
    models: getAxonHubModelList(channel),
    groups: [],
    priority: 0,
    weight: channel.orderingWeight ?? 0,
    status: toChannelStatus(channel.status),
  }
}

const axonHubResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
  [
    {
      name: "name",
      label: "Channel name",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      name: "type",
      label: "Channel type",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: Object.entries(AxonHubChannelTypeNames).map(
        ([value, label]) => ({
          value,
          label,
        }),
      ),
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
      required: true,
    },
  ]

const buildAxonHubCredentialUpdate = (
  native: AxonHubChannel,
  draft: ChannelFormData,
) => {
  const draftKey = draft.key.trim()
  if (hasUsableManagedSiteChannelKey(draftKey)) {
    if (getAxonHubCredentialKeys(native.credentials).includes(draftKey)) {
      return {
        credentials: native.credentials ?? { apiKeys: [draftKey] },
      }
    }

    return {
      credentials: {
        ...(native.credentials ?? {}),
        apiKeys: [draftKey],
      },
    }
  }

  const nativeKey = getAxonHubCredentialKey(native.credentials)
  if (hasUsableManagedSiteChannelKey(nativeKey)) {
    return {
      credentials: native.credentials ?? { apiKeys: [nativeKey] },
    }
  }

  return {}
}

const toAxonHubCreateInput = (
  draft: ChannelFormData,
): AxonHubCreateChannelInput => {
  const models = normalizeList(draft.models)
  return {
    type:
      typeof draft.type === "string" && draft.type.trim()
        ? draft.type
        : AXON_HUB_CHANNEL_TYPE.OPENAI,
    name: draft.name.trim(),
    baseURL: draft.base_url.trim(),
    credentials: {
      apiKeys: [draft.key.trim()].filter(Boolean),
    },
    supportedModels: models,
    manualModels: models,
    defaultTestModel: models[0] ?? "",
    settings: {},
    orderingWeight: draft.weight,
  }
}

const toAxonHubUpdateInput = (
  detail: ManagedUpstreamResourceDetail<AxonHubChannel>,
  draft: ChannelFormData,
): AxonHubUpdateChannelInput => {
  const native = detail.native

  return {
    type:
      typeof draft.type === "string" && draft.type.trim()
        ? draft.type
        : native.type,
    name: draft.name.trim(),
    baseURL: draft.base_url.trim(),
    ...buildAxonHubCredentialUpdate(native, draft),
    supportedModels: native.supportedModels ?? null,
    manualModels: native.manualModels ?? null,
    defaultTestModel: native.defaultTestModel ?? null,
    settings: native.settings ?? null,
    orderingWeight: native.orderingWeight ?? null,
    remark: native.remark ?? null,
  }
}

const isRepresentableAxonHubStatus = (status: AxonHubChannel["status"]) =>
  status === AXON_HUB_CHANNEL_STATUS.ENABLED ||
  status === AXON_HUB_CHANNEL_STATUS.DISABLED

const toAxonHubResourceMutationResponse = (
  config: AxonHubConfig,
  channel: AxonHubChannel,
) => ({
  success: true,
  message: "success",
  data: toAxonHubResourceSummary(config, channel),
})

const axonHubManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  AxonHubConfig,
  AxonHubChannel,
  ChannelFormData
> = {
  items: {
    list: async (config, options) =>
      toAxonHubResourceListData(
        config,
        await listChannels(config, { signal: options?.signal }),
      ),
    search: async (config, keyword) => {
      const channels = await searchChannel(config, keyword)
      return channels ? toAxonHubResourceListData(config, channels) : null
    },
    getDetail: async (config, ref) => {
      const native = await findAxonHubChannelByRef(config, ref)
      return {
        summary: toAxonHubResourceSummary(config, native),
        native,
      }
    },
    create: async (config, draft) => {
      const created = await createAxonHubChannel(
        config,
        toAxonHubCreateInput(draft),
      )
      const finalChannel = { ...created }
      if (draft.status === CHANNEL_STATUS.Enable) {
        await updateAxonHubChannelStatus(
          config,
          created.id,
          AXON_HUB_CHANNEL_STATUS.ENABLED,
        )
        finalChannel.status = AXON_HUB_CHANNEL_STATUS.ENABLED
      }
      return toAxonHubResourceMutationResponse(config, finalChannel)
    },
    update: async (config, detail, draft) => {
      const native = detail.native
      const updated = await updateAxonHubChannel(
        config,
        native.id,
        toAxonHubUpdateInput(detail, draft),
      )
      const finalChannel = { ...updated }
      const requestedStatus = toAxonHubStatus(draft.status)

      if (
        isRepresentableAxonHubStatus(native.status) &&
        native.status !== requestedStatus
      ) {
        await updateAxonHubChannelStatus(config, native.id, requestedStatus)
        finalChannel.status = requestedStatus
      }

      return toAxonHubResourceMutationResponse(config, finalChannel)
    },
    delete: async (config, ref) => {
      assertAxonHubResourceRef(config, ref)
      const deleted = await deleteAxonHubChannel(config, ref.resourceId)
      return {
        success: deleted,
        message: deleted ? "success" : "Failed to delete AxonHub channel",
        data: deleted,
      }
    },
  },
  drafts: {
    prepareImportDraft: async (input) => {
      if (input.source && typeof input.source === "object") {
        return input.source as ChannelFormData
      }

      return {
        name: input.resource?.displayName ?? "",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "",
        base_url: input.resource?.endpointLabel ?? "",
        models: input.resource?.modelPreview ?? [],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }
    },
    prepareEditDraft: prepareAxonHubEditDraft,
    describeFields: () => axonHubResourceFieldDescriptors,
    validateDraft: (draft) => {
      const errors = []
      if (!draft.name.trim()) {
        errors.push({ field: "name", message: "Channel name is required" })
      }
      if (!draft.base_url?.trim()) {
        errors.push({ field: "base_url", message: "Base URL is required" })
      }

      return {
        valid: errors.length === 0,
        errors,
      }
    },
  },
}

export const axonHubManagedSiteCapabilities = {
  channels: axonHubManagedSiteChannels,
  resources: axonHubManagedUpstreamResources,
  config: axonHubManagedSiteConfig,
  queries: emptyManagedSiteQueries,
  channelDrafts: axonHubManagedSiteChannelDrafts,
}
