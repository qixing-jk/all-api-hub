import type { NewApiTokenVerification } from "~/services/apiService/newApiFamily/accessTokens/creation"
import {
  NEW_API_TOKEN_CREATION_ERRORS as CREATION_ERRORS,
  NEW_API_TOKEN_ENDPOINTS as ENDPOINTS,
  NEW_API_TOKEN_VERIFICATION_METHODS as METHODS,
  NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS,
} from "~/services/apiService/newApiFamily/accessTokens/protocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

export const TOKEN_CREATION_FEEDBACK = {
  UNAVAILABLE: "unavailable",
  VALIDATION_FAILED: "validationFailed",
  UNCERTAIN: "uncertain",
  FAILED: "failed",
  LOCKED: "locked",
  LIMIT: "limit",
  IDENTITY: "identity",
  SESSION: "session",
  INVALID_PASSWORD: "invalidPassword",
  INVALID_CODE: "invalidCode",
  CANCELLED: "cancelled",
  TIMEOUT: "timeout",
} as const

export type TokenCreationError =
  (typeof TOKEN_CREATION_FEEDBACK)[keyof typeof TOKEN_CREATION_FEEDBACK]

export const siteFallbackErrors = new Set<TokenCreationError>([
  TOKEN_CREATION_FEEDBACK.UNAVAILABLE,
  TOKEN_CREATION_FEEDBACK.FAILED,
  TOKEN_CREATION_FEEDBACK.LOCKED,
  TOKEN_CREATION_FEEDBACK.LIMIT,
  TOKEN_CREATION_FEEDBACK.IDENTITY,
  TOKEN_CREATION_FEEDBACK.SESSION,
  TOKEN_CREATION_FEEDBACK.TIMEOUT,
])
export const secretErrors = new Set<TokenCreationError>([
  TOKEN_CREATION_FEEDBACK.FAILED,
  TOKEN_CREATION_FEEDBACK.INVALID_PASSWORD,
  TOKEN_CREATION_FEEDBACK.INVALID_CODE,
])
const nonCredentialRejections = new Set<string>([
  API_ERROR_CODES.ROBOT_CHALLENGE,
  API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
  API_ERROR_CODES.JSON_PARSE_ERROR,
  API_ERROR_CODES.NETWORK_ERROR,
])

/** A protection, rate-limit, or transport error does not establish bad credentials. */
function isRejectedVerification(error: ApiError): boolean {
  const { endpoint, statusCode, code, upstreamCode, unattributedMessage } =
    error
  if (
    endpoint !== ENDPOINTS.VERIFY ||
    unattributedMessage ||
    statusCode === 401 ||
    statusCode === 408 ||
    statusCode === 429 ||
    (statusCode !== undefined && statusCode >= 500) ||
    (code && nonCredentialRejections.has(code)) ||
    (upstreamCode && nonCredentialRejections.has(upstreamCode))
  )
    return false
  return (
    statusCode === 400 ||
    statusCode === 403 ||
    statusCode === 422 ||
    code === API_ERROR_CODES.BUSINESS_ERROR
  )
}

/** Translate supported verification outcomes without surfacing raw site messages. */
export function classifyVerificationError(
  error: unknown,
  method: NewApiTokenVerification["method"],
): TokenCreationError {
  if (error instanceof ApiError) {
    const code = error.upstreamCode ?? error.code
    if (code === VERIFICATION_ERRORS.LOCKED)
      return TOKEN_CREATION_FEEDBACK.LOCKED
    if (code === CREATION_ERRORS.LIMIT) return TOKEN_CREATION_FEEDBACK.LIMIT
    if (
      code === VERIFICATION_ERRORS.OAUTH_ACCOUNT_MISMATCH ||
      code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
    )
      return TOKEN_CREATION_FEEDBACK.IDENTITY
    if (error.statusCode === 401) return TOKEN_CREATION_FEEDBACK.SESSION
    if (isRejectedVerification(error)) {
      if (method === METHODS.PASSWORD)
        return TOKEN_CREATION_FEEDBACK.INVALID_PASSWORD
      if (method === METHODS.TWO_FACTOR)
        return TOKEN_CREATION_FEEDBACK.INVALID_CODE
    }
  } else if (error instanceof Error) {
    if (
      error.message === VERIFICATION_ERRORS.PASSKEY_CANCELLED ||
      error.message === VERIFICATION_ERRORS.OAUTH_CANCELLED
    )
      return TOKEN_CREATION_FEEDBACK.CANCELLED
    if (error.message === VERIFICATION_ERRORS.OAUTH_TIMEOUT)
      return TOKEN_CREATION_FEEDBACK.TIMEOUT
  }
  return TOKEN_CREATION_FEEDBACK.FAILED
}
