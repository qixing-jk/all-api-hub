import { AuthTypeEnum, type CheckInConfig } from "~/types"

export type AccountDialogPhase = "site-input" | "account-form"

export type AccountDialogFormSource = "manual" | "detected" | "existing-account"

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
  siteType: string
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
    siteType: "unknown",
    authType: AuthTypeEnum.AccessToken,
    cookieAuthSessionCookie: "",
    sub2apiUseRefreshToken: false,
    sub2apiRefreshToken: "",
    sub2apiTokenExpiresAt: null,
  }
}
