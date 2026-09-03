import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
} from "~/services/apiService/veloera"
import { ApiError } from "~/services/apiTransport/errors"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import {
  createManagedSiteMutationSequence,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidVeloeraConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  ChannelFormData,
  ManagedSiteChannel,
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
import { CHANNEL_STATUS } from "~/types/newApi"
import type { VeloeraConfig } from "~/types/veloeraConfig"
import { getErrorMessage } from "~/utils/core/error"

import { createManagedSiteConfigCapability } from "./config"
import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
  runManagedSiteApiServiceMutationStep,
  toManagedSiteApiServiceRequest,
} from "./request"

const toVeloeraMutationResponse = (response: ApiResponse<unknown>) =>
  response.success
    ? { outcome: "applied" as const, data: response.data }
    : {
        outcome: "rejected" as const,
        diagnostic: {
          message: getErrorMessage(
            response.message,
            "Provider rejected the mutation",
          ),
          raw: response,
        },
      }

const toVeloeraResponseError = (error: unknown) => {
  if (
    error instanceof ApiError &&
    error.code === undefined &&
    error.statusCode === undefined &&
    error.cause === undefined
  ) {
    return {
      outcome: "rejected" as const,
      diagnostic: { message: error.message, raw: error },
    }
  }
  throw error
}

const runVeloeraResponseStep = async (input: {
  config: VeloeraConfig
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(request: ApiServiceRequest): Promise<ApiResponse<unknown>>
}) =>
  await runManagedSiteApiServiceMutationStep({
    ...input,
    classifyResponse: toVeloeraMutationResponse,
    classifyResponseError: (error) => {
      throw error
    },
  })

const runVeloeraVoidStep = async (input: {
  config: VeloeraConfig
  options?: { bypassSiteRequestLimit?: boolean }
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(request: ApiServiceRequest): Promise<void>
}) =>
  await runManagedSiteApiServiceMutationStep({
    ...input,
    classifyResponse: () => ({ outcome: "applied", data: undefined }),
    classifyResponseError: toVeloeraResponseError,
  })

const fetchSecretKey = async (config: VeloeraConfig, channelId: number) => {
  const channel = await fetchChannel(
    toManagedSiteApiServiceRequest(config),
    channelId,
  )
  return channel.key
}

const hydrateComparableKeys = async (
  config: VeloeraConfig,
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

export const veloeraManagedSiteChannels: ManagedSiteChannelsCapability<VeloeraConfig> =
  {
    search: async (config, keyword) =>
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
    list: async (config, options) =>
      await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      ),
    create: async (config, channelData) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect("resource-created"),
        execute: async (request) => await createChannel(request, channelData),
      })
      return finishManagedSiteMutationStep(sequence, step)
    },
    update: async (config, channelData) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect(
          "resource-updated",
          channelData.id,
        ),
        execute: async (request) => await updateChannel(request, channelData),
      })
      return finishManagedSiteMutationStep(sequence, step)
    },
    delete: async (config, channelId) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect("resource-deleted", channelId),
        execute: async (request) => await deleteChannel(request, channelId),
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: undefined })
        : finishManagedSiteMutationStep(sequence, step)
    },
    fetchSecretKey,
    hydrateComparableKeys,
    fetchModels: async (config, channelId, options) =>
      await fetchChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        options,
      ),
    updateModels: async (config, channelId, models, options) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraVoidStep({
        config,
        options,
        sequence,
        effect: createManagedSiteChannelEffect("models-updated", channelId),
        execute: async (request) =>
          await updateChannelModels(
            request,
            channelId,
            models.join(","),
            options,
          ),
      })
      return finishManagedSiteMutationStep(sequence, step)
    },
    updateModelMapping: async (
      config,
      channelId,
      models,
      modelMapping,
      options,
    ) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraVoidStep({
        config,
        options,
        sequence,
        effect: createManagedSiteChannelEffect(
          "model-mapping-updated",
          channelId,
        ),
        execute: async (request) =>
          await updateChannelModelMapping(
            request,
            channelId,
            models.join(","),
            JSON.stringify(modelMapping),
            options,
          ),
      })
      return finishManagedSiteMutationStep(sequence, step)
    },
  }

const veloeraManagedSiteConfig: ManagedSiteConfigCapability<VeloeraConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.VELOERA, checkValidVeloeraConfig)

const veloeraManagedSiteQueries: ManagedSiteQueriesCapability<VeloeraConfig> = {
  fetchSiteUserGroups: async (config) =>
    await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  fetchAccountAvailableModels: async (config) =>
    await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
}

const fetchVeloeraManagedSiteAvailableModels: ManagedSiteChannelDraftsCapability["fetchAvailableModels"] =
  async (account, token) =>
    await fetchAvailableModels(account, token, {
      fetchAccountAvailableModels,
    })

const veloeraManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels: fetchVeloeraManagedSiteAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const assertVeloeraResourceRef = (
  config: VeloeraConfig,
  ref: ManagedUpstreamResourceRef,
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.VELOERA,
    scopeKey: config.baseUrl,
  })

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

const toVeloeraResourceSummary = (
  config: VeloeraConfig,
  channel: ManagedSiteChannel,
): ManagedUpstreamResourceSummary => {
  const models = splitDelimitedValues(channel.models)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.VELOERA,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(config.baseUrl),
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

const toVeloeraResourceListData = (
  config: VeloeraConfig,
  channels: ManagedSiteChannel[],
  total: number,
) => ({
  items: channels.map((channel) => toVeloeraResourceSummary(config, channel)),
  total,
})

const fetchVeloeraChannelByRef = async (
  config: VeloeraConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<ManagedSiteChannel> => {
  assertVeloeraResourceRef(config, ref)
  return await fetchChannel(
    toManagedSiteApiServiceRequest(config),
    Number(ref.resourceId),
  )
}

const prepareVeloeraEditDraft = (
  detail: ManagedUpstreamResourceDetail<ManagedSiteChannel>,
): ChannelFormData => {
  const channel = detail.native

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

const veloeraResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
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

const toVeloeraUpdatePayload = (
  detail: ManagedUpstreamResourceDetail<ManagedSiteChannel>,
  draft: ChannelFormData,
): UpdateChannelPayload => {
  const native = detail.native
  const payload: UpdateChannelPayload = {
    ...native,
    id: native.id,
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

const veloeraManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  VeloeraConfig,
  ManagedSiteChannel,
  ChannelFormData
> = {
  items: {
    list: async (config, options) => {
      const list = await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      )

      return toVeloeraResourceListData(config, list.items ?? [], list.total)
    },
    search: async (config, keyword) => {
      const list = await searchChannel(
        toManagedSiteApiServiceRequest(config),
        keyword,
      )

      if (!list) {
        return null
      }

      return toVeloeraResourceListData(config, list.items ?? [], list.total)
    },
    getDetail: async (config, ref) => {
      const channel = await fetchVeloeraChannelByRef(config, ref)
      return {
        summary: toVeloeraResourceSummary(config, channel),
        native: channel,
      }
    },
    create: async (config, draft) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect("resource-created"),
        execute: async (request) =>
          await createChannel(request, buildChannelPayload(draft)),
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: null })
        : finishManagedSiteMutationStep(sequence, step)
    },
    update: async (config, detail, draft) => {
      const payload = toVeloeraUpdatePayload(detail, draft)
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect("resource-updated", payload.id),
        execute: async (request) => await updateChannel(request, payload),
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: null })
        : finishManagedSiteMutationStep(sequence, step)
    },
    delete: async (config, ref) => {
      assertVeloeraResourceRef(config, ref)
      const resourceId = Number(ref.resourceId)
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runVeloeraResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect("resource-deleted", resourceId),
        execute: async (request) => await deleteChannel(request, resourceId),
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: undefined })
        : finishManagedSiteMutationStep(sequence, step)
    },
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
    prepareEditDraft: prepareVeloeraEditDraft,
    describeFields: () => veloeraResourceFieldDescriptors,
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
          status: MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available,
          secret: secret.trim(),
        }
      }

      return {
        status: secret?.trim()
          ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked
          : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Unavailable,
      }
    },
  },
}

export const veloeraManagedSiteCapabilities = {
  channels: veloeraManagedSiteChannels,
  resources: veloeraManagedUpstreamResources,
  config: veloeraManagedSiteConfig,
  queries: veloeraManagedSiteQueries,
  channelDrafts: veloeraManagedSiteChannelDrafts,
}
