import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import type { AccountSiteType } from "~/constants/siteType"
import { getAccountSiteProductProfile } from "~/services/accounts/accountSiteProfile"
import type {
  AccountCookieValidationResult,
  AccountCookieValidationTarget,
} from "~/services/apiAdapters/contracts/accountLogin"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  API_ERROR_CODES,
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import {
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { checkCookieInterceptorRequirement } from "~/utils/browser/cookieHelper"
import { normalizeCookieHeaderValue } from "~/utils/browser/cookieString"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

const COOKIE_VALIDATION_TIMEOUT_MS = 15_000

/** Shared feedback for inconclusive checks, including recovery verification. */
export function getAccountCookieUnavailableMessage(
  reason: Extract<
    AccountCookieValidationResult,
    { status: typeof ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable }
  >["reason"],
): string {
  return reason === ACCOUNT_COOKIE_VALIDATION_REASONS.Permission
    ? t("accountDialog:cookieValidation.permissionRequired")
    : reason === ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported
      ? t("accountDialog:cookieValidation.unsupported")
      : t("accountDialog:cookieValidation.unavailable")
}

/** Compose diagnostics from Cookie authentication and the existing identity reader. */
export function supportsAccountCookieValidation(
  siteType: AccountSiteType,
): boolean {
  return (
    getAccountSiteProductProfile(siteType).auth.allowedAuthTypes.includes(
      AuthTypeEnum.Cookie,
    ) &&
    Boolean(getSiteTypeCapabilities(siteType).account?.bootstrap?.fetchUserInfo)
  )
}

/** Preserve inconclusive transport failures separately from credential rejection. */
function classify(error: unknown): AccountCookieValidationResult {
  if (error instanceof ApiError) {
    if (error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH)
      return { status: ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch }
    if (error.code === API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED)
      return {
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Permission,
      }
    if (
      error.code === API_ERROR_CODES.ROBOT_CHALLENGE ||
      error.code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH
    )
      return {
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
      }
    if (isAuthenticationRequiredError(error))
      return { status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid }
    if (
      error.code === API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE ||
      error.code === API_ERROR_CODES.FEATURE_UNSUPPORTED
    )
      return {
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
      }
    if (
      error.code === API_ERROR_CODES.JSON_PARSE_ERROR ||
      error.code === API_ERROR_CODES.BUSINESS_ERROR ||
      !error.code ||
      error.statusCode
    )
      return {
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason: ACCOUNT_COOKIE_VALIDATION_REASONS.InvalidResponse,
      }
  }
  return {
    status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
    reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Network,
  }
}

/** Read only the supplied credential; never invoke login, completion or token creation. */
export async function validateAccountCookie(
  account: AccountCookieValidationTarget,
): Promise<AccountCookieValidationResult> {
  if (!account.site_type || !supportsAccountCookieValidation(account.site_type))
    return {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    }
  const cookie = normalizeCookieHeaderValue(
    account.cookieAuth?.sessionCookie ?? "",
  )
  const identity = String(account.account_info.id ?? "").trim()
  if (!cookie)
    return {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.MissingCookie,
    }
  if (!identity)
    return {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.MissingIdentity,
    }
  const url = tryParseHttpUrl(account.site_url)
  if (!url || url.username || url.password)
    return {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    }
  const origin = url.origin
  const reader = getSiteTypeCapabilities(account.site_type).account?.bootstrap
    ?.fetchUserInfo
  if (!reader)
    return {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    }
  const useFirefoxTransport = isProtectionBypassFirefoxEnv()
  const request: ApiServiceRequest = {
    baseUrl: account.site_url,
    siteType: account.site_type,
    auth: { authType: AuthTypeEnum.Cookie, userId: identity, cookie },
    cookieSession: useFirefoxTransport
      ? undefined
      : { origin, cookieHeader: cookie },
    forceTempWindow: useFirefoxTransport,
    protectionBypassExecution: account.protectionBypassExecution,
    tempWindowRequestSource: account.tempWindowRequestSource,
    fetchContext: {
      kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
      incognito: account.fetchContext?.incognito,
      cookieStoreId: account.fetchContext?.cookieStoreId,
    },
    abortSignal: account.abortSignal,
    requestTimeoutMs: COOKIE_VALIDATION_TIMEOUT_MS,
  }
  try {
    // Firefox isolates the supplied Cookie through its existing webRequest channel.
    if (useFirefoxTransport) {
      if (!(await checkCookieInterceptorRequirement()))
        return {
          status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
          reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Permission,
        }
      if (!account.protectionBypassExecution)
        return {
          status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
          reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
        }
    }
    let user
    try {
      user = await reader(request)
    } catch (error) {
      const result = classify(error)
      // Read-only fallback retains the explicit Cookie; protection contexts may add WAF cookies.
      if (
        useFirefoxTransport ||
        !(error instanceof ApiError) ||
        !account.protectionBypassExecution ||
        !(
          result.status === ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable &&
          (result.reason === ACCOUNT_COOKIE_VALIDATION_REASONS.Verification ||
            error.code === API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE)
        )
      )
        throw error
      account.abortSignal?.throwIfAborted()
      user = await reader({
        ...request,
        cookieSession: undefined,
        forceTempWindow: true,
      })
    }
    const actual =
      typeof user?.id === "string" ||
      (typeof user?.id === "number" && Number.isFinite(user.id))
        ? String(user.id).trim()
        : ""
    return actual
      ? {
          status:
            actual === identity
              ? ACCOUNT_COOKIE_VALIDATION_STATUS.Valid
              : ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch,
        }
      : {
          status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
          reason: ACCOUNT_COOKIE_VALIDATION_REASONS.InvalidResponse,
        }
  } catch (error) {
    return classify(error)
  }
}
