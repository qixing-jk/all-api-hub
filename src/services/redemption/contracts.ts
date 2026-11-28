import type { ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS } from "~/services/apiAdapters/accountCapabilitySupport"
import type { DisplaySiteData } from "~/types"

export const REDEMPTION_RESULT_CODES = {
  UnsupportedSiteType: "UNSUPPORTED_SITE_TYPE",
  IncompatibleCodeKind: "INCOMPATIBLE_CODE_KIND",
  OutcomeUncertain: "OUTCOME_UNCERTAIN",
} as const

/** Account-routing outcomes sent by the background to the content workflow. */
export const REDEMPTION_ASSIST_RESULT_CODES = {
  ...REDEMPTION_RESULT_CODES,
  InvalidUrl: "INVALID_URL",
  MultipleAccounts: "MULTIPLE_ACCOUNTS",
  NoAccounts: "NO_ACCOUNTS",
  NoCompatibleAccounts: "NO_COMPATIBLE_ACCOUNTS",
  NoAutomaticRedemption: "NO_AUTOMATIC_REDEMPTION",
  SelectAccount: "SELECT_ACCOUNT",
} as const

export const REDEMPTION_ACCOUNT_SUPPORT_STATUSES = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

type RedemptionAccountSupportStatus =
  (typeof REDEMPTION_ACCOUNT_SUPPORT_STATUSES)[keyof typeof REDEMPTION_ACCOUNT_SUPPORT_STATUSES]

/** Serializable account support metadata shared with the content picker. */
export interface RedemptionAccountCandidate extends DisplaySiteData {
  /** Verified registered route or explicit user override; never an inferred homepage. */
  manualRedemptionUrl?: string
  automaticRedemptionSupport: {
    status: RedemptionAccountSupportStatus
    reason?: typeof ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS.CapabilityMissing
  }
}
