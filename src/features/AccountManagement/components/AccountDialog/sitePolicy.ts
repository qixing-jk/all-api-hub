import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import {
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  getAccountSiteProductProfile,
} from "~/services/accounts/accountSiteProfile"
import { AuthTypeEnum, type Sub2ApiAuthConfig } from "~/types"

/**
 * Describes site-specific account-dialog behavior that must stay pure and UI-free.
 */
export interface AccountDialogSitePolicy {
  forceAccessTokenAuth: boolean
  allowCookieAuthSession: boolean
  allowCookieAutoImport: boolean
  allowBuiltInCheckInDetection: boolean
  allowSub2ApiRefreshTokenState: boolean
  openSub2ApiTokenDialogPostSave: boolean
  deferSuccessForOneTimeKeyPostSaveFlow: boolean
}

type AccountDialogWorkflowPolicy = Pick<
  AccountDialogSitePolicy,
  | "forceAccessTokenAuth"
  | "openSub2ApiTokenDialogPostSave"
  | "deferSuccessForOneTimeKeyPostSaveFlow"
>

const DEFAULT_ACCOUNT_DIALOG_WORKFLOW_POLICY: AccountDialogWorkflowPolicy = {
  forceAccessTokenAuth: false,
  openSub2ApiTokenDialogPostSave: false,
  deferSuccessForOneTimeKeyPostSaveFlow: false,
}

const ACCOUNT_DIALOG_SITE_POLICIES: Partial<
  Record<AccountSiteType, AccountDialogWorkflowPolicy>
> = {
  [SITE_TYPES.SUB2API]: {
    forceAccessTokenAuth: true,
    openSub2ApiTokenDialogPostSave: true,
    deferSuccessForOneTimeKeyPostSaveFlow: false,
  },
  [SITE_TYPES.AIHUBMIX]: {
    forceAccessTokenAuth: true,
    openSub2ApiTokenDialogPostSave: false,
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
  const workflowPolicy =
    ACCOUNT_DIALOG_SITE_POLICIES[siteType] ??
    DEFAULT_ACCOUNT_DIALOG_WORKFLOW_POLICY

  return {
    ...workflowPolicy,
    allowCookieAuthSession: productProfile.auth.supportsCookieAuth,
    allowCookieAutoImport: productProfile.auth.supportsCookieAuth,
    allowBuiltInCheckInDetection:
      productProfile.auth.supportsBuiltInCheckInDetection,
    allowSub2ApiRefreshTokenState:
      productProfile.supplementalAuth.kind ===
      ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
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
      enableDetection: policy.allowBuiltInCheckInDetection
        ? draft.checkIn.enableDetection
        : false,
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
