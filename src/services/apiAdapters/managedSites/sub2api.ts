import { SITE_TYPES } from "~/constants/siteType"
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
import { sharePendingConfigRead } from "~/services/apiTransport/requestScheduling"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  listSub2ApiApiKeyAccounts,
  prepareChannelFormData,
  revealSub2ApiApiKey,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
} from "~/services/managedSites/providers/sub2api"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"

import { createManagedSiteConfigCapability } from "./config"

const isAbortLikeError = (error: unknown): error is Error =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError")

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

const readMatchingInventory = sharePendingConfigRead(listSub2ApiApiKeyAccounts)

const matching: ManagedResourceMatchingCapability<Sub2ApiManagedSiteConfig> = {
  // Native API-key accounts have URL/key identity; no channel model inventory.
  exactMatchBasis: "url-key",
  // The upstream search is name-only; inspect the URL bucket from a full API-key inventory.
  search: async (config, _keyword, options) => {
    const data = await readMatchingInventory(config, options)
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
/**
 * Config, credential-import drafts and duplicate matching still consume this
 * capability. Native CRUD and migration use the provider core directly; remove
 * this adapter only after those remaining registry consumers are migrated.
 */
export const sub2ApiManagedSiteCapabilities = {
  siteType: SITE_TYPES.SUB2API,
  matching,
  config: configCapability,
  channelDrafts,
} satisfies ManagedSiteCapabilities<
  Sub2ApiManagedSiteConfig,
  typeof SITE_TYPES.SUB2API
>
