import type { TFunction } from "i18next"

import {
  INVITE_LINK_FAILURE_REASONS,
  type InviteLinkFailureReason,
  type InviteLinkFailureReasonCounts,
} from "~/services/inviteLinks/errors"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"

const INVITE_LINK_FAILURE_PRIORITY: InviteLinkFailureReason[] = [
  INVITE_LINK_FAILURE_REASONS.FeatureDisabled,
  INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
  INVITE_LINK_FAILURE_REASONS.ProviderRejected,
  INVITE_LINK_FAILURE_REASONS.Unavailable,
  INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
  INVITE_LINK_FAILURE_REASONS.InvalidResponse,
  INVITE_LINK_FAILURE_REASONS.RateLimited,
  INVITE_LINK_FAILURE_REASONS.Timeout,
  INVITE_LINK_FAILURE_REASONS.Network,
  INVITE_LINK_FAILURE_REASONS.Unknown,
]

/** Chooses the first actionable reason for single-category analytics and copy. */
export function getPrimaryInviteLinkFailureReason(
  counts: InviteLinkFailureReasonCounts | undefined,
): InviteLinkFailureReason {
  return (
    INVITE_LINK_FAILURE_PRIORITY.find(
      (reason) => (counts?.[reason] ?? 0) > 0,
    ) ?? INVITE_LINK_FAILURE_REASONS.Unknown
  )
}

/** Returns actionable single-account feedback for a controlled failure reason. */
export function getInviteLinkFailureMessage(
  t: TFunction,
  reason: InviteLinkFailureReason,
): string {
  switch (reason) {
    case INVITE_LINK_FAILURE_REASONS.FeatureDisabled:
      return t("account:inviteLinkFailures.featureDisabled")
    case INVITE_LINK_FAILURE_REASONS.AuthenticationRequired:
      return t("account:inviteLinkFailures.authenticationRequired")
    case INVITE_LINK_FAILURE_REASONS.ProviderRejected:
      return t("account:inviteLinkFailures.providerRejected")
    case INVITE_LINK_FAILURE_REASONS.Unavailable:
      return t("account:inviteLinkFailures.unavailable")
    case INVITE_LINK_FAILURE_REASONS.InviteDataMissing:
      return t("account:inviteLinkFailures.inviteDataMissing")
    case INVITE_LINK_FAILURE_REASONS.InvalidResponse:
      return t("account:inviteLinkFailures.invalidResponse")
    case INVITE_LINK_FAILURE_REASONS.Network:
      return t("account:inviteLinkFailures.network")
    case INVITE_LINK_FAILURE_REASONS.Timeout:
      return t("account:inviteLinkFailures.timeout")
    case INVITE_LINK_FAILURE_REASONS.RateLimited:
      return t("account:inviteLinkFailures.rateLimited")
    default:
      return t("account:inviteLinkFailures.unknown")
  }
}

const getInviteLinkFailureSummaryItem = (
  t: TFunction,
  reason: InviteLinkFailureReason,
  count: number,
): string => {
  switch (reason) {
    case INVITE_LINK_FAILURE_REASONS.FeatureDisabled:
      return t("account:inviteLinkFailures.summary.featureDisabled", { count })
    case INVITE_LINK_FAILURE_REASONS.AuthenticationRequired:
      return t("account:inviteLinkFailures.summary.authenticationRequired", {
        count,
      })
    case INVITE_LINK_FAILURE_REASONS.ProviderRejected:
      return t("account:inviteLinkFailures.summary.providerRejected", { count })
    case INVITE_LINK_FAILURE_REASONS.Unavailable:
      return t("account:inviteLinkFailures.summary.unavailable", { count })
    case INVITE_LINK_FAILURE_REASONS.InviteDataMissing:
      return t("account:inviteLinkFailures.summary.inviteDataMissing", {
        count,
      })
    case INVITE_LINK_FAILURE_REASONS.InvalidResponse:
      return t("account:inviteLinkFailures.summary.invalidResponse", { count })
    case INVITE_LINK_FAILURE_REASONS.Network:
      return t("account:inviteLinkFailures.summary.network", { count })
    case INVITE_LINK_FAILURE_REASONS.Timeout:
      return t("account:inviteLinkFailures.summary.timeout", { count })
    case INVITE_LINK_FAILURE_REASONS.RateLimited:
      return t("account:inviteLinkFailures.summary.rateLimited", { count })
    default:
      return t("account:inviteLinkFailures.summary.unknown", { count })
  }
}

/** Builds a localized, count-based summary for mixed bulk outcomes. */
export function getInviteLinkFailureSummary(
  t: TFunction,
  {
    failureReasonCounts,
    unsupportedCount,
    skippedCount,
  }: {
    failureReasonCounts?: InviteLinkFailureReasonCounts
    unsupportedCount: number
    skippedCount: number
  },
): string {
  const items = INVITE_LINK_FAILURE_PRIORITY.flatMap((reason) => {
    const count = failureReasonCounts?.[reason] ?? 0
    return count > 0 ? [getInviteLinkFailureSummaryItem(t, reason, count)] : []
  })

  if (unsupportedCount > 0) {
    items.push(
      t("account:inviteLinkFailures.summary.unsupported", {
        count: unsupportedCount,
      }),
    )
  }
  if (skippedCount > 0) {
    items.push(
      t("account:inviteLinkFailures.summary.disabled", {
        count: skippedCount,
      }),
    )
  }

  return items.join(t("account:inviteLinkFailures.summarySeparator"))
}

/** Maps invite-link failure reasons onto the existing privacy-safe taxonomy. */
export function getInviteLinkFailureAnalyticsCategory(
  reason: InviteLinkFailureReason,
): ProductAnalyticsErrorCategory {
  switch (reason) {
    case INVITE_LINK_FAILURE_REASONS.AuthenticationRequired:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case INVITE_LINK_FAILURE_REASONS.Network:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case INVITE_LINK_FAILURE_REASONS.Timeout:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
    case INVITE_LINK_FAILURE_REASONS.RateLimited:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit
    case INVITE_LINK_FAILURE_REASONS.FeatureDisabled:
    case INVITE_LINK_FAILURE_REASONS.Unavailable:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    case INVITE_LINK_FAILURE_REASONS.ProviderRejected:
    case INVITE_LINK_FAILURE_REASONS.InviteDataMissing:
    case INVITE_LINK_FAILURE_REASONS.InvalidResponse:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    default:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }
}
