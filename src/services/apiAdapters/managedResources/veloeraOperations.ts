import { VeloeraChannelStatus } from "~/constants/veloera"
import { hasUsableApiTokenKey as hasUsableManagedSiteChannelKey } from "~/services/accountTokens/apiTokenKey"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type {
  ManagedSiteChannelRequestOptions,
  ManagedSitePaginatedChannelRequestOptions,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { requireNumericManagedResourceId } from "~/services/apiAdapters/managedResources/matchingInputs"
import { toManagedModelChannelList } from "~/services/apiAdapters/managedResources/modelInputs"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchDraftChannelModels,
  listAllChannels,
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
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import type {
  VeloeraCreateChannelPayload,
  VeloeraUpdateChannelPayload,
} from "~/types/veloera"
import type { VeloeraConfig } from "~/types/veloeraConfig"
import { getErrorMessage } from "~/utils/core/error"

import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
  runManagedSiteApiServiceMutationStep,
  toManagedSiteApiServiceRequest,
} from "../managedSites/request"

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
  options?: ManagedSiteChannelRequestOptions
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
  options?: ManagedSiteChannelRequestOptions,
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
  options?: ManagedSiteChannelRequestOptions,
) => {
  const hydratedCandidates: T[] = []

  for (const candidate of candidates) {
    if (hasUsableManagedSiteChannelKey(candidate.key ?? "")) {
      hydratedCandidates.push(candidate)
      continue
    }

    const key = await fetchSecretKey(
      config,
      requireNumericManagedResourceId(candidate.id),
      options,
    )
    hydratedCandidates.push({ ...candidate, key })
  }

  return hydratedCandidates
}

export const veloeraChannelOperations = {
  list: async (
    config: VeloeraConfig,
    options?: ManagedSitePaginatedChannelRequestOptions,
  ) =>
    await listAllChannels(
      toManagedSiteApiServiceRequest(config, options),
      options,
    ),
  get: async (
    config: VeloeraConfig,
    channelId: number,
    options?: ManagedSiteChannelRequestOptions,
  ) =>
    await fetchChannel(
      toManagedSiteApiServiceRequest(config, options),
      channelId,
      options,
    ),
  create: async (
    config: VeloeraConfig,
    channelData: VeloeraCreateChannelPayload,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const step = await runVeloeraResponseStep({
      config,
      options,
      sequence,
      effect: createManagedSiteChannelEffect("resource-created"),
      execute: async (request) => await createChannel(request, channelData),
    })
    return finishManagedSiteMutationStep(sequence, step)
  },
  update: async (
    config: VeloeraConfig,
    channelData: VeloeraUpdateChannelPayload,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const step = await runVeloeraResponseStep({
      config,
      options,
      sequence,
      effect: createManagedSiteChannelEffect(
        "resource-updated",
        channelData.id,
      ),
      execute: async (request) => await updateChannel(request, channelData),
    })
    return finishManagedSiteMutationStep(sequence, step)
  },
  delete: async (
    config: VeloeraConfig,
    channelId: number,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const step = await runVeloeraResponseStep({
      config,
      options,
      sequence,
      effect: createManagedSiteChannelEffect("resource-deleted", channelId),
      execute: async (request) => await deleteChannel(request, channelId),
    })
    return step.outcome === "applied"
      ? sequence.finish<void>({ finalState: "confirmed", data: undefined })
      : finishManagedSiteMutationStep<void>(sequence, step)
  },
  fetchSecretKey,
  hydrateComparableKeys,
}

export const veloeraManagedResourceModels = {
  list: async (config, options) =>
    toManagedModelChannelList(
      await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      ),
      [
        VeloeraChannelStatus.ManuallyDisabled,
        VeloeraChannelStatus.AutoDisabled,
      ],
    ),
  fetchModels: async (
    config,
    channelId,
    options?: ManagedSiteChannelRequestOptions,
  ) =>
    await fetchChannelModels(
      toManagedSiteApiServiceRequest(config, options),
      channelId,
      options,
    ),
  fetchDraftModels: async (
    config,
    probe,
    options?: ManagedSiteChannelRequestOptions,
  ) =>
    await fetchDraftChannelModels(
      toManagedSiteApiServiceRequest(config, options),
      {
        type: Number(probe.channelType),
        baseUrl: probe.baseUrl,
        key: probe.credential,
      },
      options,
    ),
  updateModels: async (
    config,
    channelId,
    models,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
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
    options?: ManagedSiteChannelRequestOptions,
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
} satisfies ManagedResourceModelsCapability<VeloeraConfig>
