import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { normalizeAccountForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import { requireNumericManagedResourceId } from "~/services/apiAdapters/managedResources/matchingInputs"
import * as claudeCodeHubApi from "~/services/apiService/claudeCodeHub"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { buildManagedSiteChannelName } from "~/services/managedSites/utils/channelDraft"
import { fetchTokenScopedModels } from "~/services/managedSites/utils/fetchTokenScopedModels"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import { type ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("ClaudeCodeHubService")
const DEFAULT_GROUP_TAG = "default"

/** Creates a detached error safe for user-facing and local-log disclosure. */
export function toClaudeCodeHubDisclosureError(
  error: unknown,
  config: ClaudeCodeHubConfig,
  extraSecrets: readonly string[] = [],
): Error {
  const message = toSanitizedErrorSummary(error, [
    config.adminToken,
    ...extraSecrets,
  ])
  return new Error(message || "Claude Code Hub request failed")
}

const runClaudeCodeHubRead = async <T>(
  config: ClaudeCodeHubConfig,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toClaudeCodeHubDisclosureError(error, config)
  }
}

/**
 * Checks whether preferences contain a usable Claude Code Hub admin config.
 */
function hasValidClaudeCodeHubConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.claudeCodeHub) return false
  const { baseUrl, adminToken } = prefs.claudeCodeHub
  return Boolean(baseUrl?.trim() && adminToken?.trim())
}

/**
 * Verifies the saved Claude Code Hub config can authenticate successfully.
 */
export async function checkValidClaudeCodeHubConfig(): Promise<boolean> {
  let config: ClaudeCodeHubConfig | undefined
  try {
    const prefs = await userPreferences.getPreferences()
    if (!hasValidClaudeCodeHubConfig(prefs) || !prefs.claudeCodeHub) {
      return false
    }
    config = prefs.claudeCodeHub
    return await claudeCodeHubApi.validateClaudeCodeHubConfig(config)
  } catch (error) {
    logger.warn(
      "Claude Code Hub config validation failed",
      config
        ? toClaudeCodeHubDisclosureError(error, config).message
        : toSanitizedErrorSummary(error, []),
    )
    return false
  }
}

/**
 * Resolves a real provider key when list data only contains a masked key.
 */
async function hydrateComparableChannelKey<
  T extends ManagedResourceMatchCandidate,
>(config: ClaudeCodeHubConfig, channel: T): Promise<T | null> {
  if (hasUsableManagedSiteChannelKey(channel.key)) {
    return channel
  }

  try {
    const key = await claudeCodeHubApi.getUnmaskedProviderKey(
      config,
      requireNumericManagedResourceId(channel.id),
    )
    if (!hasUsableManagedSiteChannelKey(key)) {
      throw new Error("Claude Code Hub returned an unusable provider key")
    }
    return {
      ...channel,
      key: key.trim(),
    }
  } catch (error) {
    const disclosed = toClaudeCodeHubDisclosureError(error, config)
    logger.warn("Failed to hydrate Claude Code Hub provider key", {
      channelId: channel.id,
      error: disclosed.message,
    })
    return null
  }
}

/**
 * Hydrates Claude Code Hub provider keys for shared channel comparison.
 */
export async function hydrateComparableChannelKeys<
  T extends ManagedResourceMatchCandidate,
>(config: ClaudeCodeHubConfig, candidates: T[]): Promise<T[]> {
  const hydratedCandidates: T[] = []

  for (const candidate of candidates) {
    if (hasUsableManagedSiteChannelKey(candidate.key)) {
      hydratedCandidates.push(candidate)
      continue
    }

    const hydratedChannel = await hydrateComparableChannelKey(config, candidate)
    if (hydratedChannel) {
      hydratedCandidates.push(hydratedChannel)
      continue
    }

    throw new MatchResolutionUnresolvedError(
      MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
    )
  }

  return hydratedCandidates
}

/**
 * Fetches the real Claude Code Hub provider key for edit, comparison, and export flows.
 */
export async function fetchChannelSecretKey(
  config: ClaudeCodeHubConfig,
  channelId: number,
): Promise<string> {
  return await runClaudeCodeHubRead(
    config,
    async () =>
      await claudeCodeHubApi.getUnmaskedProviderKey(config, channelId),
  )
}

/**
 * Prefills channel form data from an account and its scoped token models.
 */
export async function prepareChannelFormData(
  account: DisplaySiteData,
  token: ApiToken | AccountToken,
): Promise<ManagedSiteChannelDraft> {
  const upstreamAccount = normalizeAccountForManagedChannel(account)
  const { models: availableModels, fetchFailed } = await fetchTokenScopedModels(
    upstreamAccount,
    token,
  )

  return {
    name: buildManagedSiteChannelName(account, token),
    type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
    key: token.key,
    base_url: upstreamAccount.baseUrl,
    models: normalizeList(availableModels),
    ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
    groups: [DEFAULT_GROUP_TAG],
    priority: 0,
    weight: 1,
    enabled: true,
  }
}
