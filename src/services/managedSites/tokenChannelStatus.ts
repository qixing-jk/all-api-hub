import {
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import type { ManagedResourceSecretVerificationRecovery } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import type { ScheduledReadOptions } from "~/services/apiTransport/requestScheduling"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/channelDraftSource"
import {
  getManagedSiteChannelExactMatch,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  areManagedResourceRefsEqual,
  getManagedResourceRefKey,
} from "~/services/managedSites/managedResourceIdentity"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import { getCurrentManagedSiteType } from "~/services/managedSites/runtimeConfig"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  applyVerifiedManagedSiteChannelKey,
  toManagedSiteAssessmentChannel,
  toManagedSiteVerifiedKeyAssessment,
  type ManagedSiteAssessmentChannel,
  type ManagedSiteVerifiedKeyAssessment,
} from "~/services/managedSites/verifiedChannelKeyAssessment"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
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

interface ManagedSiteTokenChannelResolvedKeys {
  resolvedChannelKeysByResourceKey?: Record<string, string>
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
          recovery?: ManagedResourceSecretVerificationRecovery
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

interface GetManagedSiteTokenChannelStatusParams extends ScheduledReadOptions {
  runtimeKey: AccountRuntimeKey
  managedSite?: ManagedSiteCapabilities
  managedConfig?: ManagedSiteRuntimeConfigValue | null
  resolvedChannelKeysByResourceKey?: Record<string, string>
  operationContext?: ManagedSiteOperationContext
  protectionBypassExecution?: ProtectionBypassExecution
}

interface ResolveManagedSiteTokenChannelStatusWithVerifiedKeyParams {
  status: ManagedSiteTokenChannelStatus
  tokenKey: string
  resourceRef: ManagedResourceRef
  channelKey: string
  siteType?: ManagedSiteCapabilities["siteType"] | string
}

const findAssessmentChannelSummary = (
  assessment: ManagedSiteTokenChannelAssessment,
  resourceRef: ManagedResourceRef,
) => {
  return [
    assessment.key.channel,
    assessment.models.channel,
    assessment.url.channel,
  ].find((channel) => areManagedResourceRefsEqual(channel?.ref, resourceRef))
}

const collectSecrets = (
  runtimeKey: AccountRuntimeKey,
  managedConfig: ManagedSiteRuntimeConfigValue | null,
) => {
  return [
    ...collectAccountRuntimeKeySecrets([runtimeKey]),
    ...(managedConfig ? collectManagedConfigSecrets(managedConfig) : []),
  ].filter(Boolean) as string[]
}

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
    params.resourceRef,
  )
  if (!channelSummary) return params.status

  const resolvedChannelKeysByResourceKey = {
    ...(params.status.resolvedChannelKeysByResourceKey ?? {}),
    [getManagedResourceRefKey(params.resourceRef)]: params.channelKey,
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
      resolvedChannelKeysByResourceKey,
    }
  }

  if (applied.hasAnyMatch) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION,
      assessment: applied.assessment,
      resolvedChannelKeysByResourceKey,
    }
  }

  return {
    status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
    assessment: applied.assessment,
    resolvedChannelKeysByResourceKey,
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
  params.signal?.throwIfAborted()
  const { runtimeKey } = params
  const managedSite =
    params.managedSite ??
    getManagedSiteCapabilities(await getCurrentManagedSiteType())
  const managedConfig = params.managedConfig ?? (await managedSite.config.get())

  if (!managedConfig) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason: MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING,
    }
  }

  params.signal?.throwIfAborted()
  let resolvedRuntimeKey = runtimeKey
  let secretsToRedact = collectSecrets(runtimeKey, managedConfig)

  // This feature is not supported on managed-site backends whose channel
  // search cannot provide a trustworthy base-URL lookup result.
  if (!supportsManagedSiteBaseUrlChannelLookup(managedSite.siteType)) {
    return {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BASE_URL_SEARCH_UNSUPPORTED,
    }
  }

  try {
    if (isAccountTokenRuntimeKey(runtimeKey)) {
      resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
        runtimeKey.account,
        runtimeKey,
        {
          protectionBypassExecution: params.protectionBypassExecution,
          abortSignal: params.signal,
          requestScheduling: params.requestScheduling,
        },
      )
    }
    secretsToRedact = Array.from(
      new Set([
        ...secretsToRedact,
        ...collectSecrets(resolvedRuntimeKey, managedConfig),
      ]),
    )
  } catch (error) {
    params.signal?.throwIfAborted()
    const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)

    logger.warn("Managed-site token secret resolution failed", {
      accountId: runtimeKey.accountId,
      runtimeKeyId: runtimeKey.id,
      siteType: managedSite.siteType,
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
    params.signal?.throwIfAborted()
    const source = buildManagedSiteChannelDraftSource({
      ...resolvedRuntimeKey,
      baseUrl: isAccountTokenRuntimeKey(resolvedRuntimeKey)
        ? normalizeManagedSiteChannelBaseUrl(resolvedRuntimeKey.baseUrl)
        : resolvedRuntimeKey.baseUrl,
    })
    const formData = await managedSite.channelDrafts.prepareFormData(source, {
      operationContext: params.operationContext,
      purpose: "matching",
      signal: params.signal,
      requestScheduling: params.requestScheduling,
    })
    params.signal?.throwIfAborted()
    const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(formData.base_url)

    if (!searchBaseUrl) {
      return {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED,
        diagnostic: "missing-comparable-inputs",
      }
    }

    // The match module owns which evidence is required for an exact match.
    // Empty optional dimensions must reach it instead of being rejected here.
    const resolution = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: searchBaseUrl,
      models: formData.models,
      key: formData.key,
      resolvedChannelKeysByResourceKey: params.resolvedChannelKeysByResourceKey,
      resolveHiddenKeys: true,
      requestCache: params.operationContext?.channelMatch,
      signal: params.signal,
      requestScheduling: params.requestScheduling,
      protectionBypassExecution: params.protectionBypassExecution,
    })
    params.signal?.throwIfAborted()
    const assessment = toManagedSiteVerifiedKeyAssessment(resolution)
    const exactMatch = getManagedSiteChannelExactMatch(
      resolution,
      managedSite.matching,
    )
    const exactVerificationUnavailable =
      isExactVerificationUnavailable(resolution)
    const resolvedChannelKeys =
      resolution.resolvedChannelKeysByResourceKey &&
      Object.keys(resolution.resolvedChannelKeysByResourceKey).length > 0
        ? {
            resolvedChannelKeysByResourceKey:
              resolution.resolvedChannelKeysByResourceKey,
          }
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
      let recovery: ManagedResourceSecretVerificationRecovery | undefined

      if (
        managedSite.matching.secretVerification &&
        exactVerificationUnavailable
      ) {
        try {
          recovery = await managedSite.matching.secretVerification.getRecovery(
            managedConfig,
            assessment.searchBaseUrl,
          )
        } catch (error) {
          logger.warn("Secret verification recovery lookup failed", {
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
    params.signal?.throwIfAborted()
    const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)

    logger.warn("Managed-site token status check failed", {
      accountId: runtimeKey.accountId,
      runtimeKeyId: runtimeKey.id,
      siteType: managedSite.siteType,
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
