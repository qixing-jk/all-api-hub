import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  inferStructuredHttpStatus,
  isAbortError,
} from "~/services/verification/aiApiVerification/utils"

const failureCodes = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FAILURE_CODES),
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readNonBlankString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined

const readControlledFailure = (value: unknown): ResourceFailure | undefined => {
  if (!isRecord(value) || !failureCodes.has(String(value.code))) {
    return undefined
  }

  const message = readNonBlankString(value.message)
  const upstreamCode = readNonBlankString(value.upstreamCode)
  return {
    code: value.code as ResourceFailure["code"],
    ...(message ? { message } : {}),
    ...(upstreamCode ? { upstreamCode } : {}),
    ...(Array.isArray(value.fieldIssues)
      ? { fieldIssues: value.fieldIssues as ResourceFailure["fieldIssues"] }
      : {}),
  }
}

const getApiErrorCode = (error: unknown): string | undefined =>
  error instanceof ApiError
    ? error.code
    : isRecord(error)
      ? readNonBlankString(error.code)
      : undefined

const classifyApiErrorCode = (
  code: string | undefined,
): ResourceFailure["code"] | undefined => {
  switch (code) {
    case API_ERROR_CODES.HTTP_401:
      return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
    case API_ERROR_CODES.HTTP_403:
      return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
    case API_ERROR_CODES.HTTP_429:
    case API_ERROR_CODES.NETWORK_ERROR:
    case API_ERROR_CODES.CONTENT_TYPE_MISMATCH:
    case API_ERROR_CODES.JSON_PARSE_ERROR:
    case API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE:
      return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
    case API_ERROR_CODES.BUSINESS_ERROR:
      return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected
    default:
      return undefined
  }
}

const classifyFailureCode = (error: unknown): ResourceFailure["code"] => {
  const status = inferStructuredHttpStatus(error)
  if (isAbortError(error) || status === 499) {
    return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted
  }
  if (status === 401) {
    return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (status === 403) {
    return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (status === 404) return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound
  if (
    status === 408 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
  }
  if (status !== undefined && status >= 400) {
    return ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected
  }
  return (
    classifyApiErrorCode(getApiErrorCode(error)) ??
    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected
  )
}

const readUpstreamCode = (error: unknown): string | undefined =>
  error instanceof ApiError
    ? readNonBlankString(error.upstreamCode)
    : isRecord(error)
      ? readNonBlankString(error.upstreamCode)
      : undefined

/** Maps provider failures into the controlled account-key resource contract. */
export function mapAccountKeyResourceFailure(error: unknown): ResourceFailure {
  const controlled =
    error instanceof AccountKeyResourceError
      ? readControlledFailure(error.failure)
      : readControlledFailure(error)
  if (controlled) return controlled

  const message =
    error instanceof Error
      ? readNonBlankString(error.message)
      : isRecord(error)
        ? readNonBlankString(error.message)
        : undefined
  const upstreamCode = readUpstreamCode(error)
  return {
    code: classifyFailureCode(error),
    ...(message ? { message } : {}),
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}

/** Preserves safe provider detail while making an unconfirmed write explicit. */
export function mapAccountKeyResourceUncertainFailure(
  error?: unknown,
): ResourceFailure {
  const failure =
    error === undefined ? undefined : mapAccountKeyResourceFailure(error)
  return {
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    ...(failure?.message ? { message: failure.message } : {}),
    ...(failure?.upstreamCode ? { upstreamCode: failure.upstreamCode } : {}),
  }
}
