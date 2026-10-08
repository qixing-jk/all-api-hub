import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type OmniRouteNativeConfig } from "~/services/apiAdapters/managedResources/omniRouteNativeContracts"
import { OmniRouteApiError } from "~/services/apiService/omniroute"
import { toOmniRouteDisclosureError } from "~/services/managedSites/providers/omniroute"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import {
  normalizeOmniRouteBaseUrl,
  type OmniRouteConfig,
} from "~/types/omnirouteConfig"

export class OmniRouteNativeError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.message ?? failure.code)
    this.name = "OmniRouteNativeError"
  }
}

export const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

const mapOmniRouteFailureCode = (
  error: OmniRouteApiError,
): ResourceFailure["code"] => {
  if (
    error.code === "ABORT_ERR" ||
    (error.raw instanceof Error && error.raw.name === "AbortError")
  ) {
    return MANAGED_RESOURCE_FAILURE_CODES.Aborted
  }
  if (error.status === 401) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.status === 403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.status === 404) return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  if (error.status === undefined || error.status >= 500) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const toNativeError = (
  error: unknown,
  config: OmniRouteConfig,
): OmniRouteNativeError => {
  if (error instanceof OmniRouteNativeError) return error
  if (error instanceof OmniRouteApiError) {
    return new OmniRouteNativeError(
      {
        code: mapOmniRouteFailureCode(error),
        // The gateway's own message is what tells a user about a name conflict
        // or a rejected base URL; keep it while redacting the token.
        message: toOmniRouteDisclosureError(error, config).message,
        ...(error.code === undefined
          ? {}
          : { upstreamCode: String(error.code) }),
      },
      error,
    )
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new OmniRouteNativeError(
      { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      error,
    )
  }
  return new OmniRouteNativeError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    error,
  )
}

export const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof OmniRouteNativeError) return error.failure
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

export const runRead = async <T>(
  nativeConfig: OmniRouteNativeConfig,
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
): Promise<OmniRouteNativeConfig> => {
  throwIfAborted(options)
  const preferences = await userPreferences.getPreferences()
  throwIfAborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.OMNIROUTE,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }

  try {
    const url = new URL(normalizeOmniRouteBaseUrl(resolved.config.baseUrl))
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
