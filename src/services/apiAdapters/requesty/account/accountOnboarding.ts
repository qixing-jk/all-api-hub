import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { isSameAccountSiteOrigin } from "~/services/accounts/accountSiteProfile/urls"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import {
  REQUESTY_DISPLAY_NAME,
  REQUESTY_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  provisionRequestyManagementKey,
  REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES,
} from "~/services/apiAdapters/requesty/account/accountProvisioning"
import {
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  type RequestyProvisioningFailureReason,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import { fetchRequestySelfKeyInfo } from "~/services/apiService/requesty"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"
import { t } from "~/utils/i18n/core"

/** Provider-owned form defaults used before a console action can complete. */
export const requestyOnboardingDefaults = {
  siteType: SITE_TYPES.REQUESTY,
  siteName: REQUESTY_DISPLAY_NAME,
  authType: AuthTypeEnum.AccessToken,
  exchangeRate: DEFAULT_USD_TO_CNY_RATE,
}

/** Requesty console credentials belong only to its verified HTTPS origin. */
export function isCanonicalRequestyUrl(value: string): boolean {
  try {
    return new URL(value).origin === REQUESTY_WEB_ORIGIN
  } catch {
    return false
  }
}

/**
 * Finds a manage key already stored by another account for the same console.
 *
 * Requesty's console can only mint one organization's keys per Clerk session,
 * so an account for this site already holds a working credential. Reusing it
 * keeps repeated "add account" attempts from minting redundant keys, which the
 * provider cannot rename or recover afterwards.
 */
async function findStoredRequestyManageKey(): Promise<string | null> {
  const accounts = await accountQueries.getAllAccounts()
  for (const account of accounts) {
    if (account.site_type !== SITE_TYPES.REQUESTY) continue
    const credential = account.account_info.access_token?.trim() ?? ""
    if (!credential) continue
    if (
      !isSameAccountSiteOrigin(
        { url: account.site_url, siteType: account.site_type },
        { url: REQUESTY_WEB_ORIGIN, siteType: SITE_TYPES.REQUESTY },
      )
    ) {
      continue
    }
    try {
      await fetchRequestySelfKeyInfo({
        baseUrl: REQUESTY_WEB_ORIGIN,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: credential,
        },
      })
      return credential
    } catch {
      // A stored key that no longer verifies must not block a fresh create.
      continue
    }
  }
  return null
}

/** Explicit onboarding creates once, preserves plaintext, then uses normal completion. */
export async function onboardRequestyAccount(params: {
  accessToken?: string
  protectionBypassExecution: ProtectionBypassExecution
  onCredentialCreated: (credential: string) => void
}): Promise<AccountAutoDetectResponse> {
  let accessToken = params.accessToken?.trim() ?? ""
  let possiblyCreated = false
  const recoveryData = requestyOnboardingDefaults
  const failure = (
    reason?: RequestyProvisioningFailureReason,
  ): AccountAutoDetectResponse => {
    const signedOut =
      !accessToken &&
      !possiblyCreated &&
      reason === REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable
    const message = t(
      accessToken
        ? "accountDialog:form.requestyManageKeyValidationFailed"
        : possiblyCreated
          ? "accountDialog:form.autoCreateAccessTokenUnconfirmed"
          : reason === REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable
            ? "accountDialog:form.requestySignInRequired"
            : "accountDialog:form.autoCreateAccessTokenFailed",
    )
    return {
      kind: "detected",
      success: false,
      message,
      detailedError: {
        type: signedOut
          ? AutoDetectErrorType.UNAUTHORIZED
          : AutoDetectErrorType.INVALID_RESPONSE,
        message,
        canUseApiCredentialFallback: false,
        ...(signedOut
          ? { actionText: t("messages:autodetect.loginThisSite") }
          : {}),
      },
      recoveryData: {
        ...recoveryData,
        ...(accessToken ? { accessToken } : {}),
      },
    }
  }
  try {
    let reusedStoredCredential = false
    if (!accessToken) {
      // Reuse before minting: a second key for the same organization is
      // redundant and cannot be renamed or recovered afterwards.
      const stored = await findStoredRequestyManageKey()
      if (stored) {
        accessToken = stored
        reusedStoredCredential = true
        params.onCredentialCreated(stored)
      }
    }
    if (!accessToken) {
      const created = await provisionRequestyManagementKey({
        protectionBypassExecution: params.protectionBypassExecution,
        onCredentialCreated: (credential) => {
          accessToken = credential
          possiblyCreated = true
          params.onCredentialCreated(credential)
        },
      })
      if (
        created.status !== REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Created
      ) {
        possiblyCreated ||= created.possiblyCreated
        return failure(created.reason)
      }
      accessToken = created.accessToken
    }
    const data = await completeAutoDetectedAccount({
      url: REQUESTY_WEB_ORIGIN,
      requestedAuthType: AuthTypeEnum.AccessToken,
      protectionBypassExecution: params.protectionBypassExecution,
      detected: { siteType: SITE_TYPES.REQUESTY, userId: "", accessToken },
    })
    return {
      kind: "detected",
      success: true,
      message: t(
        reusedStoredCredential
          ? "accountDialog:form.requestyReusedManageKey"
          : "accountDialog:messages.autoDetectSuccess",
      ),
      data,
    }
  } catch {
    return failure()
  }
}
