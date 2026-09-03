import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  type AccountDialogSitePolicy,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import { resolveNewAccountAutomaticExecutionEnabled } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { mergeUserOwnedCheckInDraft } from "~/services/checkin/autoCheckin/state"
import { AuthTypeEnum, type CheckInConfig } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"

type AutoDetectedAccountData = NonNullable<AccountAutoDetectResponse["data"]>

export interface AutoDetectRecoveryResolution {
  recoveredSiteType?: AccountSiteType
  shouldAdoptSiteType: boolean
  nextSiteType: AccountSiteType
  retainedRecoveryData: AccountAutoDetectRecoveryData | null
}

const isKnownAccountSiteType = (value: unknown): value is AccountSiteType =>
  isAccountSiteType(value) && value !== SITE_TYPES.UNKNOWN

/** Resolves recovery ownership once before React state is updated. */
export function resolveAutoDetectRecovery(params: {
  recoveryData?: AccountAutoDetectRecoveryData
  contextSiteType?: AccountSiteType
  currentSiteType: AccountSiteType
  canAdoptSiteType: boolean
}): AutoDetectRecoveryResolution {
  const { recoveryData, contextSiteType, currentSiteType, canAdoptSiteType } =
    params
  const recoveredSiteType = isKnownAccountSiteType(recoveryData?.siteType)
    ? recoveryData.siteType
    : isKnownAccountSiteType(contextSiteType)
      ? contextSiteType
      : undefined
  const shouldAdoptSiteType =
    canAdoptSiteType &&
    currentSiteType === SITE_TYPES.UNKNOWN &&
    recoveredSiteType !== undefined
  const nextSiteType = shouldAdoptSiteType ? recoveredSiteType : currentSiteType
  const retainedRecoveryData = recoveryData
    ? {
        ...recoveryData,
        ...(recoveredSiteType ? { siteType: recoveredSiteType } : {}),
      }
    : recoveredSiteType
      ? { siteType: recoveredSiteType }
      : null

  return {
    recoveredSiteType,
    shouldAdoptSiteType,
    nextSiteType,
    retainedRecoveryData,
  }
}

/** Normalizes detected check-in data for both live and recovered results. */
export function normalizeDetectedCheckIn(
  checkIn: CheckInConfig,
): CheckInConfig {
  return {
    ...checkIn,
    customCheckIn: {
      ...checkIn.customCheckIn,
      url: checkIn.customCheckIn?.url ?? "",
      redeemUrl: checkIn.customCheckIn?.redeemUrl ?? "",
      openRedeemWithCheckIn:
        checkIn.customCheckIn?.openRedeemWithCheckIn ?? true,
      isCheckedInToday: checkIn.customCheckIn?.isCheckedInToday ?? false,
    },
  }
}

/** Fills recoverable gaps while preserving values already owned by the user. */
export function mergeAutoDetectRecoveryIntoDraft(params: {
  draft: AccountDialogDraft
  recoveryData: AccountAutoDetectRecoveryData
  nextSiteType: AccountSiteType
  hasExplicitAuthType: boolean
}): AccountDialogDraft {
  const { draft, recoveryData, nextSiteType, hasExplicitAuthType } = params
  const policy = getAccountDialogSitePolicy(nextSiteType)
  const recoverString = (
    current: string,
    recovered: string | undefined,
    replaceDefault = false,
  ) => {
    const normalizedCurrent = current.trim()
    const normalizedRecovered = recovered?.trim() ?? ""
    if (!normalizedRecovered) return current
    if (
      normalizedCurrent &&
      (!replaceDefault || normalizedCurrent !== policy.defaultSiteName)
    ) {
      return current
    }
    return normalizedRecovered
  }
  const recoveredCheckIn = recoveryData.checkIn
    ? normalizeDetectedCheckIn(recoveryData.checkIn)
    : undefined
  const nextDraft: AccountDialogDraft = {
    ...draft,
    siteType: nextSiteType,
    siteName: recoverString(draft.siteName, recoveryData.siteName, true),
    username: recoverString(draft.username, recoveryData.username),
    userId: recoverString(draft.userId, recoveryData.userId),
    accessToken: recoverString(draft.accessToken, recoveryData.accessToken),
    exchangeRate: recoverString(
      draft.exchangeRate,
      recoveryData.exchangeRate?.toString(),
    ),
    authType:
      !hasExplicitAuthType && recoveryData.authType
        ? recoveryData.authType
        : draft.authType,
    cookieAuthSessionCookie: policy.allowCookieAuthSession
      ? recoverString(
          draft.cookieAuthSessionCookie,
          recoveryData.cookieAuthSessionCookie,
        )
      : "",
    checkIn: recoveredCheckIn
      ? mergeUserOwnedCheckInDraft({
          latest: recoveredCheckIn,
          draft: draft.checkIn,
          selectionChanged:
            draft.checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual,
        })
      : draft.checkIn,
    sub2apiUseRefreshToken:
      policy.allowSub2ApiRefreshTokenState &&
      Boolean(recoveryData.sub2apiAuth?.refreshToken.trim())
        ? true
        : draft.sub2apiUseRefreshToken,
    sub2apiRefreshToken: policy.allowSub2ApiRefreshTokenState
      ? recoverString(
          draft.sub2apiRefreshToken,
          recoveryData.sub2apiAuth?.refreshToken,
        )
      : "",
    sub2apiTokenExpiresAt:
      policy.allowSub2ApiRefreshTokenState &&
      draft.sub2apiTokenExpiresAt === null
        ? recoveryData.sub2apiAuth?.tokenExpiresAt ?? null
        : draft.sub2apiTokenExpiresAt,
  }

  return normalizeAccountDialogDraftForSitePolicy({
    draft: nextDraft,
    policy,
  })
}

/** Maps a complete auto-detect result into the dialog draft. */
export function buildDraftFromAutoDetectResult(params: {
  draft: AccountDialogDraft
  resultData: AutoDetectedAccountData
  nextSiteType: AccountSiteType
  nextCheckIn: CheckInConfig
  preserveExistingCheckIn: boolean
  automaticExecutionPreferenceChanged: boolean
  mode: DialogMode
  policy: AccountDialogSitePolicy
}): AccountDialogDraft {
  const {
    draft,
    resultData,
    nextSiteType,
    nextCheckIn,
    preserveExistingCheckIn,
    automaticExecutionPreferenceChanged,
    mode,
    policy,
  } = params

  const mergedCheckIn = preserveExistingCheckIn
    ? mergeUserOwnedCheckInDraft({
        latest: nextCheckIn,
        draft: draft.checkIn,
        selectionChanged:
          draft.checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual,
      })
    : nextCheckIn
  const checkIn = preserveExistingCheckIn
    ? mergedCheckIn
    : {
        ...mergedCheckIn,
        automaticExecutionEnabled: resolveNewAccountAutomaticExecutionEnabled({
          siteType: nextSiteType,
          currentAutomaticExecutionEnabled:
            mergedCheckIn.automaticExecutionEnabled,
          userPreferenceChanged: automaticExecutionPreferenceChanged,
        }),
      }
  const nextDraft: AccountDialogDraft = {
    ...draft,
    username: resultData.username,
    accessToken: resultData.accessToken,
    userId: resultData.userId,
    siteName: resultData.siteName,
    exchangeRate: resultData.exchangeRate
      ? resultData.exchangeRate.toString()
      : mode === DIALOG_MODES.ADD
        ? ""
        : draft.exchangeRate,
    siteType: nextSiteType,
    authType:
      resultData.authType ??
      (policy.forceAccessTokenAuth ? AuthTypeEnum.AccessToken : draft.authType),
    cookieAuthSessionCookie: policy.allowCookieAuthSession
      ? draft.cookieAuthSessionCookie
      : "",
    checkIn,
    sub2apiRefreshToken:
      policy.allowSub2ApiRefreshTokenState && resultData.sub2apiAuth
        ? resultData.sub2apiAuth.refreshToken
        : draft.sub2apiRefreshToken,
    sub2apiTokenExpiresAt:
      policy.allowSub2ApiRefreshTokenState && resultData.sub2apiAuth
        ? resultData.sub2apiAuth.tokenExpiresAt ?? null
        : draft.sub2apiTokenExpiresAt,
  }

  return normalizeAccountDialogDraftForSitePolicy({
    draft: nextDraft,
    policy,
  })
}
