import { VELOERA } from "~/constants/siteType"
import {
  getManagedSiteChannelExactMatch,
  type ManagedSiteChannelKeyMatchReasonValue,
  type ManagedSiteChannelMatchInspection,
  type ManagedSiteChannelModelsMatchReasonValue,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import type {
  ManagedSiteConfig,
  ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
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
  MATCH_REQUIRES_CONFIRMATION: "match-requires-confirmation",
  BACKEND_SEARCH_FAILED: "backend-search-failed",
} as const

export type ManagedSiteTokenChannelStatusUnknownReason =
  (typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS)[keyof typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS]

export interface ManagedSiteTokenChannelStatusMatchedChannel {
  id: number
  name: string
}

export interface ManagedSiteTokenChannelAssessment {
  searchBaseUrl: string
  searchCompleted: boolean
  url: {
    matched: boolean
    candidateCount: number
    channel?: ManagedSiteTokenChannelStatusMatchedChannel
  }
  key: {
    comparable: boolean
    matched: boolean
    reason: ManagedSiteChannelKeyMatchReasonValue
    channel?: ManagedSiteTokenChannelStatusMatchedChannel
  }
  models: {
    comparable: boolean
    matched: boolean
    reason: ManagedSiteChannelModelsMatchReasonValue
    channel?: ManagedSiteTokenChannelStatusMatchedChannel
    similarityScore?: number
  }
}

export type ManagedSiteTokenChannelStatusValue =
  (typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES)[keyof typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES]

export type ManagedSiteTokenChannelStatus =
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
      matchedChannel: ManagedSiteTokenChannelStatusMatchedChannel
      assessment: ManagedSiteTokenChannelAssessment
    }
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED
      assessment: ManagedSiteTokenChannelAssessment
    }
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
      reason:
        | typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION
        | typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
      assessment: ManagedSiteTokenChannelAssessment
    }
  | {
      status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
      reason: Exclude<
        ManagedSiteTokenChannelStatusUnknownReason,
        | typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION
        | typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
      >
      diagnostic?: string
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

const toOptionalMatchedChannelSummary = (channel: ManagedSiteChannel | null) =>
  channel ? toMatchedChannelSummary(channel) : undefined

const toManagedSiteTokenChannelAssessment = (
  inspection: ManagedSiteChannelMatchInspection,
): ManagedSiteTokenChannelAssessment => ({
  searchBaseUrl: inspection.searchBaseUrl,
  searchCompleted: inspection.searchCompleted,
  url: {
    matched: inspection.url.matched,
    candidateCount: inspection.url.candidateCount,
    channel: toOptionalMatchedChannelSummary(inspection.url.channel),
  },
  key: {
    comparable: inspection.key.comparable,
    matched: inspection.key.matched,
    reason: inspection.key.reason,
    channel: toOptionalMatchedChannelSummary(inspection.key.channel),
  },
  models: {
    comparable: inspection.models.comparable,
    matched: inspection.models.matched,
    reason: inspection.models.reason,
    channel: toOptionalMatchedChannelSummary(inspection.models.channel),
    similarityScore: inspection.models.similarityScore,
  },
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

  try {
    const normalizedAccountBaseUrl = normalizeManagedSiteChannelBaseUrl(
      account.baseUrl,
    )
    const formData = await service.prepareChannelFormData(
      {
        ...account,
        baseUrl: normalizedAccountBaseUrl,
      },
      token,
    )
    const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(formData.base_url)

    if (!searchBaseUrl || formData.models.length === 0) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
        diagnostic: "missing-comparable-inputs",
      }
    }

    const resolution = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: searchBaseUrl,
      models: formData.models,
      key: formData.key,
    })
    const assessment = toManagedSiteTokenChannelAssessment(resolution)
    const exactMatch = getManagedSiteChannelExactMatch(resolution)

    if (exactMatch) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
        matchedChannel: toMatchedChannelSummary(exactMatch),
        assessment,
      }
    }

    if (!resolution.searchCompleted) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED,
      }
    }

    if (
      !formData.key.trim() ||
      (resolution.url.matched && !resolution.key.comparable)
    ) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
        assessment,
      }
    }

    if (
      resolution.key.matched ||
      resolution.models.matched ||
      resolution.url.matched
    ) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
        assessment,
      }
    }

    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
      assessment,
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
