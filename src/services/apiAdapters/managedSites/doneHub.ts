import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  requireNumericManagedResourceId,
  toManagedResourceMatchList,
} from "~/services/apiAdapters/managedResources/matchingInputs"
import { toManagedModelChannelList } from "~/services/apiAdapters/managedResources/modelInputs"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchChannelRaw,
  fetchDraftChannelModels,
  fetchSiteUserGroups,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateDoneHubChannelFields,
} from "~/services/apiService/doneHub"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import {
  createManagedSiteMutationSequence,
  toManagedSiteMutationDiagnostic,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  checkValidDoneHubConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import { getErrorMessage } from "~/utils/core/error"

import { createManagedSiteConfigCapability } from "./config"
import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
  runManagedSiteApiServiceMutationStep,
  toManagedSiteApiServiceRequest,
} from "./request"

const toDoneHubMutationResponse = (response: ApiResponse<unknown>) =>
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

const runDoneHubResponseStep = async (input: {
  config: DoneHubConfig
  options?: Pick<RequestInit, "signal"> & {
    bypassSiteRequestLimit?: boolean
  }
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(request: ApiServiceRequest): Promise<ApiResponse<unknown>>
}) =>
  await runManagedSiteApiServiceMutationStep({
    ...input,
    classifyResponse: toDoneHubMutationResponse,
    classifyResponseError: (error) => {
      throw error
    },
  })

const fetchDoneHubMutationPayload = async (
  config: DoneHubConfig,
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>,
  channelId: number,
  options?: Pick<RequestInit, "signal"> & {
    bypassSiteRequestLimit?: boolean
  },
) => {
  try {
    return {
      outcome: "applied" as const,
      data: await fetchChannelRaw(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        options,
      ),
    }
  } catch (error) {
    const attempt = sequence.beginStep()
    attempt.complete()
    return {
      outcome: "rejected" as const,
      result: sequence.finish({
        finalState: "unconfirmed",
        diagnostic: toManagedSiteMutationDiagnostic(error),
      }),
    }
  }
}

const fetchSecretKey = async (config: DoneHubConfig, channelId: number) => {
  const channel = await fetchChannel(
    toManagedSiteApiServiceRequest(config),
    channelId,
  )
  return channel.key
}

const hydrateComparableKeys = async <T extends ManagedResourceMatchCandidate>(
  config: DoneHubConfig,
  candidates: T[],
) => {
  const hydratedCandidates: T[] = []

  for (const candidate of candidates) {
    if (hasUsableManagedSiteChannelKey(candidate.key)) {
      hydratedCandidates.push(candidate)
      continue
    }

    const key = await fetchSecretKey(
      config,
      requireNumericManagedResourceId(candidate.id),
    )
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
    create: async (config, channelData) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runDoneHubResponseStep({
        config,
        sequence,
        effect: createManagedSiteChannelEffect("resource-created"),
        execute: async (request) => await createChannel(request, channelData),
      })
      return finishManagedSiteMutationStep(sequence, step)
    },
    update: async (config, channelData) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runDoneHubResponseStep({
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
      const step = await runDoneHubResponseStep({
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
  }

export const doneHubManagedResourceModels: ManagedResourceModelsCapability<DoneHubConfig> =
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
      const preflight = await fetchDoneHubMutationPayload(
        config,
        sequence,
        channelId,
        options,
      )
      if (preflight.outcome === "rejected") return preflight.result
      const step = await runDoneHubResponseStep({
        config,
        options,
        sequence,
        effect: createManagedSiteChannelEffect("models-updated", channelId),
        execute: async (request) =>
          await updateDoneHubChannelFields(
            request,
            { ...preflight.data, models: models.join(",") },
            options,
          ),
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: undefined })
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
      const preflight = await fetchDoneHubMutationPayload(
        config,
        sequence,
        channelId,
        options,
      )
      if (preflight.outcome === "rejected") return preflight.result
      const step = await runDoneHubResponseStep({
        config,
        options,
        sequence,
        effect: createManagedSiteChannelEffect(
          "model-mapping-updated",
          channelId,
        ),
        execute: async (request) =>
          await updateDoneHubChannelFields(
            request,
            {
              ...preflight.data,
              models: models.join(","),
              model_mapping: JSON.stringify(modelMapping),
            },
            options,
          ),
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: undefined })
        : finishManagedSiteMutationStep(sequence, step)
    },
  }

const doneHubManagedSiteConfig: ManagedSiteConfigCapability<DoneHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.DONE_HUB,
    checkValidDoneHubConfig,
  )

const doneHubKeyManagement = createNewApiKeyManagement(SITE_TYPES.DONE_HUB)

const doneHubManagedSiteQueries: ManagedSiteQueriesCapability<DoneHubConfig> = {
  siteUserGroups: {
    fetch: async (config) =>
      await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  },
  accountAvailableModels: {
    fetch: async (config) =>
      await doneHubKeyManagement.fetchAvailableModels(
        toManagedSiteApiServiceRequest(config),
      ),
  },
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
}

const matching: ManagedResourceMatchingCapability<DoneHubConfig> = {
  fetchSecretKey: async (config, id) =>
    fetchSecretKey(config, requireNumericManagedResourceId(id)),
  hydrateComparableKeys,
  search: async (config, keyword) =>
    toManagedResourceMatchList(
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
    ),
}

export const doneHubManagedSiteCapabilities = {
  matching,
  channels: doneHubManagedSiteChannels,
  models: doneHubManagedResourceModels,
  config: doneHubManagedSiteConfig,
  queries: doneHubManagedSiteQueries,
  channelDrafts: doneHubManagedSiteChannelDrafts,
}
