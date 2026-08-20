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
  OctopusMutationApiError,
  searchChannels,
  updateChannel as updateOctopusChannel,
} from "~/services/apiService/octopus"
import {
  createManagedSiteMutationSequence,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"
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
  OctopusApiResponse,
  OctopusChannel,
  OctopusCreateChannelInput,
  OctopusUpdateChannelInput,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"

import { createManagedSiteConfigCapability } from "./config"

const toOctopusMutationResponse = <TData>(
  response: OctopusApiResponse<TData>,
) =>
  response.success
    ? { outcome: "applied" as const, data: response.data }
    : {
        outcome: "rejected" as const,
        diagnostic: {
          message: response.message || "Provider rejected the mutation",
          raw: response,
        },
      }

const toOctopusMutationDiagnostic = (error: OctopusMutationApiError) => {
  const diagnosticRaw = error.raw
  const code =
    typeof error.code === "string" ||
    (typeof error.code === "number" && Number.isSafeInteger(error.code))
      ? error.code
      : undefined
  const statusCode =
    typeof error.statusCode === "number" &&
    Number.isSafeInteger(error.statusCode) &&
    error.statusCode >= 100 &&
    error.statusCode <= 599
      ? error.statusCode
      : undefined
  return {
    message: error.message || "Octopus mutation failed",
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    raw: diagnosticRaw,
  }
}

const runOctopusMutation = async <TData, TResult = TData>(input: {
  effect: ManagedSiteMutationConfirmedEffect
  execute(): Promise<OctopusApiResponse<TData>>
  successData?: (data: TData | null | undefined) => TResult
}) => {
  const sequence =
    createManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>({
      idempotent: false,
    })
  const attempt = sequence.beginStep()
  try {
    const response = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    const classified = toOctopusMutationResponse(response)
    if (classified.outcome === "rejected") {
      attempt.confirmNonApplication()
      attempt.complete()
      return sequence.finish({
        finalState: "unconfirmed",
        diagnostic: classified.diagnostic,
      })
    }
    attempt.confirmEffect(input.effect)
    attempt.complete()
    return sequence.finish({
      finalState: "confirmed",
      data: input.successData
        ? input.successData(classified.data)
        : (classified.data as unknown as TResult),
    })
  } catch (error) {
    if (!(error instanceof OctopusMutationApiError)) throw error
    if (error.dispatch === "dispatched") attempt.markPossiblyDispatched()
    if (error.responseReceived) attempt.markResponseReceived()
    if (
      error.confirmedNonApplication &&
      error.dispatch === "dispatched" &&
      error.responseReceived
    ) {
      attempt.confirmNonApplication()
    }
    attempt.complete()
    return sequence.finish({
      finalState: "unconfirmed",
      diagnostic: toOctopusMutationDiagnostic(error),
    })
  }
}

const octopusChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  ...(resourceId === undefined ? {} : { resourceId }),
})

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

const toOctopusCreateInput = (
  channelData: CreateChannelPayload,
): OctopusCreateChannelInput => {
  const channel = channelData.channel
  const type = mapChannelTypeToOctopusOutboundType(
    getNumericChannelType(channel.type),
    true,
  )
  const name = channel.name || ""
  const enabled = channel.status === 1
  const baseUrl = channel.base_url || ""
  const key = channel.key || ""
  const model = channel.models

  return {
    name,
    type,
    enabled,
    baseUrl,
    key,
    model,
    autoSync: true,
  }
}

const toOctopusUpdateInput = (
  channelData: UpdateChannelPayload,
): OctopusUpdateChannelInput => {
  const type =
    channelData.type !== undefined
      ? mapChannelTypeToOctopusOutboundType(
          getNumericChannelType(channelData.type),
          true,
        )
      : undefined
  const enabled =
    "status" in channelData && channelData.status !== undefined
      ? channelData.status === 1
      : undefined
  const baseUrl =
    "base_url" in channelData && channelData.base_url !== undefined
      ? channelData.base_url
      : undefined

  return {
    id: channelData.id,
    name: channelData.name,
    type,
    enabled,
    baseUrl,
    model: channelData.models,
  }
}

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
      return await runOctopusMutation({
        effect: octopusChannelEffect("resource-created"),
        execute: async () =>
          await createOctopusChannel(config, toOctopusCreateInput(channelData)),
      })
    },
    update: async (config, channelData) => {
      return await runOctopusMutation({
        effect: octopusChannelEffect("resource-updated", channelData.id),
        execute: async () =>
          await updateOctopusChannel(config, toOctopusUpdateInput(channelData)),
      })
    },
    updateModels: async (config, channelId, models, options) => {
      return await runOctopusMutation<unknown, void>({
        effect: octopusChannelEffect("models-updated", channelId),
        execute: async () => {
          const payload = {
            id: channelId,
            model: models.join(","),
          }
          return options
            ? await updateOctopusChannel(config, payload, {
                signal: options.signal,
                ...(options.protectionBypassExecution
                  ? {
                      protectionBypassExecution:
                        options.protectionBypassExecution,
                    }
                  : {}),
              })
            : await updateOctopusChannel(config, payload)
        },
        successData: () => undefined,
      })
    },
    delete: async (config, channelId) => {
      return await runOctopusMutation<null, void>({
        effect: octopusChannelEffect("resource-deleted", channelId),
        execute: async () => await deleteOctopusChannel(config, channelId),
        successData: () => undefined,
      })
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

const toOctopusResourceUpdateInput = (
  detail: ManagedUpstreamResourceDetail<OctopusChannel>,
  draft: ChannelFormData,
): OctopusUpdateChannelInput => {
  const native = detail.native
  const type = mapChannelTypeToOctopusOutboundType(
    getNumericChannelType(draft.type),
    true,
  )
  const enabled = draft.status === 1
  const model = draft.models.join(",")

  return {
    id: native.id,
    name: draft.name,
    type,
    enabled,
    baseUrl: draft.base_url,
    model,
    key: hasUsableManagedSiteChannelKey(draft.key.trim())
      ? draft.key.trim()
      : undefined,
    customModel: native.custom_model,
    proxy: native.proxy,
    autoSync: native.auto_sync,
    customHeaders: native.custom_header,
    channelProxy: native.channel_proxy,
    paramOverride: native.param_override,
    matchRegex: native.match_regex,
    source: native,
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
      await runOctopusMutation({
        effect: octopusChannelEffect("resource-created"),
        execute: async () =>
          await createOctopusChannel(
            config,
            toOctopusCreateInput(buildChannelPayload(draft)),
          ),
        successData: (channel) =>
          channel ? toOctopusResourceSummary(config, channel) : null,
      }),
    update: async (config, detail, draft) =>
      await runOctopusMutation({
        effect: octopusChannelEffect("resource-updated", detail.native.id),
        execute: async () =>
          await updateOctopusChannel(
            config,
            toOctopusResourceUpdateInput(detail, draft),
          ),
        successData: (channel) =>
          channel ? toOctopusResourceSummary(config, channel) : null,
      }),
    delete: async (config, ref) => {
      assertOctopusResourceRef(config, ref)
      const resourceId = Number(ref.resourceId)
      return await runOctopusMutation<null, void>({
        effect: octopusChannelEffect("resource-deleted", resourceId),
        execute: async () => await deleteOctopusChannel(config, resourceId),
        successData: () => undefined,
      })
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
