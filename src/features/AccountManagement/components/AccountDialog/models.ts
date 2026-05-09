import { SITE_TYPES, type SiteType } from "~/constants/siteType"
import { AuthTypeEnum, type CheckInConfig } from "~/types"

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
  checkIn: CheckInConfig
  siteType: SiteType
  authType: AuthTypeEnum
  cookieAuthSessionCookie: string
  sub2apiUseRefreshToken: boolean
  sub2apiRefreshToken: string
  sub2apiTokenExpiresAt: number | null
}

/**
 * Creates the default empty draft used before loading or detecting account data.
 */
export function createEmptyAccountDialogDraft(): AccountDialogDraft {
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
    checkIn: {
      enableDetection: false,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
      },
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
        isCheckedInToday: false,
      },
    },
    siteType: SITE_TYPES.UNKNOWN,
    authType: AuthTypeEnum.AccessToken,
    cookieAuthSessionCookie: "",
    sub2apiUseRefreshToken: false,
    sub2apiRefreshToken: "",
    sub2apiTokenExpiresAt: null,
  }
}
