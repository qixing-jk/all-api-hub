import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
  type AddAccountPrefill,
} from "~/features/AccountManagement/sponsors/types"
import {
  createCompatibilityCheckInConfig,
  getNewAccountAutomaticExecutionDefault,
  hasNewAccountCompatibilityRegistration,
} from "~/services/checkin/autoCheckin/compatibilityConfig"
import { AuthTypeEnum, type CheckInConfig } from "~/types"
import type {
  CheckInDiscoveryDecision,
  CheckInMethodUnknownReason,
} from "~/types/checkIn"

export const ACCOUNT_DIALOG_PHASES = {
  SITE_INPUT: "site-input",
  ACCOUNT_FORM: "account-form",
} as const

export type AccountDialogPhase =
  (typeof ACCOUNT_DIALOG_PHASES)[keyof typeof ACCOUNT_DIALOG_PHASES]

export const ACCOUNT_DIALOG_FORM_SOURCES = {
  MANUAL: "manual",
  DETECTED: "detected",
  EXISTING_ACCOUNT: "existing-account",
  SPONSOR: "sponsor",
  BOOKMARK_IMPORT: BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
} as const

export type AccountDialogFormSource =
  (typeof ACCOUNT_DIALOG_FORM_SOURCES)[keyof typeof ACCOUNT_DIALOG_FORM_SOURCES]

export interface AccountDialogDraft {
  siteName: string
  username: string
  accessToken: string
  userId: string
  exchangeRate: string
  manualBalanceUsd: string
  notes: string
  tagIds: string[]
  excludeFromTotalBalance: boolean
  excludeFromTodayIncome: boolean
  checkIn: CheckInConfig
  siteType: AccountSiteType
  authType: AuthTypeEnum
  cookieAuthSessionCookie: string
  sub2apiUseRefreshToken: boolean
  sub2apiRefreshToken: string
  sub2apiTokenExpiresAt: number | null
}

export type AccountCheckInRedetectionFeedback =
  | {
      kind: "completed"
      decisionOutcome: CheckInDiscoveryDecision["outcome"]
      selectedMethodDisabled: boolean
      saveRequired: boolean
      unknownReasons: CheckInMethodUnknownReason[]
    }
  | {
      kind: "failed"
      message: string
    }

/**
 * Creates the default empty draft used before loading or detecting account data.
 */
export function createEmptyAccountDialogDraft(
  siteType: AccountSiteType = SITE_TYPES.UNKNOWN,
): AccountDialogDraft {
  return {
    siteName: "",
    username: "",
    accessToken: "",
    userId: "",
    exchangeRate: "",
    manualBalanceUsd: "",
    notes: "",
    tagIds: [],
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    checkIn: createCompatibilityCheckInConfig({
      siteType,
      supported: hasNewAccountCompatibilityRegistration(siteType),
      automaticExecutionEnabled:
        getNewAccountAutomaticExecutionDefault(siteType),
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
        isCheckedInToday: false,
      },
    }),
    siteType,
    authType: AuthTypeEnum.AccessToken,
    cookieAuthSessionCookie: "",
    sub2apiUseRefreshToken: false,
    sub2apiRefreshToken: "",
    sub2apiTokenExpiresAt: null,
  }
}

export type { AddAccountPrefill }
