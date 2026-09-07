import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { requireNumericManagedResourceId } from "~/services/apiAdapters/managedResources/matchingInputs"
import { searchProviders } from "~/services/apiService/claudeCodeHub"
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
  search: async (config, keyword) =>
    runClaudeCodeHubResourceRead(config, async () => {
      const items = (await searchProviders(config, keyword)).map(
        (provider) => ({
          id: provider.id,
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
  fetchSecretKey: async (config, id) =>
    fetchChannelSecretKey(config, requireNumericManagedResourceId(id)),
  hydrateComparableKeys: async (config, candidates) => {
    const hydrated = []
    for (const candidate of candidates) {
      const [result] = await hydrateComparableChannelKeys(config, [
        { ...candidate, id: requireNumericManagedResourceId(candidate.id) },
      ])
      hydrated.push(result)
    }
    return hydrated
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
