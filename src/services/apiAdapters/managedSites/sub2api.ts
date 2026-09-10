import { SITE_TYPES } from "~/constants/siteType"
import { SUB2API_MANAGED_RESOURCE_STATUS } from "~/constants/sub2api"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  toManagedResourceMatchCandidate,
  toNativeNumericMatchCandidates,
} from "~/services/apiAdapters/managedResources/matchingInputs"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  createManagedSiteMutationSequence,
  runManagedSiteMutationStep,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import {
  createSub2ApiApiKeyAccount,
  deleteSub2ApiApiKeyAccount,
  listSub2ApiApiKeyAccounts,
  prepareChannelFormData,
  revealSub2ApiApiKey,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
  updateSub2ApiApiKeyAccount,
  type Sub2ApiApiKeyAccountCreateInput,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"

import { createManagedSiteConfigCapability } from "./config"
import {
  createManagedSiteChannelEffect,
  finishManagedSiteMutationStep,
} from "./request"

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

const isAbortLikeError = (error: unknown): error is Error =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError")

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
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<Sub2ApiManagedSiteConfig> = {
  // Native API-key accounts have URL/key identity; no channel model inventory.
  exactMatchBasis: "url-key",
  // The upstream search is name-only; inspect the URL bucket from a full API-key inventory.
  search: async (config) => {
    const data = await listSub2ApiApiKeyAccounts(config)
    const items = data.items
      .filter((account) => account.type === "apikey")
      .map((account) => ({
        ref: createManagedChannelResourceRef(
          SITE_TYPES.SUB2API,
          config.baseUrl,
          account.id,
        ),
        name: account.name || `Sub2API Account ${account.id}`,
        type: account.platform,
        base_url:
          typeof account.credentials?.base_url === "string"
            ? account.credentials.base_url
            : "",
        key: account.credentials_status?.has_api_key ? "********" : "",
        models: "",
      }))
    return { items, total: data.total, type_counts: {} }
  },
  fetchSecretKey: async (config, ref, options) =>
    revealSub2ApiApiKey(
      config,
      requireManagedResourceChannelId(SITE_TYPES.SUB2API, config, ref),
      options,
    ),
  hydrateComparableKeys: async (config, candidates, options) => {
    const target = { siteType: SITE_TYPES.SUB2API, config }
    const nativeCandidates = toNativeNumericMatchCandidates(candidates, target)
    const hydrated = []
    for (const candidate of nativeCandidates) {
      if (hasUsableManagedSiteChannelKey(candidate.key)) {
        hydrated.push(candidate)
        continue
      }
      try {
        hydrated.push({
          ...candidate,
          key: await revealSub2ApiApiKey(config, candidate.id, options),
        })
      } catch (error) {
        if (isAbortLikeError(error)) throw error
        throw new MatchResolutionUnresolvedError(
          error instanceof Sub2ApiAdminApiError &&
          error.code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE
            ? MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED
            : MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
        )
      }
    }
    return hydrated.map((candidate) =>
      toManagedResourceMatchCandidate(candidate, target),
    )
  },
}
export const sub2ApiManagedSiteCapabilities = {
  siteType: SITE_TYPES.SUB2API,
  matching,
  config: configCapability,
  channelDrafts,
} satisfies ManagedSiteCapabilities<
  Sub2ApiManagedSiteConfig,
  typeof SITE_TYPES.SUB2API
>
