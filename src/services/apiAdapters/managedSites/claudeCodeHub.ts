import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeNames,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  ClaudeCodeHubApiError,
  createProvider,
  deleteProvider,
  getUnmaskedProviderKey,
  listProviders,
  searchProviders,
  updateProvider,
} from "~/services/apiService/claudeCodeHub"
import {
  createManagedSiteMutationSequence,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  buildChannelPayload,
  buildClaudeCodeHubCreatePayloadFromFormData,
  buildClaudeCodeHubUpdatePayloadFromChannelData,
  checkValidClaudeCodeHubConfig,
  fetchAvailableModels,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  listChannels,
  prepareChannelFormData,
  providerToManagedSiteChannel,
  searchChannel,
} from "~/services/managedSites/providers/claudeCodeHub"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  ClaudeCodeHubAllowedModel,
  ClaudeCodeHubProviderDisplay,
  ClaudeCodeHubProviderUpdatePayload,
} from "~/types/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"
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

const claudeCodeHubChannelEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId?: number,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  ...(resourceId === undefined ? {} : { resourceId }),
})

const toClaudeCodeHubDiagnostic = (error: unknown) => {
  const record =
    typeof error === "object" && error !== null
      ? (error as { message?: unknown; code?: unknown; status?: unknown })
      : undefined
  const code =
    typeof record?.code === "string" ||
    (typeof record?.code === "number" && Number.isSafeInteger(record.code))
      ? record.code
      : undefined
  const statusCode =
    typeof record?.status === "number" &&
    Number.isSafeInteger(record.status) &&
    record.status >= 100 &&
    record.status <= 599
      ? record.status
      : undefined
  return {
    message:
      typeof record?.message === "string" && record.message
        ? record.message
        : "Claude Code Hub mutation failed",
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    raw: error,
  }
}

const runClaudeCodeHubMutation = async <TData, TResult = TData>(input: {
  effect: ManagedSiteMutationConfirmedEffect
  execute(): Promise<TData>
  successData?: (data: TData) => TResult
}) => {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const attempt = sequence.beginStep()
  try {
    const data = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    attempt.confirmEffect(input.effect)
    attempt.complete()
    return sequence.finish({
      finalState: "confirmed",
      data: input.successData
        ? input.successData(data)
        : (data as unknown as TResult),
    })
  } catch (error) {
    if (!(error instanceof ClaudeCodeHubApiError) || !error.dispatch) {
      throw error
    }
    if (error.dispatch === "dispatched") {
      attempt.markPossiblyDispatched()
    }
    if (error.responseReceived) {
      attempt.markResponseReceived()
    }
    if (error.confirmedNonApplication) {
      if (error.dispatch === "dispatched" && error.responseReceived) {
        attempt.confirmNonApplication()
      }
    }
    attempt.complete()
    return sequence.finish({
      finalState: "unconfirmed",
      diagnostic: toClaudeCodeHubDiagnostic(error),
    })
  }
}

export const claudeCodeHubManagedSiteChannels: ManagedSiteChannelsCapability<ClaudeCodeHubConfig> =
  {
    search: searchChannel,
    list: listChannels,
    create: async (config, channelData) =>
      await runClaudeCodeHubMutation<unknown, void>({
        effect: claudeCodeHubChannelEffect("resource-created"),
        execute: async () =>
          await createProvider(
            config,
            buildClaudeCodeHubCreatePayloadFromFormData({
              name: channelData.channel.name ?? "",
              type:
                channelData.channel.type ??
                CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
              key: channelData.channel.key ?? "",
              base_url: channelData.channel.base_url ?? "",
              models: normalizeList(
                channelData.channel.models?.split(",") ?? [],
              ),
              groups:
                channelData.channel.groups ??
                normalizeList(
                  channelData.channel.group?.split(",") ?? [DEFAULT_GROUP_TAG],
                ),
              priority: channelData.channel.priority ?? 0,
              weight: channelData.channel.weight ?? 1,
              status: channelData.channel.status,
            }),
          ),
      }),
    update: async (config, channelData) =>
      await runClaudeCodeHubMutation({
        effect: claudeCodeHubChannelEffect("resource-updated", channelData.id),
        execute: async () =>
          await updateProvider(
            config,
            buildClaudeCodeHubUpdatePayloadFromChannelData(channelData),
          ),
      }),
    delete: async (config, channelId) =>
      await runClaudeCodeHubMutation({
        effect: claudeCodeHubChannelEffect("resource-deleted", channelId),
        execute: async () => await deleteProvider(config, channelId),
        successData: () => undefined,
      }),
    fetchSecretKey: fetchChannelSecretKey,
    hydrateComparableKeys: hydrateComparableChannelKeys,
  }

const claudeCodeHubManagedSiteConfig: ManagedSiteConfigCapability<ClaudeCodeHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.CLAUDE_CODE_HUB,
    checkValidClaudeCodeHubConfig,
  )

const claudeCodeHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability =
  {
    fetchAvailableModels,
    buildName: buildChannelName,
    prepareFormData: prepareChannelFormData,
    buildPayload: buildChannelPayload,
  }

const DEFAULT_GROUP_TAG = "default"
const CLAUDE_CODE_HUB_NATIVE_ALLOWED_MODELS_FIELD =
  "_claudeCodeHubNativeAllowedModels"

type ClaudeCodeHubChannelFormData = ChannelFormData & {
  [CLAUDE_CODE_HUB_NATIVE_ALLOWED_MODELS_FIELD]?: ClaudeCodeHubAllowedModel[]
}

const assertClaudeCodeHubResourceRef = (
  config: ClaudeCodeHubConfig,
  ref: ManagedUpstreamResourceRef,
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
    scopeKey: config.baseUrl,
  })

const normalizeAllowedModels = (
  allowedModels?: ClaudeCodeHubAllowedModel[],
): string[] =>
  normalizeList(
    (allowedModels ?? [])
      .map((item) => {
        if (typeof item === "string") return item
        if (item?.matchType && item.matchType !== "exact") return ""
        return item?.pattern ?? ""
      })
      .filter(Boolean),
  )

const toAllowedModelRules = (models: string[]): ClaudeCodeHubAllowedModel[] =>
  normalizeList(models).map((model) => ({
    matchType: "exact",
    pattern: model,
  }))

const getNativeNonExactAllowedModelRules = (
  allowedModels?: ClaudeCodeHubAllowedModel[],
): ClaudeCodeHubAllowedModel[] =>
  (allowedModels ?? []).filter(
    (item) =>
      typeof item !== "string" && item?.matchType && item.matchType !== "exact",
  )

const haveSameAllowedModelDraft = (
  provider: ClaudeCodeHubProviderDisplay,
  models: string[],
) => {
  const nativeModels = normalizeAllowedModels(provider.allowedModels)
  const draftModels = normalizeList(models)

  return (
    nativeModels.length === draftModels.length &&
    nativeModels.every((model, index) => model === draftModels[index])
  )
}

const hasNativeAllowedModelRules = (
  allowedModels?: ClaudeCodeHubAllowedModel[],
) => (allowedModels?.length ?? 0) > 0

const hasNativeOnlyAllowedModelRules = (
  allowedModels?: ClaudeCodeHubAllowedModel[],
) =>
  hasNativeAllowedModelRules(allowedModels) &&
  normalizeAllowedModels(allowedModels).length === 0

const resolveAllowedModelRules = (
  provider: ClaudeCodeHubProviderDisplay,
  models: string[],
) => {
  if (
    models.length === 0 &&
    hasNativeOnlyAllowedModelRules(provider.allowedModels)
  ) {
    return provider.allowedModels
  }

  return haveSameAllowedModelDraft(provider, models)
    ? provider.allowedModels
    : [
        ...getNativeNonExactAllowedModelRules(provider.allowedModels),
        ...toAllowedModelRules(models),
      ]
}

const toSafeWeight = (weight?: number): number => {
  const numericWeight = Number(weight ?? 1)
  if (!Number.isFinite(numericWeight)) {
    return 1
  }
  return Math.max(1, Math.trunc(numericWeight))
}

const toResourceStatus = (provider: ClaudeCodeHubProviderDisplay) =>
  provider.isEnabled === false
    ? MANAGED_UPSTREAM_RESOURCE_STATUSES.Disabled
    : MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled

const toSecretState = (provider: ClaudeCodeHubProviderDisplay) => {
  if (hasUsableManagedSiteChannelKey(provider.key)) {
    return MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available
  }

  return provider.maskedKey?.trim() || provider.key?.trim()
    ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked
    : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Unavailable
}

const getProviderTypeLabel = (provider: ClaudeCodeHubProviderDisplay) => {
  const providerType = provider.providerType
  if (!providerType) {
    return ""
  }

  return (
    ClaudeCodeHubProviderTypeNames[
      providerType as keyof typeof ClaudeCodeHubProviderTypeNames
    ] ?? providerType
  )
}

const toClaudeCodeHubResourceSummary = (
  config: ClaudeCodeHubConfig,
  provider: ClaudeCodeHubProviderDisplay,
): ManagedUpstreamResourceSummary => {
  const models = normalizeAllowedModels(provider.allowedModels)

  return {
    ref: createManagedUpstreamResourceRef({
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(config.baseUrl),
      resourceId: provider.id,
    }),
    displayName: provider.name || `Provider ${provider.id}`,
    nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Provider,
    status: toResourceStatus(provider),
    typeLabel: getProviderTypeLabel(provider),
    endpointLabel: provider.url ?? "",
    modelCount: models.length,
    modelPreview: models.slice(0, 3),
    secretState: toSecretState(provider),
    capabilities: {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canRevealSecret: true,
    },
  }
}

const toClaudeCodeHubResourceListData = (
  config: ClaudeCodeHubConfig,
  providers: ClaudeCodeHubProviderDisplay[],
) => ({
  items: providers.map((provider) =>
    toClaudeCodeHubResourceSummary(config, provider),
  ),
  total: providers.length,
})

const findClaudeCodeHubProviderByRef = async (
  config: ClaudeCodeHubConfig,
  ref: ManagedUpstreamResourceRef,
): Promise<ClaudeCodeHubProviderDisplay> => {
  assertClaudeCodeHubResourceRef(config, ref)

  const providers = await listProviders(config)
  const provider = providers.find((item) => String(item.id) === ref.resourceId)

  if (!provider) {
    throw new Error("Channel was not found")
  }

  return provider
}

const prepareClaudeCodeHubEditDraft = (
  detail: ManagedUpstreamResourceDetail<ClaudeCodeHubProviderDisplay>,
): ClaudeCodeHubChannelFormData => {
  const channel = providerToManagedSiteChannel(detail.native)

  return {
    name: channel.name,
    type: channel.type,
    key: channel.key,
    base_url: channel.base_url || "",
    models: channel.models ? channel.models.split(",") : [],
    groups: channel.group ? channel.group.split(",") : [DEFAULT_GROUP_TAG],
    priority: channel.priority,
    weight: channel.weight,
    status: channel.status,
    [CLAUDE_CODE_HUB_NATIVE_ALLOWED_MODELS_FIELD]:
      detail.native.allowedModels ?? [],
  }
}

const claudeCodeHubResourceFieldDescriptors: ManagedUpstreamResourceFieldDescriptor[] =
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
      required: true,
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

const getProviderGroupTag = (draft: ChannelFormData) =>
  normalizeList(draft.groups)[0] ?? DEFAULT_GROUP_TAG

const toClaudeCodeHubUpdatePayload = (
  detail: ManagedUpstreamResourceDetail<ClaudeCodeHubProviderDisplay>,
  draft: ChannelFormData,
): ClaudeCodeHubProviderUpdatePayload => {
  const native = detail.native
  const payload: ClaudeCodeHubProviderUpdatePayload & Record<string, unknown> =
    {
      ...native,
      providerId: native.id,
      name: draft.name.trim(),
      url: draft.base_url.trim(),
      provider_type:
        typeof draft.type === "string" && draft.type.trim()
          ? draft.type
          : native.providerType,
      allowed_models: resolveAllowedModelRules(native, draft.models),
      is_enabled: draft.status === CHANNEL_STATUS.Enable,
      weight: toSafeWeight(draft.weight),
      priority: draft.priority,
      group_tag: getProviderGroupTag(draft),
    }

  delete payload.key

  if (hasUsableManagedSiteChannelKey(draft.key)) {
    payload.key = draft.key.trim()
  }

  return payload
}

const isClaudeCodeHubProviderDisplay = (
  value: unknown,
): value is ClaudeCodeHubProviderDisplay =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "number" &&
      typeof (value as { name?: unknown }).name === "string",
  )

const toResourceMutationResponse = async (
  config: ClaudeCodeHubConfig,
  response:
    | ReturnType<typeof createProvider>
    | ReturnType<typeof updateProvider>,
) => {
  const resolvedResponse = await response
  return {
    success: true,
    message: "success",
    data: isClaudeCodeHubProviderDisplay(resolvedResponse)
      ? toClaudeCodeHubResourceSummary(config, resolvedResponse)
      : null,
  }
}

const claudeCodeHubManagedUpstreamResources: ManagedUpstreamResourcesCapability<
  ClaudeCodeHubConfig,
  ClaudeCodeHubProviderDisplay,
  ChannelFormData
> = {
  items: {
    list: async (config, options) =>
      toClaudeCodeHubResourceListData(
        config,
        await listProviders(config, { signal: options?.signal }),
      ),
    search: async (config, keyword) =>
      toClaudeCodeHubResourceListData(
        config,
        await searchProviders(config, keyword),
      ),
    getDetail: async (config, ref) => {
      const native = await findClaudeCodeHubProviderByRef(config, ref)
      return {
        summary: toClaudeCodeHubResourceSummary(config, native),
        native,
      }
    },
    create: async (config, draft) =>
      await toResourceMutationResponse(
        config,
        createProvider(
          config,
          buildClaudeCodeHubCreatePayloadFromFormData(draft),
        ),
      ),
    update: async (config, detail, draft) =>
      await toResourceMutationResponse(
        config,
        updateProvider(config, toClaudeCodeHubUpdatePayload(detail, draft)),
      ),
    delete: async (config, ref) => {
      assertClaudeCodeHubResourceRef(config, ref)
      const response = await deleteProvider(config, Number(ref.resourceId))
      return {
        success: true,
        message: "success",
        data: response ?? null,
      }
    },
  },
  drafts: {
    prepareImportDraft: async (input) => {
      if (input.source && typeof input.source === "object") {
        return input.source as ChannelFormData
      }

      return {
        name: input.resource?.displayName ?? "",
        type: "",
        key: "",
        base_url: input.resource?.endpointLabel ?? "",
        models: input.resource?.modelPreview ?? [],
        groups: [DEFAULT_GROUP_TAG],
        priority: 0,
        weight: 1,
        status: CHANNEL_STATUS.Enable,
      }
    },
    prepareEditDraft: prepareClaudeCodeHubEditDraft,
    describeFields: () => claudeCodeHubResourceFieldDescriptors,
    validateDraft: (draft) => {
      const claudeCodeHubDraft = draft as ClaudeCodeHubChannelFormData
      const errors = []
      if (!draft.name.trim()) {
        errors.push({ field: "name", message: "Channel name is required" })
      }
      if (!draft.base_url?.trim()) {
        errors.push({ field: "base_url", message: "Base URL is required" })
      }
      if (
        draft.models.length === 0 &&
        !hasNativeOnlyAllowedModelRules(
          claudeCodeHubDraft[CLAUDE_CODE_HUB_NATIVE_ALLOWED_MODELS_FIELD],
        )
      ) {
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
      const secret = await getUnmaskedProviderKey(
        config,
        Number(ref.resourceId),
      )
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

export const claudeCodeHubManagedSiteCapabilities = {
  channels: claudeCodeHubManagedSiteChannels,
  resources: claudeCodeHubManagedUpstreamResources,
  config: claudeCodeHubManagedSiteConfig,
  queries: emptyManagedSiteQueries,
  channelDrafts: claudeCodeHubManagedSiteChannelDrafts,
}
