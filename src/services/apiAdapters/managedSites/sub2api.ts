import { SITE_TYPES } from "~/constants/siteType"
import {
  SUB2API_DEFAULT_ACCOUNT_PLATFORM,
  SUB2API_MANAGED_RESOURCE_STATUS,
} from "~/constants/sub2api"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  createManagedSiteMutationSequence,
  MANAGED_SITE_MUTATION_OUTCOMES,
  runManagedSiteMutationStep,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import {
  buildChannelName,
  buildChannelPayload,
  createSub2ApiApiKeyAccount,
  deleteSub2ApiApiKeyAccount,
  fetchAvailableModels,
  getSub2ApiApiKeyAccount,
  listSub2ApiApiKeyAccounts,
  parseSub2ApiResourceId,
  prepareChannelFormData,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  sub2ApiAccountToManagedSiteChannel,
  Sub2ApiAdminApiError,
  sub2ApiChannelTypeToPlatform,
  sub2ApiPlatformToChannelType,
  toSub2ApiManagedSiteChannelList,
  updateSub2ApiApiKeyAccount,
  type Sub2ApiApiKeyAccountCreateInput,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import { CHANNEL_STATUS } from "~/types/managedSite"
import {
  assertManagedUpstreamResourceRefScope,
  createManagedUpstreamResourceRef,
  MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES,
  MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS,
  MANAGED_UPSTREAM_RESOURCE_SECRET_STATES,
  MANAGED_UPSTREAM_RESOURCE_STATUSES,
  normalizeManagedUpstreamResourceScopeKey,
  type ManagedUpstreamResourceDraftValidationIssue,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"

import { createManagedSiteConfigCapability } from "./config"
import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
} from "./request"
import { emptyManagedSiteQueries } from "./unsupportedQueries"

type MutationAttempt<T> =
  | { kind: "applied"; data: T }
  | { kind: "rejected"; error: Sub2ApiAdminApiError }

const runSub2ApiMutationStep = async <T>(input: {
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: ManagedSiteMutationConfirmedEffect
  execute(observer: { onDispatch(): void; onResponse(): void }): Promise<T>
}) =>
  await runManagedSiteMutationStep({
    sequence: input.sequence,
    effect: input.effect,
    execute: async (observer): Promise<MutationAttempt<T>> => {
      try {
        return { kind: "applied", data: await input.execute(observer) }
      } catch (error) {
        if (
          error instanceof Sub2ApiAdminApiError &&
          error.evidence.responseReceived &&
          error.evidence.confirmedNonApplication
        ) {
          return { kind: "rejected", error }
        }
        throw error
      }
    },
    classifyResponse: (attempt) =>
      attempt.kind === "applied"
        ? { outcome: "applied", data: attempt.data }
        : {
            outcome: "rejected",
            diagnostic: {
              message: attempt.error.message,
              ...(attempt.error.code === undefined
                ? {}
                : { code: String(attempt.error.code) }),
              ...(attempt.error.status === undefined
                ? {}
                : { statusCode: attempt.error.status }),
              raw: attempt.error,
            },
          },
  })

const toStatus = (status: number | undefined) =>
  status === CHANNEL_STATUS.Enable
    ? SUB2API_MANAGED_RESOURCE_STATUS.Active
    : SUB2API_MANAGED_RESOURCE_STATUS.Inactive

const getUsablePlainKey = (key: string | undefined) => {
  const trimmed = key?.trim() ?? ""
  return hasUsableManagedSiteChannelKey(trimmed) ? trimmed : undefined
}

const requireUsablePlainKey = (key: string | undefined) => {
  const usableKey = getUsablePlainKey(key)
  if (!usableKey) {
    throw new TypeError("Sub2API API key is required")
  }
  return usableKey
}

const isAbortLikeError = (error: unknown): error is Error =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError")

const toIdentityModelMapping = (models: unknown) => {
  if (typeof models !== "string") return undefined
  const normalized = [
    ...new Set(
      models
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ]
  return normalized.length
    ? Object.fromEntries(normalized.map((model) => [model, model]))
    : undefined
}

const toCreateInput = (
  channel: Parameters<
    ManagedSiteChannelsCapability<Sub2ApiManagedSiteConfig>["create"]
  >[1]["channel"],
) => {
  const modelMapping = toIdentityModelMapping(channel.models)
  return {
    name: channel.name?.trim() ?? "",
    platform: sub2ApiChannelTypeToPlatform(channel.type),
    baseUrl: channel.base_url?.trim() ?? "",
    apiKey: requireUsablePlainKey(channel.key),
    ...(modelMapping ? { modelMapping } : {}),
    // The legacy channel facade temporarily carries Sub2API concurrency in
    // `weight` only for this compatibility round trip. Provider-neutral native
    // imports must not reinterpret generic ordering weight as concurrency.
    ...(channel.weight && channel.weight > 0
      ? { concurrency: channel.weight }
      : {}),
    ...(channel.priority ? { priority: channel.priority } : {}),
    ...(channel.remark === undefined || channel.remark === null
      ? {}
      : { notes: channel.remark }),
  }
}

const toUpdateInput = (
  channel: Parameters<
    ManagedSiteChannelsCapability<Sub2ApiManagedSiteConfig>["update"]
  >[1],
): Sub2ApiApiKeyAccountUpdateInput => {
  const apiKey = getUsablePlainKey(channel.key)
  return {
    ...(channel.name === undefined ? {} : { name: channel.name }),
    ...(channel.base_url === undefined ? {} : { baseUrl: channel.base_url }),
    ...(apiKey ? { apiKey } : {}),
    ...(channel.weight === undefined ? {} : { concurrency: channel.weight }),
    ...(channel.priority === undefined ? {} : { priority: channel.priority }),
    ...(channel.status === undefined
      ? {}
      : { status: toStatus(channel.status) }),
  }
}

type Sub2ApiMutationOptions = Parameters<typeof createSub2ApiApiKeyAccount>[2]

/** Shared provider-native create mutation used by native CRUD and imports. */
export async function createSub2ApiManagedAccountMutation(
  config: Sub2ApiManagedSiteConfig,
  input: Sub2ApiApiKeyAccountCreateInput,
  desiredStatus: "active" | "inactive",
  options?: Sub2ApiMutationOptions,
): Promise<ManagedSiteMutationResult<Sub2ApiAdminApiKeyAccount>> {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const createStep = await runSub2ApiMutationStep<Sub2ApiAdminApiKeyAccount>({
    sequence,
    effect: createManagedSiteChannelEffect("resource-created"),
    execute: async (observer) =>
      await createSub2ApiApiKeyAccount(config, input, {
        ...options,
        observer,
      }),
  })
  if (createStep.outcome !== "applied") {
    return finishManagedSiteMutationStep(sequence, createStep)
  }

  let account = createStep.data
  if (desiredStatus === "inactive") {
    const statusStep = await runSub2ApiMutationStep<Sub2ApiAdminApiKeyAccount>({
      sequence,
      effect: createManagedSiteChannelEffect("status-updated", account.id),
      execute: async (observer) =>
        await updateSub2ApiApiKeyAccount(
          config,
          account.id,
          { status: SUB2API_MANAGED_RESOURCE_STATUS.Inactive },
          { ...options, observer },
        ),
    })
    if (statusStep.outcome !== "applied") {
      return finishManagedSiteMutationStep(sequence, statusStep)
    }
    account = statusStep.data
  }

  return sequence.finish({ finalState: "confirmed", data: account })
}

/** Shared provider-native update mutation used by native CRUD and imports. */
export async function updateSub2ApiManagedAccountMutation(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  input: Sub2ApiApiKeyAccountUpdateInput,
  options?: Sub2ApiMutationOptions,
): Promise<ManagedSiteMutationResult<Sub2ApiAdminApiKeyAccount>> {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const step = await runSub2ApiMutationStep<Sub2ApiAdminApiKeyAccount>({
    sequence,
    effect: createManagedSiteChannelEffect("resource-updated", accountId),
    execute: async (observer) =>
      await updateSub2ApiApiKeyAccount(config, accountId, input, {
        ...options,
        observer,
      }),
  })
  return step.outcome === "applied"
    ? sequence.finish({ finalState: "confirmed", data: step.data })
    : finishManagedSiteMutationStep(sequence, step)
}

/** Shared provider-native delete mutation used by native CRUD and imports. */
export async function deleteSub2ApiManagedAccountMutation(
  config: Sub2ApiManagedSiteConfig,
  accountId: number,
  options?: Sub2ApiMutationOptions,
): Promise<ManagedSiteMutationResult<void>> {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  const step = await runSub2ApiMutationStep<void>({
    sequence,
    effect: createManagedSiteChannelEffect("resource-deleted", accountId),
    execute: async (observer) => {
      await deleteSub2ApiApiKeyAccount(config, accountId, {
        ...options,
        observer,
      })
    },
  })
  return step.outcome === "applied"
    ? sequence.finish({ finalState: "confirmed", data: undefined })
    : finishManagedSiteMutationStep(sequence, step)
}

export const sub2ApiManagedSiteChannels: ManagedSiteChannelsCapability<Sub2ApiManagedSiteConfig> =
  {
    list: async (config, options) =>
      toSub2ApiManagedSiteChannelList(
        await listSub2ApiApiKeyAccounts(config, options),
      ),
    search: async (config, keyword) =>
      toSub2ApiManagedSiteChannelList(
        await searchSub2ApiApiKeyAccounts(config, keyword),
      ),
    create: async (config, payload) => {
      const result = await createSub2ApiManagedAccountMutation(
        config,
        toCreateInput(payload.channel),
        payload.channel.status === CHANNEL_STATUS.Enable
          ? "active"
          : "inactive",
      )
      return result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
        ? {
            ...result,
            data: sub2ApiAccountToManagedSiteChannel(result.data),
          }
        : result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial &&
            result.data
          ? {
              ...result,
              data: sub2ApiAccountToManagedSiteChannel(result.data),
            }
          : result
    },
    update: async (config, channel) => {
      const result = await updateSub2ApiManagedAccountMutation(
        config,
        channel.id,
        toUpdateInput(channel),
      )
      return result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
        ? {
            ...result,
            data: sub2ApiAccountToManagedSiteChannel(result.data),
          }
        : result
    },
    delete: async (config, channelId) =>
      await deleteSub2ApiManagedAccountMutation(config, channelId),
    fetchSecretKey: async (config, channelId) =>
      await revealSub2ApiApiKey(config, channelId),
    hydrateComparableKeys: async (config, candidates) => {
      const hydrated: ManagedSiteChannel[] = []
      for (const candidate of candidates) {
        if (hasUsableManagedSiteChannelKey(candidate.key)) {
          hydrated.push(candidate)
          continue
        }

        try {
          hydrated.push({
            ...candidate,
            key: await revealSub2ApiApiKey(config, candidate.id),
          })
        } catch (error) {
          if (isAbortLikeError(error)) throw error
          if (
            error instanceof Sub2ApiAdminApiError &&
            error.code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE
          ) {
            throw new MatchResolutionUnresolvedError(
              MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
            )
          }
          throw new MatchResolutionUnresolvedError(
            MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
          )
        }
      }
      return hydrated
    },
  }

const checkValid = async () => {
  try {
    const prefs = await userPreferences.getPreferences()
    return Boolean(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.SUB2API),
    )
  } catch {
    return false
  }
}

const configCapability: ManagedSiteConfigCapability<Sub2ApiManagedSiteConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.SUB2API, checkValid)

const channelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const resourceScope = (config: Sub2ApiManagedSiteConfig) =>
  normalizeManagedUpstreamResourceScopeKey(config.baseUrl)

const toResourceSummary = (
  config: Sub2ApiManagedSiteConfig,
  account: Sub2ApiAdminApiKeyAccount,
): ManagedUpstreamResourceSummary => ({
  ref: createManagedUpstreamResourceRef({
    managedSiteType: SITE_TYPES.SUB2API,
    scopeKey: resourceScope(config),
    resourceId: account.id,
  }),
  displayName: account.name,
  nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
  status:
    account.status === SUB2API_MANAGED_RESOURCE_STATUS.Active
      ? MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled
      : account.status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive
        ? MANAGED_UPSTREAM_RESOURCE_STATUSES.Disabled
        : account.status === SUB2API_MANAGED_RESOURCE_STATUS.Error
          ? MANAGED_UPSTREAM_RESOURCE_STATUSES.AutoDisabled
          : MANAGED_UPSTREAM_RESOURCE_STATUSES.Unknown,
  typeLabel: account.platform,
  endpointLabel:
    typeof account.credentials?.base_url === "string"
      ? account.credentials.base_url
      : undefined,
  secretState: account.credentials_status?.has_api_key
    ? MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Masked
    : MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Unavailable,
  capabilities: {
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canRevealSecret: Boolean(account.credentials_status?.has_api_key),
  },
})

const assertRef = (
  config: Sub2ApiManagedSiteConfig,
  ref: ManagedUpstreamResourceSummary["ref"],
) =>
  assertManagedUpstreamResourceRefScope(ref, {
    managedSiteType: SITE_TYPES.SUB2API,
    scopeKey: resourceScope(config),
  })

const toResourceMutationResult = (
  result: ManagedSiteMutationResult<unknown>,
): ManagedSiteMutationResult<ManagedUpstreamResourceSummary | null> => {
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return { ...result, data: null }
  }
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    const { data, ...partial } = result
    return data === undefined ? partial : { ...partial, data: null }
  }
  return result
}

const resources: ManagedUpstreamResourcesCapability<
  Sub2ApiManagedSiteConfig,
  Sub2ApiAdminApiKeyAccount,
  ChannelFormData
> = {
  items: {
    list: async (config, options) => {
      const data = await listSub2ApiApiKeyAccounts(config, {
        signal: options?.signal,
      })
      return {
        items: data.items.map((item) => toResourceSummary(config, item)),
        total: data.total,
      }
    },
    search: async (config, keyword) => {
      const data = await searchSub2ApiApiKeyAccounts(config, keyword)
      return {
        items: data.items.map((item) => toResourceSummary(config, item)),
        total: data.total,
      }
    },
    getDetail: async (config, ref) => {
      assertRef(config, ref)
      const native = await getSub2ApiApiKeyAccount(
        config,
        parseSub2ApiResourceId(ref.resourceId),
      )
      return { summary: toResourceSummary(config, native), native }
    },
    create: async (config, draft) =>
      toResourceMutationResult(
        await sub2ApiManagedSiteChannels.create(
          config,
          buildChannelPayload(draft),
        ),
      ),
    update: async (config, detail, draft) =>
      toResourceMutationResult(
        await sub2ApiManagedSiteChannels.update(config, {
          id: detail.native.id,
          name: draft.name,
          type: draft.type,
          key: draft.key,
          base_url: draft.base_url,
          priority: draft.priority,
          weight: draft.weight,
          status: draft.status,
        }),
      ),
    delete: async (config, ref) => {
      assertRef(config, ref)
      return await sub2ApiManagedSiteChannels.delete(
        config,
        parseSub2ApiResourceId(ref.resourceId),
      )
    },
  },
  drafts: {
    prepareImportDraft: async (input) => {
      if (input.source && typeof input.source === "object") {
        return input.source as ChannelFormData
      }
      return {
        name: input.resource?.displayName ?? "",
        type: sub2ApiPlatformToChannelType(SUB2API_DEFAULT_ACCOUNT_PLATFORM),
        key: "",
        base_url: input.resource?.endpointLabel ?? "",
        models: [],
        groups: [],
        priority: 0,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }
    },
    prepareEditDraft: (detail) => {
      // This legacy facade intentionally preserves only its historical field
      // surface. The provider-native registration owns notes/model editing and
      // replaces this path once the legacy resource facade has no callers.
      const channel = sub2ApiAccountToManagedSiteChannel(detail.native)
      return {
        name: channel.name,
        type: channel.type,
        key: channel.key ?? "",
        base_url: channel.base_url ?? "",
        models: [],
        groups: [],
        priority: channel.priority,
        weight: channel.weight,
        status: channel.status,
      }
    },
    describeFields: () => [
      {
        name: "name",
        label: "Name",
        type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Text,
        required: true,
      },
      {
        name: "base_url",
        label: "Base URL",
        type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Text,
        required: true,
      },
      {
        name: "key",
        label: "API Key",
        type: MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES.Secret,
        required: true,
      },
    ],
    validateDraft: (draft) => {
      const errors: ManagedUpstreamResourceDraftValidationIssue[] = []
      if (!draft?.name?.trim())
        errors.push({ field: "name", message: "Name is required" })
      if (!draft?.base_url?.trim())
        errors.push({ field: "base_url", message: "Base URL is required" })
      if (!hasUsableManagedSiteChannelKey(draft?.key))
        errors.push({ field: "key", message: "API Key is required" })
      return { valid: errors.length === 0, errors }
    },
  },
  secrets: {
    revealSecret: async (config, ref) => {
      assertRef(config, ref)
      const accountId = parseSub2ApiResourceId(ref.resourceId)
      try {
        return {
          status: "available",
          secret: await revealSub2ApiApiKey(config, accountId),
        }
      } catch (error) {
        if (
          error instanceof Sub2ApiAdminApiError &&
          error.code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE
        ) {
          return { status: "unsupported" }
        }
        return { status: "unavailable" }
      }
    },
  },
}

export const sub2ApiManagedSiteCapabilities = {
  channels: sub2ApiManagedSiteChannels,
  resources,
  config: configCapability,
  queries: emptyManagedSiteQueries,
  channelDrafts,
}
