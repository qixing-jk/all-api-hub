import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE,
  type AddAccountPrefill,
} from "~/features/AccountManagement/sponsors/types"
import {
  createCompatibilityCheckInConfig,
  getNewAccountAutomaticExecutionDefault,
} from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import type { SiteTypeMismatch } from "~/services/siteDetection/siteTypeMismatch"
import {
  AuthTypeEnum,
  type CheckInConfig,
  type KimiOpenPlatformAuthConfig,
} from "~/types"
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
  kimiOpenPlatformAuth: KimiOpenPlatformAuthConfig | null
}

/** Form state carried from a popup into manual New API token recovery. */
export interface AccountDialogRecoveryState {
  url: string
  draft: AccountDialogDraft
  accountId?: string
  checkInSelectionChanged: boolean
  checkInDiscoveryBaseSelection: CheckInConfig["selection"] | null
}

export type AccountCheckInRedetectionFeedback =
  | {
      kind: "completed"
      decisionOutcome: CheckInDiscoveryDecision["outcome"]
      selectedMethodDisabled: boolean
      saveRequired: boolean
      unknownReasons: CheckInMethodUnknownReason[]
      /** Present when the site itself resolves to a type other than the stored one. */
      siteTypeSuggestion?: SiteTypeMismatch
    }
  | {
      kind: "failed"
      reason: "url-required"
    }
  | {
      kind: "failed"
      reason: "operation"
      diagnostic: string
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
      supported: false,
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
    kimiOpenPlatformAuth: null,
  }
}

export type { AddAccountPrefill }

/**
 * Determines the initial phase and provenance for add and edit dialogs.
 */
export function getInitialFlowState(mode: DialogMode): {
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
} {
  return mode === DIALOG_MODES.EDIT
    ? {
        phase: ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM,
        formSource: ACCOUNT_DIALOG_FORM_SOURCES.EXISTING_ACCOUNT,
      }
    : {
        phase: ACCOUNT_DIALOG_PHASES.SITE_INPUT,
        formSource: ACCOUNT_DIALOG_FORM_SOURCES.MANUAL,
      }
}
