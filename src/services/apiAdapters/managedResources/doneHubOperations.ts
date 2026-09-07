import { DoneHubChannelStatus } from "~/constants/doneHub"
import { SITE_TYPES } from "~/constants/siteType"
import { hasUsableApiTokenKey as hasUsableManagedSiteChannelKey } from "~/services/accountTokens/apiTokenKey"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type {
  ManagedSiteChannelRequestOptions,
  ManagedSitePaginatedChannelRequestOptions,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { toManagedModelChannelList } from "~/services/apiAdapters/managedResources/modelInputs"
import {
  requireManagedResourceChannelId,
  requireNumericManagedResourceId,
} from "~/services/apiAdapters/managedResources/resourceIds"
import {
  createChannel,
  deleteChannel,
  fetchChannelModels,
  fetchChannelRaw,
  fetchDraftChannelModels,
  listAllChannels,
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
import type {
  DoneHubCreateChannelPayload,
  DoneHubUpdateChannelPayload,
} from "~/types/doneHub"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import { getErrorMessage } from "~/utils/core/error"

import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
  runManagedSiteApiServiceMutationStep,
  toManagedSiteApiServiceRequest,
} from "../managedSites/request"

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

/**
 * DoneHub overwrites channel fields when models change, so every model mutation
 * must start from fresh provider detail and retain fields outside the edit.
 */
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
  const channel = await fetchChannelRaw(
    toManagedSiteApiServiceRequest(config),
    channelId,
  )
  return channel.key ?? ""
}

const hydrateComparableKeys = async <T extends { id: number; key?: string }>(
  config: DoneHubConfig,
  candidates: T[],
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
    )
    hydratedCandidates.push({ ...candidate, key })
  }

  return hydratedCandidates
}

export const doneHubChannelOperations = {
  list: async (
    config: DoneHubConfig,
    options?: ManagedSitePaginatedChannelRequestOptions,
  ) =>
    await listAllChannels(
      toManagedSiteApiServiceRequest(config, options),
      options,
    ),
  create: async (
    config: DoneHubConfig,
    channelData: DoneHubCreateChannelPayload,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const step = await runDoneHubResponseStep({
      config,
      options,
      sequence,
      effect: createManagedSiteChannelEffect("resource-created"),
      execute: async (request) => await createChannel(request, channelData),
    })
    return finishManagedSiteMutationStep(sequence, step)
  },
  update: async (
    config: DoneHubConfig,
    channelData: DoneHubUpdateChannelPayload,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const step = await runDoneHubResponseStep({
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
    config: DoneHubConfig,
    channelId: number,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const step = await runDoneHubResponseStep({
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

export const doneHubManagedResourceModels = {
  list: async (config, options) =>
    toManagedModelChannelList(
      await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      ),
      [
        DoneHubChannelStatus.ManuallyDisabled,
        DoneHubChannelStatus.AutoDisabled,
      ],
      { siteType: SITE_TYPES.DONE_HUB, config },
    ),
  fetchModels: async (
    config,
    ref,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const channelId = requireManagedResourceChannelId(
      SITE_TYPES.DONE_HUB,
      config,
      ref,
    )
    return await fetchChannelModels(
      toManagedSiteApiServiceRequest(config, options),
      channelId,
      options,
    )
  },
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
    ref,
    models,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const channelId = requireManagedResourceChannelId(
      SITE_TYPES.DONE_HUB,
      config,
      ref,
    )
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
    ref,
    models,
    modelMapping,
    options?: ManagedSiteChannelRequestOptions,
  ) => {
    const channelId = requireManagedResourceChannelId(
      SITE_TYPES.DONE_HUB,
      config,
      ref,
    )
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
} satisfies ManagedResourceModelsCapability<DoneHubConfig>
