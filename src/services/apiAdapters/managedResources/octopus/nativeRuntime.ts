import {
  MANAGED_RESOURCE_FAILURE_CODES as failures,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { ApiError } from "~/services/apiTransport/errors"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"

export const aborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted)
    throw new ManagedResourceError({ code: failures.Aborted })
}

export const assertLocator = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ManagedResourceError({ code: failures.ValidationFailed })
  return id
}

export const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof Error && error.name === "AbortError")
    return { code: failures.Aborted }
  if (error instanceof ApiError) {
    const code =
      error.statusCode === 401
        ? failures.AuthenticationFailed
        : error.statusCode === 403
          ? failures.PermissionDenied
          : error.statusCode === 404
            ? failures.NotFound
            : !error.statusCode || error.statusCode >= 500
              ? failures.Unavailable
              : failures.UpstreamRejected
    return {
      code,
      message: sanitizeSensitiveErrorText(error.message),
      ...(error.upstreamCode
        ? { upstreamCode: sanitizeSensitiveErrorText(error.upstreamCode) }
        : {}),
    }
  }
  return {
    code: failures.Unexpected,
    ...(error instanceof Error
      ? { message: sanitizeSensitiveErrorText(error.message) }
      : {}),
  }
}

export const redactKnownSecrets = (
  message: string,
  secrets: readonly (string | undefined)[],
) => {
  for (const secret of secrets
    .filter((value): value is string => !!value)
    .sort((a, b) => b.length - a.length))
    message = message.split(secret).join("[REDACTED]")
  return sanitizeSensitiveErrorText(message)
}

export const read = async <T>(
  options: ResourceOperationOptions | undefined,
  action: () => Promise<T>,
  secrets: readonly (string | undefined)[] = [],
): Promise<T> => {
  aborted(options)
  try {
    const result = await action()
    aborted(options)
    return result
  } catch (error) {
    const failure = mapFailure(error)
    throw new ManagedResourceError({
      ...failure,
      ...(failure.message
        ? { message: redactKnownSecrets(failure.message, secrets) }
        : {}),
      ...(failure.upstreamCode
        ? { upstreamCode: redactKnownSecrets(failure.upstreamCode, secrets) }
        : {}),
    })
  }
}
