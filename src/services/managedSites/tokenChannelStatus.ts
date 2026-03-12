import { VELOERA } from "~/constants/siteType"
import type {
  ManagedSiteConfig,
  ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import {
  findManagedSiteChannelByBaseUrl,
  findManagedSiteChannelByComparableInputs,
} from "~/services/managedSites/utils/channelMatching"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteTokenChannelStatus")

export const MANAGED_SITE_TOKEN_CHANNEL_STATUSES = {
  ADDED: "added",
  NOT_ADDED: "not-added",
  UNKNOWN: "unknown",
} as const

export const MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS = {
  CONFIG_MISSING: "config-missing",
  INPUT_PREPARATION_FAILED: "input-preparation-failed",
  EXACT_VERIFICATION_UNAVAILABLE: "exact-verification-unavailable",
  VELOERA_BASE_URL_SEARCH_UNSUPPORTED: "veloera-base-url-search-unsupported",
  URL_MODELS_MATCH_ONLY: "url-models-match-only",
  URL_ONLY_MATCH_ONLY: "url-only-match-only",
  BACKEND_SEARCH_FAILED: "backend-search-failed",
} as const

export type ManagedSiteTokenChannelStatusUnknownReason =
  (typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS)[keyof typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS]

export interface ManagedSiteTokenChannelStatusMatchedChannel {
  id: number
  name: string
}

export type ManagedSiteTokenChannelStatusValue =
  (typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES)[keyof typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES]

export type ManagedSiteTokenChannelStatus =
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
      matchedChannel: ManagedSiteTokenChannelStatusMatchedChannel
    }
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED
    }
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
      reason: ManagedSiteTokenChannelStatusUnknownReason
      diagnostic?: string
      matchedChannel?: ManagedSiteTokenChannelStatusMatchedChannel
    }

interface GetManagedSiteTokenChannelStatusParams {
  account: DisplaySiteData
  token: ApiToken | AccountToken
  service?: ManagedSiteService
  managedConfig?: ManagedSiteConfig | null
}

const toMatchedChannelSummary = (
  channel: ManagedSiteChannel,
): ManagedSiteTokenChannelStatusMatchedChannel => ({
  id: channel.id,
  name: channel.name,
})

const collectSecrets = (
  token: ApiToken | AccountToken,
  managedConfig: ManagedSiteConfig | null,
) => {
  return [token.key, managedConfig?.token].filter(Boolean) as string[]
}

/**
 * Resolves the current managed-site channel status for a token using the same
 * matching semantics as the import duplicate-check flow, but with explicit
 * `added` / `not-added` / `unknown` outcomes for Key Management.
 */
export async function getManagedSiteTokenChannelStatus(
  params: GetManagedSiteTokenChannelStatusParams,
): Promise<ManagedSiteTokenChannelStatus> {
  const { account, token } = params
  const service = params.service ?? (await getManagedSiteService())
  const managedConfig = params.managedConfig ?? (await service.getConfig())

  if (!managedConfig) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason: MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING,
    }
  }

  const secretsToRedact = collectSecrets(token, managedConfig)

  try {
    const formData = await service.prepareChannelFormData(account, token)

    if (!formData.base_url.trim() || formData.models.length === 0) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
        diagnostic: "missing-comparable-inputs",
      }
    }

    // This feature is not supported on Veloera because Veloera's
    // `/api/channel/search` does not support reliable base URL lookup, so this
    // verification flow cannot produce a trustworthy presence/absence result.
    if (service.siteType === VELOERA) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.VELOERA_BASE_URL_SEARCH_UNSUPPORTED,
      }
    }

    const exactMatch = formData.key.trim()
      ? await service.findMatchingChannel(
          managedConfig.baseUrl,
          managedConfig.token,
          managedConfig.userId,
          formData.base_url,
          formData.models,
          formData.key,
        )
      : null

    if (exactMatch) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
        matchedChannel: toMatchedChannelSummary(exactMatch),
      }
    }

    const searchResults = await service.searchChannel(
      managedConfig.baseUrl,
      managedConfig.token,
      managedConfig.userId,
      formData.base_url,
    )

    if (!searchResults) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED,
      }
    }

    const urlAndModelsMatch = findManagedSiteChannelByComparableInputs({
      channels: searchResults.items ?? [],
      accountBaseUrl: formData.base_url,
      models: formData.models,
    })

    if (urlAndModelsMatch) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.URL_MODELS_MATCH_ONLY,
        matchedChannel: toMatchedChannelSummary(urlAndModelsMatch),
      }
    }

    const urlOnlyMatch = findManagedSiteChannelByBaseUrl({
      channels: searchResults.items ?? [],
      accountBaseUrl: formData.base_url,
    })

    if (urlOnlyMatch) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.URL_ONLY_MATCH_ONLY,
        matchedChannel: toMatchedChannelSummary(urlOnlyMatch),
      }
    }

    if (!formData.key.trim()) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      }
    }

    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
    }
  } catch (error) {
    const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)

    logger.warn("Managed-site token status check failed", {
      accountId: account.id,
      tokenId: token.id,
      siteType: service.siteType,
      diagnostic,
    })

    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
      diagnostic,
    }
  }
}
