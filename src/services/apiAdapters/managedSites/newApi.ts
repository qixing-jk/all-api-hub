import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelRequestOptions,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  requireNumericManagedResourceId,
  toManagedResourceMatchList,
} from "~/services/apiAdapters/managedResources/matchingInputs"
import { toManagedModelChannelList } from "~/services/apiAdapters/managedResources/modelInputs"
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
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationSequence,
  type ManagedSiteMutationStepRunResult,
  type ManagedSiteVoidMutationResult,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  checkValidNewApiConfig,
  fetchAvailableModels,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  prepareChannelFormData,
} from "~/services/managedSites/providers/newApi"
import type {
  CreateChannelPayload,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type { NewApiConfig } from "~/types/newApiConfig"
import { getErrorMessage } from "~/utils/core/error"

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
  }

export const newApiManagedResourceModels: ManagedResourceModelsCapability<NewApiConfig> =
  {
    list: async (config, options) =>
      toManagedModelChannelList(
        await listAllChannels(
          toManagedSiteApiServiceRequest(config, options),
          options,
        ),
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
  siteUserGroups: {
    fetch: async (
      config: NewApiConfig,
      options?: Pick<ManagedSiteChannelRequestOptions, "signal">,
    ) =>
      await fetchSiteUserGroups(
        toManagedSiteApiServiceRequest(config, options),
      ),
  },
  accountAvailableModels: {
    fetch: async (config) =>
      await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
  },
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
}

const matching: ManagedResourceMatchingCapability<NewApiConfig> = {
  hydrateComparableKeys: async (config, candidates, options) =>
    hydrateComparableChannelKeys(
      config,
      candidates,
      requireProtectionBypassExecution(options),
    ),
  search: async (config, keyword) =>
    toManagedResourceMatchList(
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
    ),
  fetchSecretKey: async (config, id, options) =>
    await newApiManagedSiteChannels.fetchSecretKey!(
      config,
      requireNumericManagedResourceId(id),
      options,
    ),
}

export const newApiManagedSiteCapabilities = {
  matching,
  channels: newApiManagedSiteChannels,
  models: newApiManagedResourceModels,
  config: newApiManagedSiteConfig,
  queries: newApiManagedSiteQueries,
  channelDrafts: newApiManagedSiteChannelDrafts,
}
