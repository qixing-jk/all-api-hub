import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchChannelRaw,
  fetchSiteUserGroups,
  listAllChannels,
  normalizeDoneHubChannel,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
  type DoneHubChannelRaw,
} from "~/services/apiService/doneHub"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidDoneHubConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type {
  ChannelFormData,
  ManagedSiteChannel,
  UpdateChannelPayload,
} from "~/types/managedSite"
import {
  createManagedUpstreamResourceRef,
  MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES,
  MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS,
  MANAGED_UPSTREAM_RESOURCE_SECRET_STATES,
  MANAGED_UPSTREAM_RESOURCE_STATUSES,
  type ManagedUpstreamResourceDetail,
  type ManagedUpstreamResourceFieldDescriptor,
  type ManagedUpstreamResourceRef,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"
import { CHANNEL_STATUS } from "~/types/newApi"

import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

const fetchSecretKey = async (config: DoneHubConfig, channelId: number) => {
  const channel = await fetchChannel(
    toManagedSiteApiServiceRequest(config),
    channelId,
  )
  return channel.key
}

const hydrateComparableKeys = async (
  config: DoneHubConfig,
  candidates: ManagedSiteChannel[],
) => {
  const hydratedCandidates: ManagedSiteChannel[] = []

  for (const candidate of candidates) {
    if (hasUsableManagedSiteChannelKey(candidate.key)) {
      hydratedCandidates.push(candidate)
      continue
    }

    const key = await fetchSecretKey(config, candidate.id)
    hydratedCandidates.push({ ...candidate, key })
  }

  return hydratedCandidates
}

export const doneHubManagedSiteChannels: ManagedSiteChannelsCapability<DoneHubConfig> =
  {
    search: async (config, keyword) =>
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
    list: async (config, options) =>
      await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      ),
    create: async (config, channelData) =>
      await createChannel(toManagedSiteApiServiceRequest(config), channelData),
    update: async (config, channelData) =>
      await updateChannel(toManagedSiteApiServiceRequest(config), channelData),
    delete: async (config, channelId) =>
      await deleteChannel(toManagedSiteApiServiceRequest(config), channelId),
    fetchSecretKey,
    hydrateComparableKeys,
    fetchModels: async (config, channelId, options) =>
      await fetchChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        options,
      ),
    updateModels: async (config, channelId, models, options) =>
      await updateChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        models.join(","),
        options,
      ),
    updateModelMapping: async (
      config,
      channelId,
      models,
      modelMapping,
      options,
    ) =>
      await updateChannelModelMapping(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        models.join(","),
        JSON.stringify(modelMapping),
        options,
      ),
  }

const doneHubManagedSiteConfig: ManagedSiteConfigCapability<DoneHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.DONE_HUB,
    checkValidDoneHubConfig,
  )

const doneHubKeyManagement = createNewApiKeyManagement(SITE_TYPES.DONE_HUB)

const doneHubManagedSiteQueries: ManagedSiteQueriesCapability<DoneHubConfig> = {
  fetchSiteUserGroups: async (config) =>
    await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  fetchAccountAvailableModels: async (config) =>
    await doneHubKeyManagement.fetchAvailableModels(
      toManagedSiteApiServiceRequest(config),
    ),
}

const fetchDoneHubManagedSiteAvailableModels: ManagedSiteChannelDraftsCapability["fetchAvailableModels"] =
  async (account, token) =>
    await fetchAvailableModels(account, token, {
      fetchAccountAvailableModels: doneHubKeyManagement.fetchAvailableModels,
    })

const doneHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels: fetchDoneHubManagedSiteAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const normalizeResourceScopeKey = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    return ""
  }

  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed.replace(/\/+$/, "")
  }
}

const toResourceStatus = (status: ManagedSiteChannel["status"]) => {
  switch (status) {
    case CHANNEL_STATUS.Enable:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled
    case CHANNEL_STATUS.ManuallyDisabled:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Disabled
    case CHANNEL_STATUS.AutoDisabled:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.AutoDisabled
    case CHANNEL_STATUS.Unknown:
    default:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Unknown
  }
}

const toSecretState = (key?: string | null) =>
  hasUsableManagedSiteChannelKey(key)
    ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available
    : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked

const splitDelimitedValues = (value?: string | null): string[] =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? []

type DoneHubResourceDetailNative = DoneHubChannelRaw

const toNormalizedDoneHubChannel = (
  native: DoneHubResourceDetailNative,
): ManagedSiteChannel => normalizeDoneHubChannel(native)

const toDoneHubResourceSummary = (
  config: DoneHubConfig,
  channel: ManagedSiteChannel,
): ManagedUpstreamResourceSummary => {
  const models = splitDelimitedValues(channel.models)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.DONE_HUB,
      scopeKey: normalizeResourceScopeKey(config.baseUrl),
      resourceId: channel.id,
    }),
    displayName: channel.name,
    nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
    status: toResourceStatus(channel.status),
    typeLabel: String(channel.type),
    endpointLabel: channel.base_url,
    modelCount: models.length,
    modelPreview: models.slice(0, 3),
    secretState: toSecretState(channel.key),
    capabilities: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRevealSecret: true,
    },
  }
}

const toDoneHubResourceListData = (
  config: DoneHubConfig,
  channels: ManagedSiteChannel[],
  total: number,
) => ({
  items: channels.map((channel) => toDoneHubResourceSummary(config, channel)),
  total,
})

const fetchDoneHubChannelByRef = async (
  config: DoneHubConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<DoneHubResourceDetailNative> =>
  await fetchChannelRaw(
    toManagedSiteApiServiceRequest(config),
    Number(ref.resourceId),
  )

const prepareDoneHubEditDraft = (
  detail: ManagedUpstreamResourceDetail<DoneHubResourceDetailNative>,
): ChannelFormData => {
  const channel = toNormalizedDoneHubChannel(detail.native)

  return {
    name: channel.name,
    type: channel.type,
    key: channel.key,
    base_url: channel.base_url || "",
    models: splitDelimitedValues(channel.models),
    groups: splitDelimitedValues(channel.group),
    priority: channel.priority,
    weight: channel.weight,
    status: channel.status,
  }
}

const doneHubResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
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
      required: true,
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
    {
      name: "groups",
      label: "Groups",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.MultiSelect,
    },
  ]

const toDoneHubUpdatePayload = (
  detail: ManagedUpstreamResourceDetail<DoneHubResourceDetailNative>,
  draft: ChannelFormData,
): UpdateChannelPayload & Record<string, unknown> => {
  const native = detail.native
  const channel = toNormalizedDoneHubChannel(native)
  const payload: UpdateChannelPayload & Record<string, unknown> = {
    ...native,
    id: channel.id,
    name: draft.name,
    type: draft.type,
    base_url: draft.base_url,
    models: draft.models.join(","),
    groups: draft.groups,
    group: draft.groups.join(","),
    priority: draft.priority,
    weight: draft.weight,
    status: draft.status,
  }

  if (hasUsableManagedSiteChannelKey(draft.key)) {
    payload.key = draft.key.trim()
  } else {
    delete payload.key
  }

  return payload
}

const toResourceMutationResponse = async (
  response: ReturnType<typeof createChannel> | ReturnType<typeof updateChannel>,
) => {
  const resolvedResponse = await response
  return {
    ...resolvedResponse,
    data: resolvedResponse.data ?? null,
  }
}

const doneHubManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  DoneHubConfig,
  DoneHubResourceDetailNative,
  ChannelFormData
> = {
  items: {
    list: async (config, options) => {
      const list = await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      )

      return toDoneHubResourceListData(config, list.items ?? [], list.total)
    },
    search: async (config, keyword) => {
      const list = await searchChannel(
        toManagedSiteApiServiceRequest(config),
        keyword,
      )

      if (!list) {
        return null
      }

      return toDoneHubResourceListData(config, list.items ?? [], list.total)
    },
    getDetail: async (config, ref) => {
      const native = await fetchDoneHubChannelByRef(config, ref)
      const channel = toNormalizedDoneHubChannel(native)
      return {
        summary: toDoneHubResourceSummary(config, channel),
        native,
      }
    },
    create: async (config, draft) =>
      await toResourceMutationResponse(
        createChannel(
          toManagedSiteApiServiceRequest(config),
          buildChannelPayload(draft),
        ),
      ),
    update: async (config, detail, draft) =>
      await toResourceMutationResponse(
        updateChannel(
          toManagedSiteApiServiceRequest(config),
          toDoneHubUpdatePayload(detail, draft),
        ),
      ),
    delete: async (config, ref) =>
      await deleteChannel(
        toManagedSiteApiServiceRequest(config),
        Number(ref.resourceId),
      ),
  },
  drafts: {
    prepareImportDraft: async (input) => {
      if (input.source && typeof input.source === "object") {
        return input.source as ChannelFormData
      }

      return {
        name: input.resource?.displayName ?? "",
        type: 1,
        key: "",
        base_url: input.resource?.endpointLabel ?? "",
        models: input.resource?.modelPreview ?? [],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }
    },
    prepareEditDraft: prepareDoneHubEditDraft,
    describeFields: () => doneHubResourceFieldDescriptors,
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
  secrets: {
    revealSecret: async (config, ref) => {
      const secret = await fetchSecretKey(config, Number(ref.resourceId))
      if (hasUsableManagedSiteChannelKey(secret)) {
        return {
          status: "available",
          secret: secret.trim(),
        }
      }

      return {
        status: secret?.trim() ? "masked" : "unavailable",
      }
    },
  },
}

export const doneHubManagedSiteCapabilities = {
  channels: doneHubManagedSiteChannels,
  resources: doneHubManagedUpstreamResources,
  config: doneHubManagedSiteConfig,
  queries: doneHubManagedSiteQueries,
  channelDrafts: doneHubManagedSiteChannelDrafts,
}
