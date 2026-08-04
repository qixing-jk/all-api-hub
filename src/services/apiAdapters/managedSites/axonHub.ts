import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  AxonHubChannelTypeNames,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
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
  type ManagedSiteMutationConfirmedEffect,
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
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import {
  CHANNEL_STATUS,
  type AxonHubChannelWithData,
  type ChannelFormData,
  type CreateChannelPayload,
  type ManagedSiteChannel,
  type ManagedSiteChannelListData,
  type UpdateChannelPayload,
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

const assertAxonHubResourceRef = (
  config: AxonHubConfig,
  ref: ManagedUpstreamResourceRef,
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.AXON_HUB,
    scopeKey: config.baseUrl,
  })

const toAxonHubStatus = (status?: number) =>
  status === CHANNEL_STATUS.Enable
    ? AXON_HUB_CHANNEL_STATUS.ENABLED
    : AXON_HUB_CHANNEL_STATUS.DISABLED

const toChannelStatus = (status: AxonHubChannel["status"]) =>
  status === AXON_HUB_CHANNEL_STATUS.ENABLED
    ? CHANNEL_STATUS.Enable
    : CHANNEL_STATUS.ManuallyDisabled

const getAxonHubCredentialKey = (credentials: AxonHubChannel["credentials"]) =>
  credentials?.apiKeys?.map((key) => key.trim()).find(Boolean) ??
  credentials?.apiKey?.trim() ??
  ""

const getAxonHubCredentialKeys = (
  credentials: AxonHubChannel["credentials"],
) => [
  ...(credentials?.apiKeys ?? []).map((key) => key.trim()).filter(Boolean),
  ...(credentials?.apiKey?.trim() ? [credentials.apiKey.trim()] : []),
]

const getAxonHubModelList = (channel: AxonHubChannel) =>
  normalizeList([
    ...(channel.supportedModels ?? []),
    ...(channel.manualModels ?? []),
  ])

const toAxonHubResourceStatus = (channel: AxonHubChannel) => {
  switch (channel.status) {
    case AXON_HUB_CHANNEL_STATUS.ENABLED:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled
    case AXON_HUB_CHANNEL_STATUS.DISABLED:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Disabled
    default:
      return MANAGED_UPSTREAM_RESOURCE_STATUSES.Unknown
  }
}

const toAxonHubSecretState = (channel: AxonHubChannel) => {
  const key = getAxonHubCredentialKey(channel.credentials)
  if (!key) {
    return MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Unavailable
  }

  return hasUsableManagedSiteChannelKey(key)
    ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available
    : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked
}

const toAxonHubResourceSummary = (
  config: AxonHubConfig,
  channel: AxonHubChannel,
): ManagedUpstreamResourceSummary => {
  const models = getAxonHubModelList(channel)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(config.baseUrl),
      resourceId: channel.id,
    }),
    displayName: channel.name,
    nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
    status: toAxonHubResourceStatus(channel),
    typeLabel:
      AxonHubChannelTypeNames[
        channel.type as keyof typeof AxonHubChannelTypeNames
      ] ?? String(channel.type),
    endpointLabel: channel.baseURL ?? "",
    modelCount: models.length,
    modelPreview: models.slice(0, 3),
    secretState: toAxonHubSecretState(channel),
    capabilities: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRevealSecret: false,
    },
  }
}

const rowToAxonHubNativeChannel = (row: ManagedSiteChannel): AxonHubChannel => {
  const native = (row as Partial<AxonHubChannelWithData>)._axonHubData
  if (native) {
    return native
  }

  throw new Error("AxonHub channel row is missing native channel detail")
}

const toAxonHubResourceListData = (
  config: AxonHubConfig,
  channels: ManagedSiteChannelListData,
) => {
  const nativeChannels = channels.items.map(rowToAxonHubNativeChannel)

  return {
    items: nativeChannels.map((channel) =>
      toAxonHubResourceSummary(config, channel),
    ),
    total: channels.total ?? nativeChannels.length,
  }
}

const findAxonHubChannelByRef = async (
  config: AxonHubConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<AxonHubChannel> => {
  assertAxonHubResourceRef(config, ref)
  return getAxonHubChannel(config, ref.resourceId)
}

const prepareAxonHubEditDraft = (
  detail: ManagedUpstreamResourceDetail<AxonHubChannel>,
): ChannelFormData => {
  const channel = detail.native

  return {
    name: channel.name,
    type: channel.type,
    key: getAxonHubCredentialKey(channel.credentials),
    base_url: channel.baseURL ?? "",
    models: getAxonHubModelList(channel),
    groups: [],
    priority: 0,
    weight: channel.orderingWeight ?? 0,
    status: toChannelStatus(channel.status),
  }
}

const axonHubResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
  [
    {
      name: "name",
      label: "Channel name",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      name: "type",
      label: "Channel type",
      type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: Object.entries(AxonHubChannelTypeNames).map(
        ([value, label]) => ({
          value,
          label,
        }),
      ),
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
      required: true,
    },
  ]

const buildAxonHubCredentialUpdate = (
  native: AxonHubChannel,
  draft: ChannelFormData,
) => {
  const draftKey = draft.key.trim()
  if (hasUsableManagedSiteChannelKey(draftKey)) {
    if (getAxonHubCredentialKeys(native.credentials).includes(draftKey)) {
      return {
        credentials: native.credentials ?? { apiKeys: [draftKey] },
      }
    }

    return {
      credentials: {
        ...(native.credentials ?? {}),
        apiKeys: [draftKey],
      },
    }
  }

  const nativeKey = getAxonHubCredentialKey(native.credentials)
  if (hasUsableManagedSiteChannelKey(nativeKey)) {
    return {
      credentials: native.credentials ?? { apiKeys: [nativeKey] },
    }
  }

  return {}
}

const toAxonHubCreateInput = (
  draft: ChannelFormData,
): AxonHubCreateChannelInput => {
  const models = normalizeList(draft.models)
  return {
    type:
      typeof draft.type === "string" && draft.type.trim()
        ? draft.type
        : AXON_HUB_CHANNEL_TYPE.OPENAI,
    name: draft.name.trim(),
    baseURL: draft.base_url.trim(),
    credentials: {
      apiKeys: [draft.key.trim()].filter(Boolean),
    },
    supportedModels: models,
    manualModels: models,
    defaultTestModel: models[0] ?? "",
    settings: {},
    orderingWeight: draft.weight,
  }
}

const toAxonHubUpdateInput = (
  detail: ManagedUpstreamResourceDetail<AxonHubChannel>,
  draft: ChannelFormData,
): AxonHubUpdateChannelInput => {
  const native = detail.native

  return {
    type:
      typeof draft.type === "string" && draft.type.trim()
        ? draft.type
        : native.type,
    name: draft.name.trim(),
    baseURL: draft.base_url.trim(),
    ...buildAxonHubCredentialUpdate(native, draft),
    supportedModels: native.supportedModels ?? null,
    manualModels: native.manualModels ?? null,
    defaultTestModel: native.defaultTestModel ?? null,
    settings: native.settings ?? null,
    orderingWeight: native.orderingWeight ?? null,
    remark: native.remark ?? null,
  }
}

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
): AxonHubUpdateChannelInput => {
  const models = normalizeList(channelData.models?.split(",") ?? [])
  const input: AxonHubUpdateChannelInput = {}

  if (typeof channelData.type === "string") input.type = channelData.type
  if (channelData.name !== undefined) input.name = channelData.name.trim()
  if (channelData.base_url !== undefined) {
    input.baseURL = channelData.base_url.trim()
  }
  if (channelData.key !== undefined) {
    input.credentials = {
      apiKeys: [channelData.key.trim()].filter(Boolean),
    }
  }
  if (models.length > 0) {
    input.supportedModels = models
    input.manualModels = models
    input.defaultTestModel = models[0]
  }
  if (channelData.weight !== undefined) {
    input.orderingWeight = channelData.weight
  }

  return input
}

const axonHubChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: string | number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
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
    attempt.complete()
    return {
      outcome:
        dispatch === "not-dispatched"
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

export const axonHubManagedSiteChannels: ManagedSiteChannelsCapability<AxonHubConfig> =
  {
    search: searchChannel,
    list: listChannels,
    create: async (config, channelData) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const createStep = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect("resource-created"),
        execute: async () =>
          await createAxonHubChannel(
            config,
            toAxonHubChannelCreateInput(channelData),
          ),
      })
      if (createStep.outcome !== "applied") {
        return finishAxonHubMutation(sequence, createStep)
      }

      const finalChannel = { ...createStep.data }
      if (channelData.channel.status === CHANNEL_STATUS.Enable) {
        const statusStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect("status-updated", createStep.data.id),
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
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      let graphqlId: string | undefined
      const updateStep = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect("resource-updated", channelData.id),
        execute: async () => {
          graphqlId = await resolveAxonHubGraphqlIdForMutation(
            config,
            channelData.id,
          )
          return await updateAxonHubChannel(
            config,
            graphqlId,
            toAxonHubChannelUpdateInput(channelData),
          )
        },
      })
      if (updateStep.outcome !== "applied") {
        return finishAxonHubMutation(sequence, updateStep)
      }

      const finalChannel = { ...updateStep.data }
      if (channelData.status !== undefined) {
        const status = toAxonHubStatus(channelData.status)
        const statusStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect("status-updated", channelData.id),
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
        effect: axonHubChannelEffect("resource-deleted", channelId),
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

const isRepresentableAxonHubStatus = (status: AxonHubChannel["status"]) =>
  status === AXON_HUB_CHANNEL_STATUS.ENABLED ||
  status === AXON_HUB_CHANNEL_STATUS.DISABLED

const axonHubManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  AxonHubConfig,
  AxonHubChannel,
  ChannelFormData
> = {
  items: {
    list: async (config, options) =>
      toAxonHubResourceListData(
        config,
        await listChannels(config, { signal: options?.signal }),
      ),
    search: async (config, keyword) => {
      const channels = await searchChannel(config, keyword)
      return channels ? toAxonHubResourceListData(config, channels) : null
    },
    getDetail: async (config, ref) => {
      const native = await findAxonHubChannelByRef(config, ref)
      return {
        summary: toAxonHubResourceSummary(config, native),
        native,
      }
    },
    create: async (config, draft) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const createStep = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect("resource-created"),
        execute: async () =>
          await createAxonHubChannel(config, toAxonHubCreateInput(draft)),
      })
      if (createStep.outcome !== "applied") {
        return finishAxonHubMutation(sequence, createStep)
      }

      const finalChannel = { ...createStep.data }
      if (draft.status === CHANNEL_STATUS.Enable) {
        const statusStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect("status-updated", createStep.data.id),
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
        data: toAxonHubResourceSummary(config, finalChannel),
      })
    },
    update: async (config, detail, draft) => {
      const native = detail.native
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const updateStep = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect("resource-updated", native.id),
        execute: async () =>
          await updateAxonHubChannel(
            config,
            native.id,
            toAxonHubUpdateInput(detail, draft),
          ),
      })
      if (updateStep.outcome !== "applied") {
        return finishAxonHubMutation(sequence, updateStep)
      }

      const finalChannel = { ...updateStep.data }
      const requestedStatus = toAxonHubStatus(draft.status)

      if (
        isRepresentableAxonHubStatus(native.status) &&
        native.status !== requestedStatus
      ) {
        const statusStep = await runAxonHubMutationStep({
          sequence,
          effect: axonHubChannelEffect("status-updated", native.id),
          execute: async () =>
            await updateAxonHubChannelStatus(
              config,
              native.id,
              requestedStatus,
            ),
        })
        if (statusStep.outcome !== "applied") {
          return finishAxonHubMutation(sequence, statusStep)
        }
        finalChannel.status = requestedStatus
      }

      return sequence.finish({
        finalState: "confirmed",
        data: toAxonHubResourceSummary(config, finalChannel),
      })
    },
    delete: async (config, ref) => {
      assertAxonHubResourceRef(config, ref)
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const step = await runAxonHubMutationStep({
        sequence,
        effect: axonHubChannelEffect("resource-deleted", ref.resourceId),
        execute: async () => await deleteAxonHubChannel(config, ref.resourceId),
        rejectResponse: (deleted) => !deleted,
      })
      return step.outcome === "applied"
        ? sequence.finish({ finalState: "confirmed", data: undefined })
        : finishAxonHubMutation(sequence, step)
    },
  },
  drafts: {
    prepareImportDraft: async (input) => {
      if (input.source && typeof input.source === "object") {
        return input.source as ChannelFormData
      }

      return {
        name: input.resource?.displayName ?? "",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        key: "",
        base_url: input.resource?.endpointLabel ?? "",
        models: input.resource?.modelPreview ?? [],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }
    },
    prepareEditDraft: prepareAxonHubEditDraft,
    describeFields: () => axonHubResourceFieldDescriptors,
    validateDraft: (draft) => {
      const errors = []
      if (!draft.name.trim()) {
        errors.push({ field: "name", message: "Channel name is required" })
      }
      if (!draft.base_url?.trim()) {
        errors.push({ field: "base_url", message: "Base URL is required" })
      }

      return {
        valid: errors.length === 0,
        errors,
      }
    },
  },
}

export const axonHubManagedSiteCapabilities = {
  channels: axonHubManagedSiteChannels,
  resources: axonHubManagedUpstreamResources,
  config: axonHubManagedSiteConfig,
  queries: emptyManagedSiteQueries,
  channelDrafts: axonHubManagedSiteChannelDrafts,
}
