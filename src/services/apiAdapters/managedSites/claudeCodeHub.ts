import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
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
import { searchProviders } from "~/services/apiService/claudeCodeHub"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  checkValidClaudeCodeHubConfig,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  prepareChannelFormData,
  toClaudeCodeHubDisclosureError,
} from "~/services/managedSites/providers/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { normalizeList } from "~/utils/core/string"

import { createManagedSiteConfigCapability } from "./config"

const runClaudeCodeHubResourceRead = async <T>(
  config: ClaudeCodeHubConfig,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toClaudeCodeHubDisclosureError(error, config)
  }
}

const claudeCodeHubManagedSiteConfig: ManagedSiteConfigCapability<ClaudeCodeHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.CLAUDE_CODE_HUB,
    checkValidClaudeCodeHubConfig,
  )

const claudeCodeHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability =
  { prepareFormData: prepareChannelFormData }

const matching: ManagedResourceMatchingCapability<ClaudeCodeHubConfig> = {
  search: async (config, keyword, options) =>
    runClaudeCodeHubResourceRead(config, async () => {
      const items = (await searchProviders(config, keyword, options)).map(
        (provider) => ({
          ref: createManagedChannelResourceRef(
            SITE_TYPES.CLAUDE_CODE_HUB,
            config.baseUrl,
            provider.id,
          ),
          name: provider.name || `Provider ${provider.id}`,
          type:
            provider.providerType ||
            CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
          base_url: provider.url ?? "",
          key: provider.maskedKey ?? provider.key ?? "",
          models: normalizeList(
            (provider.allowedModels ?? []).map((model) =>
              typeof model === "string"
                ? model
                : !model.matchType || model.matchType === "exact"
                  ? model.pattern ?? ""
                  : "",
            ),
          ).join(","),
        }),
      )
      return { items, total: items.length, type_counts: {} }
    }),
  fetchSecretKey: async (config, ref, options) =>
    fetchChannelSecretKey(
      config,
      requireManagedResourceChannelId(SITE_TYPES.CLAUDE_CODE_HUB, config, ref),
      options,
    ),
  hydrateComparableKeys: async (config, candidates, options) => {
    const target = { siteType: SITE_TYPES.CLAUDE_CODE_HUB, config }
    const hydrated = await hydrateComparableChannelKeys(
      config,
      toNativeNumericMatchCandidates(candidates, target),
      options,
    )
    return hydrated.map((candidate) =>
      toManagedResourceMatchCandidate(candidate, target),
    )
  },
}
export const claudeCodeHubManagedSiteCapabilities = {
  siteType: SITE_TYPES.CLAUDE_CODE_HUB,
  matching,
  config: claudeCodeHubManagedSiteConfig,
  channelDrafts: claudeCodeHubManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<
  ClaudeCodeHubConfig,
  typeof SITE_TYPES.CLAUDE_CODE_HUB
>
