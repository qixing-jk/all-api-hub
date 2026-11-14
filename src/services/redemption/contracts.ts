import type { ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS } from "~/services/apiAdapters/accountCapabilitySupport"
import type { DisplaySiteData } from "~/types"

export const REDEMPTION_ACCOUNT_SUPPORT_STATUSES = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

type RedemptionAccountSupportStatus =
  (typeof REDEMPTION_ACCOUNT_SUPPORT_STATUSES)[keyof typeof REDEMPTION_ACCOUNT_SUPPORT_STATUSES]

/** Serializable account support metadata shared with the content picker. */
export interface RedemptionAccountCandidate extends DisplaySiteData {
  automaticRedemptionSupport: {
    status: RedemptionAccountSupportStatus
    reason?: typeof ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS.CapabilityMissing
  }
}
