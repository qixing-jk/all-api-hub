import { ACCOUNT_COOKIE_VALIDATION_STATUS } from "~/constants/accountCookieValidation"
import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import {
  getAccountCookieUnavailableMessage,
  validateAccountCookie,
} from "~/services/accounts/cookieValidation"
import type {
  AccountCookieValidationResult,
  AccountCookieValidationTarget,
  AccountLoginResult,
} from "~/services/apiAdapters/contracts/accountLogin"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { t } from "~/utils/i18n/core"

type LoginFailure = Exclude<
  AccountLoginResult,
  { status: typeof BROWSER_LOGIN_STATUS.Authenticated }
>

/** Recovery diagnostics belong to exported credentials, not the login protocol. */
export type AccountCookieRecoveryFailure = LoginFailure & {
  verification?: AccountCookieValidationResult
}

export type AccountCookieRecoveryResult =
  | Extract<
      AccountLoginResult,
      { status: typeof BROWSER_LOGIN_STATUS.Authenticated }
    >
  | AccountCookieRecoveryFailure

/** Reuse credential guidance without discarding the structured verification cause. */
export function getAccountCookieRecoveryMessage(
  result: AccountCookieRecoveryFailure,
): string {
  if (
    result.verification?.status === ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable
  ) {
    return getAccountCookieUnavailableMessage(result.verification.reason)
  }
  return result.message || t("accountDialog:cookieValidation.recoveryFailed")
}

/** Recovery succeeds only with the adapter-verified identity and a captured Cookie. */
function validateRecoveredCookie(
  result: AccountLoginResult,
  expectedIdentity: string,
):
  | LoginFailure
  | (Extract<
      AccountLoginResult,
      { status: typeof BROWSER_LOGIN_STATUS.Authenticated }
    > & { credential: { cookie: string } }) {
  if (result.status !== BROWSER_LOGIN_STATUS.Authenticated) return result
  if (result.identity !== expectedIdentity)
    return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
  if (!result.credential?.cookie.trim())
    return { status: BROWSER_LOGIN_STATUS.Failed }
  return { ...result, credential: result.credential }
}

/** Verify the exported credential independently of the browser login's ambient auth. */
export async function verifyRecoveredCookie(
  result: AccountLoginResult,
  target: AccountCookieValidationTarget,
) {
  const captured = validateRecoveredCookie(
    result,
    String(target.account_info.id),
  )
  if (captured.status !== BROWSER_LOGIN_STATUS.Authenticated) return captured
  target.abortSignal?.throwIfAborted()
  const verification = await validateAccountCookie({
    ...target,
    cookieAuth: { sessionCookie: captured.credential.cookie },
  })
  target.abortSignal?.throwIfAborted()
  if (verification.status === ACCOUNT_COOKIE_VALIDATION_STATUS.Valid)
    return captured
  return {
    verification,
    status:
      verification.status === ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch
        ? BROWSER_LOGIN_STATUS.IdentityMismatch
        : verification.status === ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid
          ? BROWSER_LOGIN_STATUS.Failed
          : BROWSER_LOGIN_STATUS.Uncertain,
  }
}

/** Keeps the login outcome separate from the initial request's 401. */
export class AccountCredentialRecoveryError extends ApiError {
  constructor(
    public readonly result: AccountCookieRecoveryFailure,
    rejectedRequest: ApiError,
  ) {
    super(
      getAccountCookieRecoveryMessage(result),
      undefined,
      rejectedRequest.endpoint,
      result.status === BROWSER_LOGIN_STATUS.IdentityMismatch
        ? API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
        : API_ERROR_CODES.ACCOUNT_CREDENTIAL_RECOVERY_FAILED,
    )
    this.name = "AccountCredentialRecoveryError"
    // Passing this to ApiError's constructor would inherit its HTTP status.
    this.cause = rejectedRequest
  }
}
