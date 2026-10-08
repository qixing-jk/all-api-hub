import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type GptLoadNativeConfig } from "~/services/apiAdapters/managedResources/gptLoadNativeContracts"
import { GptLoadApiError } from "~/services/apiService/gptLoad"
import { toGptLoadDisclosureError } from "~/services/managedSites/providers/gptLoad"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  normalizeGptLoadBaseUrl,
  type GptLoadConfig,
} from "~/types/gptLoadConfig"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"

export class GptLoadNativeError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.message ?? failure.code)
    this.name = "GptLoadNativeError"
  }
}

export const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

const mapGptLoadFailureCode = (
  error: GptLoadApiError,
): ResourceFailure["code"] => {
  if (
    error.code === "ABORT_ERR" ||
    (error.raw instanceof Error && error.raw.name === "AbortError")
  ) {
    return MANAGED_RESOURCE_FAILURE_CODES.Aborted
  }
  if (error.status === 401 || error.status === 423) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.status === 403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.status === 404) return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  if (error.status === 409) {
    return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
  }
  if (error.status === undefined || error.status >= 500) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const toNativeError = (
  error: unknown,
  config: GptLoadConfig,
): GptLoadNativeError => {
  if (error instanceof GptLoadNativeError) return error
  if (error instanceof GptLoadApiError) {
    return new GptLoadNativeError(
      {
        code: mapGptLoadFailureCode(error),
        message: toGptLoadDisclosureError(error, config).message,
        ...(error.code === undefined
          ? {}
          : { upstreamCode: String(error.code) }),
      },
      error,
    )
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new GptLoadNativeError(
      { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      error,
    )
  }
  return new GptLoadNativeError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    error,
  )
}

export const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof GptLoadNativeError) return error.failure
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

export const runRead = async <T>(
  nativeConfig: GptLoadNativeConfig,
  options: ResourceOperationOptions | undefined,
  operation: () => Promise<T>,
): Promise<T> => {
  throwIfAborted(options)
  try {
    const result = await operation()
    throwIfAborted(options)
    return result
  } catch (error) {
    throw toNativeError(error, nativeConfig.config)
  }
}

export const openConfig = async (
  options?: ResourceOperationOptions,
): Promise<GptLoadNativeConfig> => {
  throwIfAborted(options)
  const preferences = await userPreferences.getPreferences()
  throwIfAborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.GPT_LOAD,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }

  try {
    const url = new URL(normalizeGptLoadBaseUrl(resolved.config.baseUrl))
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid origin")
    }
    return {
      config: resolved.config,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(url.origin),
    }
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }
}
