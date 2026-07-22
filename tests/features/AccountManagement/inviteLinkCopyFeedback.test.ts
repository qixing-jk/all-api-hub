import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  getInviteLinkFailureAnalyticsCategory,
  getInviteLinkFailureMessage,
  getInviteLinkFailureSummary,
  getPrimaryInviteLinkFailureReason,
} from "~/features/AccountManagement/inviteLinkCopyFeedback"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"

const t = ((key: string, options?: { count?: number }) => {
  if (key === "account:inviteLinkFailures.summarySeparator") return " | "
  return typeof options?.count === "number" ? `${key}:${options.count}` : key
}) as unknown as TFunction

describe("inviteLinkCopyFeedback", () => {
  it.each([
    [
      INVITE_LINK_FAILURE_REASONS.FeatureDisabled,
      "account:inviteLinkFailures.featureDisabled",
    ],
    [
      INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
      "account:inviteLinkFailures.authenticationRequired",
    ],
    [
      INVITE_LINK_FAILURE_REASONS.ProviderRejected,
      "account:inviteLinkFailures.providerRejected",
    ],
    [
      INVITE_LINK_FAILURE_REASONS.Unavailable,
      "account:inviteLinkFailures.unavailable",
    ],
    [
      INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      "account:inviteLinkFailures.inviteDataMissing",
    ],
    [
      INVITE_LINK_FAILURE_REASONS.InvalidResponse,
      "account:inviteLinkFailures.invalidResponse",
    ],
    [INVITE_LINK_FAILURE_REASONS.Network, "account:inviteLinkFailures.network"],
    [INVITE_LINK_FAILURE_REASONS.Timeout, "account:inviteLinkFailures.timeout"],
    [
      INVITE_LINK_FAILURE_REASONS.RateLimited,
      "account:inviteLinkFailures.rateLimited",
    ],
    [INVITE_LINK_FAILURE_REASONS.Unknown, "account:inviteLinkFailures.unknown"],
  ])("returns actionable copy for %s", (reason, expectedKey) => {
    expect(getInviteLinkFailureMessage(t, reason)).toBe(expectedKey)
  })

  it("summarizes mixed failures in a stable, user-oriented order", () => {
    expect(
      getInviteLinkFailureSummary(t, {
        failureReasonCounts: {
          [INVITE_LINK_FAILURE_REASONS.Network]: 3,
          [INVITE_LINK_FAILURE_REASONS.AuthenticationRequired]: 2,
          [INVITE_LINK_FAILURE_REASONS.FeatureDisabled]: 1,
        },
        unsupportedCount: 4,
        skippedCount: 5,
      }),
    ).toBe(
      [
        "account:inviteLinkFailures.summary.featureDisabled:1",
        "account:inviteLinkFailures.summary.authenticationRequired:2",
        "account:inviteLinkFailures.summary.network:3",
        "account:inviteLinkFailures.summary.unsupported:4",
        "account:inviteLinkFailures.summary.disabled:5",
      ].join(" | "),
    )
  })

  it("chooses the most actionable failure reason before raw frequency", () => {
    expect(
      getPrimaryInviteLinkFailureReason({
        [INVITE_LINK_FAILURE_REASONS.Unknown]: 9,
        [INVITE_LINK_FAILURE_REASONS.AuthenticationRequired]: 1,
      }),
    ).toBe(INVITE_LINK_FAILURE_REASONS.AuthenticationRequired)
  })

  it.each([
    [
      INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    ],
    [
      INVITE_LINK_FAILURE_REASONS.Network,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
    ],
    [
      INVITE_LINK_FAILURE_REASONS.RateLimited,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit,
    ],
    [
      INVITE_LINK_FAILURE_REASONS.FeatureDisabled,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
    ],
    [
      INVITE_LINK_FAILURE_REASONS.InvalidResponse,
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    ],
  ])("maps %s to analytics category %s", (reason, expectedCategory) => {
    expect(getInviteLinkFailureAnalyticsCategory(reason)).toBe(expectedCategory)
  })
})
