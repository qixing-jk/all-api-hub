import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  getAccountSiteProductProfile,
} from "~/services/accounts/accountSiteProfile"
import {
  OPENROUTER_DISPLAY_NAME,
  ORCAROUTER_DISPLAY_NAME,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  OPENROUTER_WEB_ORIGIN,
  ORCAROUTER_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/siteTypes"
import { AuthTypeEnum, type Sub2ApiAuthConfig } from "~/types"

/**
 * Describes site-specific account-dialog behavior that must stay pure and UI-free.
 */
export interface AccountDialogSitePolicy {
  siteTypeLabel: string
  canonicalSiteUrl?: string
  defaultSiteName?: string
  lockSiteUrl: boolean
  forceAccessTokenAuth: boolean
  allowCookieAuthSession: boolean
  allowCookieAutoImport: boolean
  allowBuiltInCheckInDetection: boolean
  allowSub2ApiRefreshTokenState: boolean
  openSub2ApiTokenDialogPostSave: boolean
  deferSuccessForOneTimeKeyPostSaveFlow: boolean
  requireUsername: boolean
  requireUserId: boolean
}

type AccountDialogSiteOverrideKey =
  | "siteTypeLabel"
  | "canonicalSiteUrl"
  | "defaultSiteName"
  | "lockSiteUrl"
  | "forceAccessTokenAuth"
  | "openSub2ApiTokenDialogPostSave"
  | "deferSuccessForOneTimeKeyPostSaveFlow"
  | "requireUsername"
  | "requireUserId"

type AccountDialogSiteOverride = Partial<
  Pick<AccountDialogSitePolicy, AccountDialogSiteOverrideKey>
>

const DEFAULT_ACCOUNT_DIALOG_SITE_OVERRIDE_VALUES = {
  canonicalSiteUrl: undefined,
  defaultSiteName: undefined,
  lockSiteUrl: false,
  forceAccessTokenAuth: false,
  openSub2ApiTokenDialogPostSave: false,
  deferSuccessForOneTimeKeyPostSaveFlow: false,
  requireUsername: true,
  requireUserId: true,
} satisfies Omit<
  Pick<AccountDialogSitePolicy, AccountDialogSiteOverrideKey>,
  "siteTypeLabel"
>

const ACCOUNT_DIALOG_SITE_OVERRIDES: Partial<
  Record<AccountSiteType, AccountDialogSiteOverride>
> = {
  [SITE_TYPES.OPENROUTER]: {
    siteTypeLabel: OPENROUTER_DISPLAY_NAME,
    canonicalSiteUrl: OPENROUTER_WEB_ORIGIN,
    defaultSiteName: OPENROUTER_DISPLAY_NAME,
    lockSiteUrl: true,
    forceAccessTokenAuth: true,
    requireUserId: false,
  },
  [SITE_TYPES.ORCAROUTER]: {
    siteTypeLabel: ORCAROUTER_DISPLAY_NAME,
    canonicalSiteUrl: ORCAROUTER_WEB_ORIGIN,
    defaultSiteName: ORCAROUTER_DISPLAY_NAME,
    lockSiteUrl: true,
    forceAccessTokenAuth: true,
    requireUserId: false,
  },
  [SITE_TYPES.SUB2API]: {
    siteTypeLabel: "Sub2API",
    forceAccessTokenAuth: true,
    openSub2ApiTokenDialogPostSave: true,
  },
  [SITE_TYPES.AIHUBMIX]: {
    siteTypeLabel: "AIHubMix",
    forceAccessTokenAuth: true,
    deferSuccessForOneTimeKeyPostSaveFlow: true,
  },
}

/**
 * Resolves account-dialog behavior rules for the selected account site type.
 */
export function getAccountDialogSitePolicy(
  siteType: AccountSiteType,
): AccountDialogSitePolicy {
  const productProfile = getAccountSiteProductProfile(siteType)
  const siteOverride = ACCOUNT_DIALOG_SITE_OVERRIDES[siteType]

  return {
    siteTypeLabel: siteType,
    ...DEFAULT_ACCOUNT_DIALOG_SITE_OVERRIDE_VALUES,
    requireUsername: productProfile.identity.usernameRequired,
    allowCookieAuthSession: productProfile.auth.supportsCookieAuth,
    allowCookieAutoImport: productProfile.auth.supportsCookieAuth,
    allowBuiltInCheckInDetection:
      productProfile.auth.supportsBuiltInCheckInDetection,
    allowSub2ApiRefreshTokenState:
      productProfile.supplementalAuth.kind ===
      ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
    ...siteOverride,
  }
}

/**
 * Applies pure site policy constraints to a draft while preserving identity for no-op updates.
 */
export function normalizeAccountDialogDraftForSitePolicy(params: {
  draft: AccountDialogDraft
  policy: AccountDialogSitePolicy
}): AccountDialogDraft {
  const { draft, policy } = params
  const nextDraft: AccountDialogDraft = {
    ...draft,
    authType: policy.forceAccessTokenAuth
      ? AuthTypeEnum.AccessToken
      : draft.authType,
    cookieAuthSessionCookie: policy.allowCookieAuthSession
      ? draft.cookieAuthSessionCookie
      : "",
    checkIn: {
      ...draft.checkIn,
      enableDetection: policy.allowBuiltInCheckInDetection,
      autoCheckInEnabled: policy.allowBuiltInCheckInDetection
        ? draft.checkIn.autoCheckInEnabled
        : false,
    },
    sub2apiUseRefreshToken: policy.allowSub2ApiRefreshTokenState
      ? draft.sub2apiUseRefreshToken
      : false,
    sub2apiRefreshToken: policy.allowSub2ApiRefreshTokenState
      ? draft.sub2apiRefreshToken
      : "",
    sub2apiTokenExpiresAt: policy.allowSub2ApiRefreshTokenState
      ? draft.sub2apiTokenExpiresAt
      : null,
  }

  return arePolicyDraftFieldsEquivalent(draft, nextDraft) ? draft : nextDraft
}

/**
 * Determines whether the dialog should auto-import a browser cookie session.
 */
export function shouldAutoImportCookieAuthForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  authType: AuthTypeEnum
  cookieAuthSessionCookie: string
  url: string
}): boolean {
  const { policy, authType, cookieAuthSessionCookie, url } = params

  return (
    policy.allowCookieAutoImport &&
    authType === AuthTypeEnum.Cookie &&
    cookieAuthSessionCookie.trim().length === 0 &&
    url.trim().length > 0
  )
}

/**
 * Builds Sub2API refresh-token auth payloads when the site policy allows them.
 */
export function buildSub2ApiAuthFromAccountDialogDraft(params: {
  draft: AccountDialogDraft
  policy: AccountDialogSitePolicy
}): Sub2ApiAuthConfig | undefined {
  const { draft, policy } = params
  const refreshToken = draft.sub2apiRefreshToken.trim()

  if (
    !policy.allowSub2ApiRefreshTokenState ||
    !draft.sub2apiUseRefreshToken ||
    !refreshToken
  ) {
    return undefined
  }

  return {
    refreshToken,
    ...(typeof draft.sub2apiTokenExpiresAt === "number"
      ? { tokenExpiresAt: draft.sub2apiTokenExpiresAt }
      : {}),
  }
}

/**
 * Determines whether a saved account should open the Sub2API token creation dialog.
 */
export function shouldOpenSub2ApiTokenDialogForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  skipSub2ApiKeyPrompt: boolean
  hasDisplayData: boolean
}): boolean {
  const { policy, skipSub2ApiKeyPrompt, hasDisplayData } = params

  return (
    policy.openSub2ApiTokenDialogPostSave &&
    !skipSub2ApiKeyPrompt &&
    hasDisplayData
  )
}

/**
 * Determines whether success feedback should wait for the one-time key post-save flow.
 */
export function shouldDeferAccountSaveSuccessForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  isAddMode: boolean
  autoProvisionKeyOnAccountAdd: boolean
  skipAutoProvisionKeyOnAccountAdd: boolean
}): boolean {
  const {
    policy,
    isAddMode,
    autoProvisionKeyOnAccountAdd,
    skipAutoProvisionKeyOnAccountAdd,
  } = params

  return (
    policy.deferSuccessForOneTimeKeyPostSaveFlow &&
    isAddMode &&
    autoProvisionKeyOnAccountAdd &&
    !skipAutoProvisionKeyOnAccountAdd
  )
}

/**
 * Compares only draft fields that this policy module owns.
 */
function arePolicyDraftFieldsEquivalent(
  left: AccountDialogDraft,
  right: AccountDialogDraft,
): boolean {
  return (
    left.authType === right.authType &&
    left.cookieAuthSessionCookie === right.cookieAuthSessionCookie &&
    left.checkIn.enableDetection === right.checkIn.enableDetection &&
    left.checkIn.autoCheckInEnabled === right.checkIn.autoCheckInEnabled &&
    left.sub2apiUseRefreshToken === right.sub2apiUseRefreshToken &&
    left.sub2apiRefreshToken === right.sub2apiRefreshToken &&
    left.sub2apiTokenExpiresAt === right.sub2apiTokenExpiresAt
  )
}
