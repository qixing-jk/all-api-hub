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
} from "~/services/apiAdapters/managedResources/shared/matchingInputs"
import { createChannelVerificationProtocolResolver } from "~/services/apiAdapters/managedResources/shared/modelInputs"
import { requireManagedResourceChannelId } from "~/services/apiAdapters/managedResources/shared/resourceIds"
import { createManagedSiteConfigCapability } from "~/services/apiAdapters/managedSites/config"
import { searchProviders } from "~/services/apiService/claudeCodeHub"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  checkValidClaudeCodeHubConfig,
  fetchChannelSecretKey,
  hydrateComparableChannelKeys,
  prepareChannelFormData,
  toClaudeCodeHubDisclosureError,
} from "~/services/managedSites/providers/claudeCodeHub"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { normalizeList } from "~/utils/core/string"

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
  models: {
    resolveVerificationProtocol: createChannelVerificationProtocolResolver({
      [CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE]:
        API_TYPES.OPENAI_COMPATIBLE,
      [CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX]: API_TYPES.OPENAI,
      [CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE]: API_TYPES.ANTHROPIC,
      [CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI]: API_TYPES.GOOGLE,
    }),
  },
  config: claudeCodeHubManagedSiteConfig,
  channelDrafts: claudeCodeHubManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<
  ClaudeCodeHubConfig,
  typeof SITE_TYPES.CLAUDE_CODE_HUB
>
