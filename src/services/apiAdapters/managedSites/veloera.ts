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
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchDraftChannelModels,
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
  checkValidVeloeraConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
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
      diagnostic: {
        message: getErrorMessage(error, "Provider rejected the mutation"),
        raw: error,
      },
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

const fetchSecretKey = async (
  config: VeloeraConfig,
  channelId: number,
  options?: Pick<RequestInit, "signal">,
) => {
  const request = toManagedSiteApiServiceRequest(config, options)
  const channel = options
    ? await fetchChannel(request, channelId, options)
    : await fetchChannel(request, channelId)
  return channel.key
}

const hydrateComparableKeys = async <T extends ManagedResourceMatchCandidate>(
  config: VeloeraConfig,
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

export const veloeraManagedSiteChannels: ManagedSiteChannelsCapability<VeloeraConfig> =
  {
    search: async (config, keyword) =>
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
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
  }

export const veloeraManagedResourceModels: ManagedResourceModelsCapability<VeloeraConfig> =
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
  siteUserGroups: {
    fetch: async (config) =>
      await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  },
  accountAvailableModels: {
    fetch: async (config) =>
      await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
  },
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
}

const matching: ManagedResourceMatchingCapability<VeloeraConfig> = {
  fetchSecretKey: async (config, id) =>
    fetchSecretKey(config, requireNumericManagedResourceId(id)),
  hydrateComparableKeys,
  search: async (config) =>
    toManagedResourceMatchList(
      await listAllChannels(toManagedSiteApiServiceRequest(config), {
        requireCompleteInventory: true,
      }),
    ),
}

export const veloeraManagedSiteCapabilities = {
  matching,
  channels: veloeraManagedSiteChannels,
  models: veloeraManagedResourceModels,
  config: veloeraManagedSiteConfig,
  queries: veloeraManagedSiteQueries,
  channelDrafts: veloeraManagedSiteChannelDrafts,
}
