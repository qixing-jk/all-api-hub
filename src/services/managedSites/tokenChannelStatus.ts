import { SITE_TYPES } from "~/constants/siteType"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import {
  getManagedSiteChannelExactMatch,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import type {
  ManagedSiteConfig,
  ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import { getNewApiLoginAssistConfig } from "~/services/managedSites/providers/newApi"
import {
  hasNewApiAuthenticatedBrowserSession,
  hasNewApiLoginAssistCredentials,
} from "~/services/managedSites/providers/newApiSession"
import { hasNewApiTotpSecret } from "~/services/managedSites/providers/newApiTotp"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import {
  collectManagedConfigSecrets,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import {
  applyVerifiedManagedSiteChannelKey,
  toManagedSiteAssessmentChannel,
  toManagedSiteVerifiedKeyAssessment,
  type ManagedSiteAssessmentChannel,
  type ManagedSiteVerifiedKeyAssessment,
} from "~/services/managedSites/verifiedChannelKeyAssessment"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type { NewApiConfig } from "~/types/newApiConfig"
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
  BASE_URL_SEARCH_UNSUPPORTED: "base-url-search-unsupported",
  MATCH_REQUIRES_CONFIRMATION: "match-requires-confirmation",
  BACKEND_SEARCH_FAILED: "backend-search-failed",
} as const

export type ManagedSiteTokenChannelStatusUnknownReason =
  (typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS)[keyof typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS]

export type ManagedSiteTokenChannelStatusMatchedChannel =
  ManagedSiteAssessmentChannel

export type ManagedSiteTokenChannelAssessment =
  ManagedSiteVerifiedKeyAssessment<ManagedSiteTokenChannelStatusMatchedChannel>

export interface ManagedSiteTokenChannelRecovery {
  siteType: typeof SITE_TYPES.NEW_API
  managedBaseUrl: string
  searchBaseUrl?: string
  loginCredentialsConfigured: boolean
  authenticatedBrowserSessionExists: boolean
  automaticCodeConfigured: boolean
}

interface ManagedSiteTokenChannelResolvedKeys {
  resolvedChannelKeysById?: Record<number, string>
}

export type ManagedSiteTokenChannelStatus =
  ManagedSiteTokenChannelResolvedKeys &
    (
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
          reason: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION
          assessment: ManagedSiteTokenChannelAssessment
        }
      | {
          status: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
          reason: typeof MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
          assessment?: ManagedSiteTokenChannelAssessment
          diagnostic?: string
          recovery?: ManagedSiteTokenChannelRecovery
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
    )

interface GetManagedSiteTokenChannelStatusParams {
  account: DisplaySiteData
  token: ApiToken | AccountToken
  service?: ManagedSiteService
  managedConfig?: ManagedSiteConfig | null
  resolvedChannelKeysById?: Record<number, string>
  operationContext?: ManagedSiteOperationContext
}

interface ResolveManagedSiteTokenChannelStatusWithVerifiedKeyParams {
  status: ManagedSiteTokenChannelStatus
  tokenKey: string
  channelId: number
  channelKey: string
  siteType?: ManagedSiteService["siteType"] | string
}

const findAssessmentChannelSummary = (
  assessment: ManagedSiteTokenChannelAssessment,
  channelId: number,
) => {
  return [
    assessment.key.channel,
    assessment.models.channel,
    assessment.url.channel,
  ].find((channel) => channel?.id === channelId)
}

const collectSecrets = (
  token: ApiToken | AccountToken,
  managedConfig: ManagedSiteConfig | null,
) => {
  return [
    token.key,
    ...(managedConfig ? collectManagedConfigSecrets(managedConfig) : []),
  ].filter(Boolean) as string[]
}

const isNewApiConfig = (config: ManagedSiteConfig): config is NewApiConfig =>
  "adminToken" in config && "userId" in config

const isExactVerificationUnavailable = (
  resolution: ManagedSiteChannelMatchInspection,
) => resolution.url.matched && !resolution.key.comparable

/**
 * Recomputes a token's managed-site status after a channel key has been
 * verified, reusing the current assessment instead of running a full check.
 */
export function resolveManagedSiteTokenChannelStatusWithVerifiedKey(
  params: ResolveManagedSiteTokenChannelStatusWithVerifiedKeyParams,
): ManagedSiteTokenChannelStatus {
  const assessment =
    "assessment" in params.status ? params.status.assessment : undefined

  if (!assessment) {
    return params.status
  }

  const channelSummary = findAssessmentChannelSummary(
    assessment,
    params.channelId,
  )
  const resolvedChannelKeysById = {
    ...(params.status.resolvedChannelKeysById ?? {}),
    [params.channelId]: params.channelKey,
  }

  if (!channelSummary) {
    return {
      ...params.status,
      resolvedChannelKeysById,
    } as ManagedSiteTokenChannelStatus
  }

  const applied = applyVerifiedManagedSiteChannelKey({
    assessment,
    candidate: channelSummary,
    sourceKey: params.tokenKey,
    verifiedChannelKey: params.channelKey,
    siteType: params.siteType,
  })

  if (applied.exactMatch) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: channelSummary,
      assessment: applied.assessment,
      resolvedChannelKeysById,
    }
  }

  if (applied.hasAnyMatch) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      assessment: applied.assessment,
      resolvedChannelKeysById,
    }
  }

  return {
    status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
    assessment: applied.assessment,
    resolvedChannelKeysById,
  }
}

const buildNewApiRecoveryMetadata = async (params: {
  managedConfig: NewApiConfig
  assessment?: ManagedSiteTokenChannelAssessment
}): Promise<ManagedSiteTokenChannelRecovery> => {
  const loginAssistConfig = await getNewApiLoginAssistConfig()

  return {
    siteType: SITE_TYPES.NEW_API,
    managedBaseUrl: params.managedConfig.baseUrl,
    searchBaseUrl: params.assessment?.searchBaseUrl,
    loginCredentialsConfigured:
      hasNewApiLoginAssistCredentials(loginAssistConfig),
    authenticatedBrowserSessionExists:
      await hasNewApiAuthenticatedBrowserSession({
        baseUrl: params.managedConfig.baseUrl,
        userId: params.managedConfig.userId,
      }),
    automaticCodeConfigured: hasNewApiTotpSecret(loginAssistConfig?.totpSecret),
  }
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

  let resolvedToken = token
  let secretsToRedact = collectSecrets(token, managedConfig)

  // This feature is not supported on managed-site backends whose channel
  // search cannot provide a trustworthy base-URL lookup result.
  if (!supportsManagedSiteBaseUrlChannelLookup(service.siteType)) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BASE_URL_SEARCH_UNSUPPORTED,
    }
  }

  try {
    resolvedToken = await resolveDisplayAccountTokenForSecret(account, token)
    secretsToRedact = Array.from(
      new Set([
        ...secretsToRedact,
        ...collectSecrets(resolvedToken, managedConfig),
      ]),
    )
  } catch (error) {
    const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)

    logger.warn("Managed-site token secret resolution failed", {
      accountId: account.id,
      tokenId: token.id,
      siteType: service.siteType,
      diagnostic,
    })

    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      diagnostic,
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
      resolvedToken,
      {
        operationContext: params.operationContext,
      },
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
      resolvedChannelKeysById: params.resolvedChannelKeysById,
      resolveHiddenKeys: true,
      requestCache: params.operationContext?.channelMatch,
    })
    const assessment = toManagedSiteVerifiedKeyAssessment(resolution)
    const exactMatch = getManagedSiteChannelExactMatch(resolution)
    const exactVerificationUnavailable =
      isExactVerificationUnavailable(resolution)
    const resolvedChannelKeys =
      resolution.resolvedChannelKeysById &&
      Object.keys(resolution.resolvedChannelKeysById).length > 0
        ? { resolvedChannelKeysById: resolution.resolvedChannelKeysById }
        : {}

    if (exactMatch) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
        matchedChannel: toManagedSiteAssessmentChannel(exactMatch),
        assessment,
        ...resolvedChannelKeys,
      }
    }

    if (!resolution.searchCompleted) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED,
      }
    }

    if (!formData.key.trim() || exactVerificationUnavailable) {
      let recovery: ManagedSiteTokenChannelRecovery | undefined

      if (
        service.siteType === SITE_TYPES.NEW_API &&
        isNewApiConfig(managedConfig) &&
        exactVerificationUnavailable
      ) {
        try {
          recovery = await buildNewApiRecoveryMetadata({
            managedConfig,
            assessment,
          })
        } catch (error) {
          logger.warn("buildNewApiRecoveryMetadata failed", {
            managedConfig: {
              baseUrl: managedConfig.baseUrl,
            },
            assessment: {
              searchBaseUrl: assessment?.searchBaseUrl,
            },
            diagnostic: toSanitizedErrorSummary(error, secretsToRedact),
          })
        }
      }

      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
        assessment,
        ...(recovery ? { recovery } : {}),
        ...resolvedChannelKeys,
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
        ...resolvedChannelKeys,
      }
    }

    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
      assessment,
      ...resolvedChannelKeys,
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
