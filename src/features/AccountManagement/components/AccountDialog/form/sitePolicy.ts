import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { getAccountSiteProductProfile } from "~/services/accounts/accountSiteProfile"
import {
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
} from "~/services/accounts/accountSiteProfile/contracts"
import type { AccountSiteDefinitionOnboardingMetadata } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum, type Sub2ApiAuthConfig } from "~/types"
import { type AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

/**
 * Describes site-specific account-dialog behavior that must stay pure and UI-free.
 */
export interface AccountDialogSitePolicy {
  siteTypeLabel: string
  accessTokenPresentation: Pick<
    NonNullable<AccountSiteDefinitionOnboardingMetadata["accountForm"]>,
    | "accessTokenLabelKey"
    | "accessTokenGuidanceTitleKey"
    | "accessTokenGuidanceKey"
  >
  canonicalSiteUrl?: string
  defaultSiteName?: string
  lockSiteUrl: boolean
  forceAccessTokenAuth: boolean
  allowCookieAuthSession: boolean
  allowCookieAutoImport: boolean
  allowKimiOpenPlatformAuthState: boolean
  allowSub2ApiRefreshTokenState: boolean
  openSub2ApiTokenDialogPostSave: boolean
  deferSuccessForOneTimeKeyPostSaveFlow: boolean
  supportsKeyProvisioning: boolean
  requireUsername: boolean
  requireUserId: boolean
}

/**
 * Resolves account-dialog behavior rules for the selected account site type.
 */
export function getAccountDialogSitePolicy(
  siteType: AccountSiteType,
): AccountDialogSitePolicy {
  const productProfile = getAccountSiteProductProfile(siteType)
  const onboarding = getAccountSiteDefinition(siteType)?.onboarding
  const allowsCookieAuth = productProfile.auth.allowedAuthTypes.includes(
    AuthTypeEnum.Cookie,
  )
  const usesSub2ApiRefreshSession =
    productProfile.authSession.kind ===
    ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken

  return {
    siteTypeLabel: onboarding?.displayName ?? siteType,
    accessTokenPresentation: {
      accessTokenLabelKey: onboarding?.accountForm?.accessTokenLabelKey,
      accessTokenGuidanceTitleKey:
        onboarding?.accountForm?.accessTokenGuidanceTitleKey,
      accessTokenGuidanceKey: onboarding?.accountForm?.accessTokenGuidanceKey,
    },
    canonicalSiteUrl: onboarding?.accountForm?.fixedSiteUrl,
    defaultSiteName: onboarding?.accountForm?.defaultSiteName,
    lockSiteUrl: Boolean(onboarding?.accountForm?.fixedSiteUrl),
    requireUserId: productProfile.identity.userIdRequired,
    forceAccessTokenAuth:
      productProfile.auth.allowedAuthTypes.length === 1 &&
      productProfile.auth.allowedAuthTypes[0] === AuthTypeEnum.AccessToken,
    requireUsername: productProfile.identity.usernameRequired,
    allowCookieAuthSession: allowsCookieAuth,
    allowCookieAutoImport: allowsCookieAuth,
    allowKimiOpenPlatformAuthState:
      productProfile.authSession.kind ===
      ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.KimiRefreshToken,
    allowSub2ApiRefreshTokenState: usesSub2ApiRefreshSession,
    openSub2ApiTokenDialogPostSave: usesSub2ApiRefreshSession,
    deferSuccessForOneTimeKeyPostSaveFlow:
      productProfile.createdToken.secretHandling ===
      ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog,
    supportsKeyProvisioning: Boolean(
      getSiteTypeCapabilities(siteType).account?.keyResourceManagement,
    ),
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
    sub2apiUseRefreshToken: policy.allowSub2ApiRefreshTokenState
      ? draft.sub2apiUseRefreshToken
      : false,
    sub2apiRefreshToken: policy.allowSub2ApiRefreshTokenState
      ? draft.sub2apiRefreshToken
      : "",
    sub2apiTokenExpiresAt: policy.allowSub2ApiRefreshTokenState
      ? draft.sub2apiTokenExpiresAt
      : null,
    kimiOpenPlatformAuth: policy.allowKimiOpenPlatformAuthState
      ? draft.kimiOpenPlatformAuth
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
 * Defers add completion while the foreground owner provisions keys in either mode.
 */
export function shouldDeferAccountSaveSuccessForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  isAddMode: boolean
  autoProvisionKeyOnAccountAdd: boolean
  autoProvisionKeyOnAccountAddMode: AccountKeyAutoProvisionMode
  skipAutoProvisionKeyOnAccountAdd: boolean
}): boolean {
  const {
    policy,
    isAddMode,
    autoProvisionKeyOnAccountAdd,
    skipAutoProvisionKeyOnAccountAdd,
  } = params

  return (
    policy.supportsKeyProvisioning &&
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
    left.sub2apiUseRefreshToken === right.sub2apiUseRefreshToken &&
    left.sub2apiRefreshToken === right.sub2apiRefreshToken &&
    left.sub2apiTokenExpiresAt === right.sub2apiTokenExpiresAt &&
    left.kimiOpenPlatformAuth?.refreshToken ===
      right.kimiOpenPlatformAuth?.refreshToken &&
    left.kimiOpenPlatformAuth?.organizationId ===
      right.kimiOpenPlatformAuth?.organizationId &&
    left.kimiOpenPlatformAuth?.tokenExpiresAt ===
      right.kimiOpenPlatformAuth?.tokenExpiresAt
  )
}
