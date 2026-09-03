import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelRequestOptions,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchDraftChannelModels,
  isNewApiManualStatus,
  listAllChannels,
  searchChannel,
  updateChannelFields,
  updateChannelStatus,
} from "~/services/apiService/newApiFamily/channelManagement"
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import {
  createManagedSiteMutationSequence,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_FINAL_STATES,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationSequence,
  type ManagedSiteMutationStepRunResult,
  type ManagedSiteVoidMutationResult,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidNewApiConfig,
  fetchAvailableModels,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  prepareChannelFormData,
} from "~/services/managedSites/providers/newApi"
import { buildNewApiUpdatePayload } from "~/services/managedSites/providers/newApiChannelPayload"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  ChannelFormData,
  CreateChannelPayload,
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
import type { NewApiConfig } from "~/types/newApiConfig"
import { getErrorMessage } from "~/utils/core/error"
import { parseDelimitedList } from "~/utils/core/string"

import { createManagedSiteConfigCapability } from "./config"
import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
  runManagedSiteApiServiceMutationStep,
  toManagedSiteApiServiceRequest,
} from "./request"

const NEW_API_MUTATION_STEP_OUTCOMES = {
  Applied: "applied",
  Rejected: "rejected",
} as const

const toNewApiMutationResponse = <TData>(response: ApiResponse<TData>) =>
  response.success
    ? { outcome: NEW_API_MUTATION_STEP_OUTCOMES.Applied, data: response.data }
    : {
        outcome: NEW_API_MUTATION_STEP_OUTCOMES.Rejected,
        diagnostic: {
          message: getErrorMessage(
            response.message,
            "Provider rejected the mutation",
          ),
          raw: response,
        },
      }

const runNewApiMutationStep = async <TData>(input: {
  config: NewApiConfig
  options?: Pick<
    ManagedSiteChannelRequestOptions,
    "signal" | "bypassSiteRequestLimit"
  >
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(request: ApiServiceRequest): Promise<ApiResponse<TData>>
}): Promise<ManagedSiteMutationStepRunResult<TData>> =>
  await runManagedSiteApiServiceMutationStep<
    ManagedSiteMutationConfirmedEffect,
    ApiResponse<TData>,
    TData
  >({
    ...input,
    classifyResponse: (response) => toNewApiMutationResponse(response),
    classifyResponseError: (error) => {
      throw error
    },
  })

const requireProtectionBypassExecution = (
  options: Parameters<typeof fetchChannelSecretKey>[2] | undefined,
) => {
  if (!options?.protectionBypassExecution) {
    throw new Error("New API hidden-key session reads require explicit intent")
  }
  return options
}

type NewApiMutationOptions = Pick<
  ManagedSiteChannelRequestOptions,
  "signal" | "bypassSiteRequestLimit"
>

const runNewApiChannelCreateMutation = async (
  config: NewApiConfig,
  channelData: CreateChannelPayload,
  options?: NewApiMutationOptions,
) => {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const step = await runNewApiMutationStep<void>({
    config,
    options,
    sequence,
    effect: createManagedSiteChannelEffect(
      MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
    ),
    execute: async (request) => await createChannel(request, channelData),
  })
  return finishManagedSiteMutationStep(sequence, step)
}

const runNewApiChannelUpdateMutation = async (
  config: NewApiConfig,
  channelData: UpdateChannelPayload,
  options?: NewApiMutationOptions,
) => {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const fieldsStep = await runNewApiMutationStep<void>({
    config,
    options,
    sequence,
    effect: createManagedSiteChannelEffect(
      MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
      channelData.id,
    ),
    execute: async (request) => await updateChannelFields(request, channelData),
  })
  if (fieldsStep.outcome !== NEW_API_MUTATION_STEP_OUTCOMES.Applied) {
    return finishManagedSiteMutationStep(sequence, fieldsStep)
  }

  const status = channelData.status
  if (typeof status === "number" && isNewApiManualStatus(status)) {
    const statusStep = await runNewApiMutationStep<boolean>({
      config,
      options,
      sequence,
      effect: createManagedSiteChannelEffect(
        MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
        channelData.id,
      ),
      execute: async (request) =>
        await updateChannelStatus(request, channelData.id, status),
    })
    if (statusStep.outcome !== NEW_API_MUTATION_STEP_OUTCOMES.Applied) {
      return finishManagedSiteMutationStep(sequence, statusStep)
    }
  }

  return sequence.finish({
    finalState: MANAGED_SITE_MUTATION_FINAL_STATES.Confirmed,
    data: fieldsStep.data,
  })
}

const runNewApiChannelDeleteMutation = async (
  config: NewApiConfig,
  channelId: number,
  options?: NewApiMutationOptions,
): Promise<ManagedSiteVoidMutationResult> => {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const step = await runNewApiMutationStep<void>({
    config,
    options,
    sequence,
    effect: createManagedSiteChannelEffect(
      MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
      channelId,
    ),
    execute: async (request) => await deleteChannel(request, channelId),
  })
  return step.outcome === NEW_API_MUTATION_STEP_OUTCOMES.Applied
    ? sequence.finish<void>({
        finalState: MANAGED_SITE_MUTATION_FINAL_STATES.Confirmed,
        data: undefined,
      })
    : finishManagedSiteMutationStep(sequence, step)
}

export const newApiManagedSiteChannels: ManagedSiteChannelsCapability<NewApiConfig> =
  {
    search: async (config, keyword, options) =>
      await searchChannel(
        toManagedSiteApiServiceRequest(config, options),
        keyword,
      ),
    list: async (config, options) =>
      await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      ),
    get: async (config, channelId, options) =>
      await fetchChannel(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        options,
      ),
    create: runNewApiChannelCreateMutation,
    update: runNewApiChannelUpdateMutation,
    delete: runNewApiChannelDeleteMutation,
    fetchSecretKey: async (config, channelId, options) =>
      await fetchChannelSecretKey(
        config,
        channelId,
        requireProtectionBypassExecution(options),
      ),
    hydrateComparableKeys: async (config, candidates, options) =>
      await hydrateComparableChannelKeys(
        config,
        candidates,
        requireProtectionBypassExecution(options),
      ),
    fetchModels: async (config, channelId, options) =>
      await fetchChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        options,
      ),
    fetchDraftModels: async (config, probe, options) =>
      await fetchDraftChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        {
          type: Number(probe.channelType),
          baseUrl: probe.baseUrl,
          key: probe.credential,
        },
        options,
      ),
    updateModels: async (config, channelId, models, options) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runNewApiMutationStep({
        config,
        options,
        sequence,
        effect: createManagedSiteChannelEffect(
          MANAGED_SITE_MUTATION_EFFECT_KINDS.ModelsUpdated,
          channelId,
        ),
        execute: async (request) =>
          await updateChannelFields(
            request,
            {
              id: channelId,
              models: models.join(","),
            },
            options,
          ),
      })
      return step.outcome === NEW_API_MUTATION_STEP_OUTCOMES.Applied
        ? sequence.finish({
            finalState: MANAGED_SITE_MUTATION_FINAL_STATES.Confirmed,
            data: undefined,
          })
        : finishManagedSiteMutationStep(sequence, step)
    },
    updateModelMapping: async (
      config,
      channelId,
      models,
      modelMapping,
      options,
    ) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runNewApiMutationStep({
        config,
        options,
        sequence,
        effect: createManagedSiteChannelEffect(
          MANAGED_SITE_MUTATION_EFFECT_KINDS.ModelMappingUpdated,
          channelId,
        ),
        execute: async (request) =>
          await updateChannelFields(
            request,
            {
              id: channelId,
              models: models.join(","),
              model_mapping: JSON.stringify(modelMapping),
            },
            options,
          ),
      })
      return step.outcome === NEW_API_MUTATION_STEP_OUTCOMES.Applied
        ? sequence.finish({
            finalState: MANAGED_SITE_MUTATION_FINAL_STATES.Confirmed,
            data: undefined,
          })
        : finishManagedSiteMutationStep(sequence, step)
    },
  }

const newApiManagedSiteConfig: ManagedSiteConfigCapability<NewApiConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.NEW_API, checkValidNewApiConfig)

const newApiManagedSiteQueries: ManagedSiteQueriesCapability<NewApiConfig> = {
  fetchSiteUserGroups: async (
    config: NewApiConfig,
    options?: Pick<ManagedSiteChannelRequestOptions, "signal">,
  ) =>
    await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config, options)),
  fetchAccountAvailableModels: async (config) =>
    await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
}

const fetchNewApiManagedSiteAvailableModels: ManagedSiteChannelDraftsCapability["fetchAvailableModels"] =
  async (account, token) =>
    await fetchAvailableModels(account, token, {
      fetchAccountAvailableModels,
    })

const newApiManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels: fetchNewApiManagedSiteAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const assertNewApiResourceRef = (
  config: NewApiConfig,
  ref: ManagedUpstreamResourceRef,
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.NEW_API,
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
  parseDelimitedList(value)

const toNewApiResourceSummary = (
  config: NewApiConfig,
  channel: ManagedSiteChannel,
): ManagedUpstreamResourceSummary => {
  const models = splitDelimitedValues(channel.models)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.NEW_API,
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
      canRevealSecret: false,
    },
  }
}

const toNewApiResourceListData = (
  config: NewApiConfig,
  channels: ManagedSiteChannel[],
  total: number,
) => ({
  items: channels.map((channel) => toNewApiResourceSummary(config, channel)),
  total,
})

const findNewApiChannelByRef = async (
  config: NewApiConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<ManagedSiteChannel> => {
  assertNewApiResourceRef(config, ref)

  const list = await listAllChannels(toManagedSiteApiServiceRequest(config))
  const channel = (list.items ?? []).find(
    (item) => String(item.id) === ref.resourceId,
  )

  if (!channel) {
    throw new Error(`Channel ${ref.resourceId} was not found`)
  }

  return channel
}

const prepareNewApiEditDraft = (
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

const newApiResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
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

const newApiManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  NewApiConfig,
  ManagedSiteChannel,
  ChannelFormData
> = {
  items: {
    list: async (config, options) => {
      const list = await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      )

      return toNewApiResourceListData(config, list.items ?? [], list.total)
    },
    search: async (config, keyword) => {
      const list = await searchChannel(
        toManagedSiteApiServiceRequest(config),
        keyword,
      )

      if (!list) {
        return null
      }

      return toNewApiResourceListData(config, list.items ?? [], list.total)
    },
    getDetail: async (config, ref) => {
      const channel = await findNewApiChannelByRef(config, ref)
      return {
        summary: toNewApiResourceSummary(config, channel),
        native: channel,
      }
    },
    create: async (config, draft) => {
      const result = await runNewApiChannelCreateMutation(
        config,
        buildChannelPayload(draft),
      )
      return result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
        ? { ...result, data: null }
        : result
    },
    update: async (config, detail, draft) => {
      const payload = buildNewApiUpdatePayload(detail.native, draft)
      const result = await runNewApiChannelUpdateMutation(config, payload)
      return result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
        ? { ...result, data: null }
        : result
    },
    delete: async (config, ref) => {
      assertNewApiResourceRef(config, ref)
      const resourceId = Number(ref.resourceId)
      return await runNewApiChannelDeleteMutation(config, resourceId)
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
    prepareEditDraft: prepareNewApiEditDraft,
    describeFields: () => newApiResourceFieldDescriptors,
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

export const newApiManagedSiteCapabilities = {
  channels: newApiManagedSiteChannels,
  resources: newApiManagedUpstreamResources,
  config: newApiManagedSiteConfig,
  queries: newApiManagedSiteQueries,
  channelDrafts: newApiManagedSiteChannelDrafts,
}
