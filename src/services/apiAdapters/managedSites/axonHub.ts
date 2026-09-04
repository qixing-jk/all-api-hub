import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  AXON_HUB_GRAPHQL_ERROR_CODES,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  axonHubChannelToManagedSite,
  AxonHubRequestError,
  createAxonHubChannel,
  deleteAxonHubChannel,
  getAxonHubChannel,
  resolveAxonHubGraphqlIdForMutation,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
} from "~/services/apiService/axonHub"
import {
  createManagedSiteMutationSequence,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationEffectKind,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidAxonHubConfig,
  fetchAvailableModels,
  listChannels,
  prepareChannelFormData,
  searchChannel,
} from "~/services/managedSites/providers/axonHub"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  type CreateChannelPayload,
  type UpdateChannelPayload,
} from "~/types/managedSite"
import { normalizeList } from "~/utils/core/string"

import { createManagedSiteConfigCapability } from "./config"
import { emptyManagedSiteQueries } from "./unsupportedQueries"

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

const toAxonHubStatus = (status?: number) =>
  status === CHANNEL_STATUS.Enable
    ? AXON_HUB_CHANNEL_STATUS.ENABLED
    : AXON_HUB_CHANNEL_STATUS.DISABLED

const toAxonHubChannelCreateInput = (
  channelData: CreateChannelPayload,
): AxonHubCreateChannelInput => {
  const channel = channelData.channel
  const models = normalizeList(channel.models?.split(",") ?? [])
  if (models.length === 0) {
    throw new AxonHubRequestError(
      "upstream-rejected",
      "not-dispatched",
      "AxonHub channel models are required",
    )
  }

  return {
    type:
      typeof channel.type === "string" && channel.type.trim()
        ? channel.type
        : AXON_HUB_CHANNEL_TYPE.OPENAI,
    name: (channel.name ?? "").trim(),
    baseURL: (channel.base_url ?? "").trim(),
    credentials: {
      apiKeys: [(channel.key ?? "").trim()].filter(Boolean),
    },
    supportedModels: models,
    manualModels: models,
    defaultTestModel: models[0],
    settings: {},
    orderingWeight: channel.weight ?? 0,
  }
}

const toAxonHubChannelUpdateInput = (
  channelData: UpdateChannelPayload,
  current: AxonHubChannel,
): AxonHubUpdateChannelInput => {
  const models = normalizeList(channelData.models?.split(",") ?? [])
  const input: AxonHubUpdateChannelInput = {}
  const currentModels = normalizeList([
    ...(current.supportedModels ?? []),
    ...(current.manualModels ?? []),
  ])
  const currentKey =
    current.credentials?.apiKeys?.map((key) => key.trim()).find(Boolean) ??
    current.credentials?.apiKey?.trim() ??
    ""
  const listsEqual = (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((value, index) => value === right[index])

  if (
    typeof channelData.type === "string" &&
    channelData.type !== current.type
  ) {
    input.type = channelData.type
  }
  if (
    channelData.name !== undefined &&
    channelData.name.trim() !== current.name
  ) {
    input.name = channelData.name.trim()
  }
  if (channelData.base_url !== undefined) {
    const baseURL = channelData.base_url.trim()
    if (baseURL !== (current.baseURL ?? "")) input.baseURL = baseURL
  }
  if (channelData.key !== undefined) {
    const key = channelData.key.trim()
    if (key && key !== currentKey) {
      input.credentials = { apiKeys: [key] }
    }
  }
  if (models.length > 0 && !listsEqual(models, currentModels)) {
    input.supportedModels = models
    input.manualModels = models
    input.defaultTestModel = models[0]
  }
  if (
    channelData.weight !== undefined &&
    channelData.weight !== (current.orderingWeight ?? 0)
  ) {
    input.orderingWeight = channelData.weight
  }

  return input
}

const axonHubChannelEffect = (
  kind: ManagedSiteMutationEffectKind,
  resourceId?: string | number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: MANAGED_RESOURCE_KINDS.Channel,
  ...(resourceId === undefined ? {} : { resourceId }),
})

const isTypedOperationalPreflight = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError"

const toAxonHubDiagnostic = (error: AxonHubRequestError | DOMException) => {
  const code =
    typeof error.code === "string" ||
    (typeof error.code === "number" && Number.isSafeInteger(error.code))
      ? error.code
      : undefined
  const statusCode =
    error instanceof AxonHubRequestError ? error.statusCode : undefined
  const raw =
    error instanceof AxonHubRequestError
      ? error.raw ?? error.cause ?? error
      : error
  return {
    message: error.message,
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    raw,
  }
}

const runAxonHubMutationStep = async <TData>(input: {
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(): Promise<TData>
  rejectResponse?: (data: TData) => boolean
}) => {
  const attempt = input.sequence.beginStep()
  try {
    const data = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    if (input.rejectResponse?.(data)) {
      attempt.confirmNonApplication()
      attempt.complete()
      return {
        outcome: "rejected" as const,
        diagnostic: { message: "Provider rejected the mutation", raw: data },
      }
    }
    attempt.confirmEffect(input.effect)
    attempt.complete()
    return { outcome: "applied" as const, data }
  } catch (error) {
    if (
      !(error instanceof AxonHubRequestError) &&
      !isTypedOperationalPreflight(error)
    ) {
      throw error
    }
    const dispatch =
      error instanceof AxonHubRequestError ? error.dispatch : "not-dispatched"
    const confirmedNonApplication =
      error instanceof AxonHubRequestError &&
      error.responseReceived &&
      error.code === AXON_HUB_GRAPHQL_ERROR_CODES.VALIDATION_FAILED
    if (dispatch === "dispatched") {
      attempt.markPossiblyDispatched()
    }
    if (
      error instanceof AxonHubRequestError &&
      dispatch === "dispatched" &&
      error.responseReceived
    ) {
      attempt.markResponseReceived()
    }
    if (confirmedNonApplication) {
      attempt.confirmNonApplication()
    }
    attempt.complete()
    return {
      outcome:
        dispatch === "not-dispatched" || confirmedNonApplication
          ? ("rejected" as const)
          : ("uncertain" as const),
      diagnostic: toAxonHubDiagnostic(error),
    }
  }
}

const finishAxonHubMutation = (
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>,
  step: {
    outcome: "rejected" | "uncertain"
    diagnostic: {
      message: string
      code?: string | number
      statusCode?: number
      raw?: unknown
    }
  },
) =>
  sequence.finish({
    finalState: "unconfirmed",
    diagnostic: step.diagnostic,
  })

// Compatibility surface for generic ManagedSiteService callers. AxonHub's
// dedicated channel UI uses the native resource registration; remove this
// adapter once the remaining generic callers have migrated to that contract.
export const axonHubManagedSiteChannels: ManagedSiteChannelsCapability<AxonHubConfig> =
  {
    search: searchChannel,
    list: listChannels,
    create: async (config, channelData) => {
      let input: AxonHubCreateChannelInput | undefined
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const createStep = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect(
          MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
        ),
        execute: async () => {
          input = toAxonHubChannelCreateInput(channelData)
          return await createAxonHubChannel(config, input)
        },
      })
      if (createStep.outcome !== "applied") {
        return finishAxonHubMutation(sequence, createStep)
      }

      const finalChannel = { ...input!, ...createStep.data }
      if (channelData.channel.status === CHANNEL_STATUS.Enable) {
        const statusStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
            createStep.data.id,
          ),
          execute: async () =>
            await updateAxonHubChannelStatus(
              config,
              createStep.data.id,
              AXON_HUB_CHANNEL_STATUS.ENABLED,
            ),
        })
        if (statusStep.outcome !== "applied") {
          return finishAxonHubMutation(sequence, statusStep)
        }
        finalChannel.status = AXON_HUB_CHANNEL_STATUS.ENABLED
      }

      return sequence.finish({
        finalState: "confirmed",
        data: axonHubChannelToManagedSite(finalChannel),
      })
    },
    update: async (config, channelData) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: true })
      let graphqlId: string | undefined
      let current: AxonHubChannel | undefined
      try {
        graphqlId = await resolveAxonHubGraphqlIdForMutation(
          config,
          channelData.id,
        )
        current = await getAxonHubChannel(config, graphqlId)
      } catch (error) {
        if (
          !(error instanceof AxonHubRequestError) &&
          !isTypedOperationalPreflight(error)
        ) {
          throw error
        }
        return sequence.finish({
          finalState: "unconfirmed",
          diagnostic: toAxonHubDiagnostic(error),
        })
      }

      const input = toAxonHubChannelUpdateInput(channelData, current)
      let finalChannel: AxonHubChannel = current
      if (Object.keys(input).length > 0) {
        const updateStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
            channelData.id,
          ),
          execute: async () =>
            await updateAxonHubChannel(config, graphqlId!, input),
        })
        if (updateStep.outcome !== "applied") {
          return finishAxonHubMutation(sequence, updateStep)
        }
        finalChannel = { ...current, ...input, ...updateStep.data }
      }

      const status =
        channelData.status === undefined
          ? undefined
          : toAxonHubStatus(channelData.status)
      if (status !== undefined && status !== current.status) {
        const statusStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
            channelData.id,
          ),
          execute: async () =>
            await updateAxonHubChannelStatus(config, graphqlId!, status),
        })
        if (statusStep.outcome !== "applied") {
          return finishAxonHubMutation(sequence, statusStep)
        }
        finalChannel.status = status
      }

      return sequence.finish({
        finalState: "confirmed",
        data: axonHubChannelToManagedSite(finalChannel),
      })
    },
    delete: async (config, channelId) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect(
          MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
          channelId,
        ),
        execute: async () =>
          await deleteAxonHubChannel(
            config,
            await resolveAxonHubGraphqlIdForMutation(config, channelId),
          ),
        rejectResponse: (deleted) => !deleted,
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: undefined })
        : finishAxonHubMutation(sequence, step)
    },
  }

export const axonHubManagedSiteCapabilities = {
  channels: axonHubManagedSiteChannels,
  config: axonHubManagedSiteConfig,
  queries: emptyManagedSiteQueries,
  channelDrafts: axonHubManagedSiteChannelDrafts,
}
