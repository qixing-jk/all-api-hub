import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { NativeResourceMutationResult } from "~/services/apiAdapters/nativeResources/factory"
import {
  type OpenRouterKeyResourceConfig,
  type OpenRouterNativeFailure,
} from "~/services/apiAdapters/openrouter/keys/accountKeyResourceConfig"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { t } from "~/utils/i18n/core"

export class OpenRouterNativeResourceError extends Error {
  constructor(readonly failure: OpenRouterNativeFailure) {
    super("openrouter_native_resource_failure")
    this.name = "OpenRouterNativeResourceError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const getStructuredStatus = (error: unknown): number | undefined => {
  if (error instanceof ApiError) return error.statusCode
  if (!isRecord(error)) return undefined
  const status = error.statusCode ?? error.status
  return typeof status === "number" && Number.isInteger(status)
    ? status
    : undefined
}

const nativeFailure = (
  error: unknown,
  config: Pick<OpenRouterKeyResourceConfig, "managementKey">,
  extraSecrets: readonly string[] = [],
): OpenRouterNativeResourceError =>
  new OpenRouterNativeResourceError({
    error,
    secrets: [config.managementKey, ...extraSecrets],
  })

const mapNativeFailure = (
  failure: OpenRouterNativeFailure,
): ResourceFailure => {
  const { error } = failure
  const status = getStructuredStatus(error)
  const code =
    isAbortError(error) || status === 499
      ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted
      : status === 401
        ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
        : status === 403
          ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
          : status === 404
            ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound
            : typeof status === "number" && status >= 500
              ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
              : typeof status === "number" && status >= 400
                ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected
                : ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected
  const message = toSanitizedErrorSummary(error, [...failure.secrets]).trim()

  return {
    code,
    message: message || t("account:healthStatus.unknownError"),
    ...(error instanceof ApiError && error.upstreamCode
      ? { upstreamCode: error.upstreamCode }
      : {}),
  }
}

export const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof OpenRouterNativeResourceError) {
    return mapNativeFailure(error.failure)
  }
  if (isRecord(error) && "error" in error && "secrets" in error) {
    return mapNativeFailure(error as OpenRouterNativeFailure)
  }
  return mapNativeFailure({ error, secrets: [] })
}

export const read = async <T>(
  config: OpenRouterKeyResourceConfig,
  operation: () => Promise<T>,
  extraSecrets: readonly string[] = [],
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw nativeFailure(error, config, extraSecrets)
  }
}

export const requestWithOptions = (
  config: OpenRouterKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

export const isUnreconciledMutationFailure = (error: unknown): boolean => {
  const status = getStructuredStatus(error)
  return (
    isAbortError(error) || status === 408 || status === 429 || status === 499
  )
}

export const isKnownRejection = (error: unknown): boolean => {
  const status = getStructuredStatus(error)
  return (
    !isUnreconciledMutationFailure(error) &&
    typeof status === "number" &&
    status >= 400 &&
    status < 500
  )
}

export const mutationFailure = <T>(
  error: unknown,
  config: OpenRouterKeyResourceConfig,
  extraSecrets: readonly string[] = [],
): NativeResourceMutationResult<T, OpenRouterNativeFailure> => {
  const failure = { error, secrets: [config.managementKey, ...extraSecrets] }
  return isKnownRejection(error)
    ? { certainty: "not-applied", failure }
    : { certainty: "possibly-applied", failure }
}
