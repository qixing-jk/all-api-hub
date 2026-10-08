import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type ClaudeCodeHubNativeConfig } from "~/services/apiAdapters/managedResources/claudeCodeHub/nativeContracts"
import { ClaudeCodeHubApiError } from "~/services/apiService/claudeCodeHub"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import { toClaudeCodeHubDisclosureError } from "~/services/managedSites/providers/claudeCodeHub"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"

export class ClaudeCodeHubNativeError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.message ?? failure.code)
    this.name = "ClaudeCodeHubNativeError"
  }
}

export const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

const mapClaudeCodeHubFailureCode = (
  error: ClaudeCodeHubApiError,
): ResourceFailure["code"] => {
  const rawName =
    error.raw && typeof error.raw === "object" && "name" in error.raw
      ? error.raw.name
      : undefined
  const rawCode =
    error.raw && typeof error.raw === "object" && "code" in error.raw
      ? error.raw.code
      : undefined
  if (
    rawName === "AbortError" ||
    error.code === "ABORT_ERR" ||
    rawCode === "ABORT_ERR"
  ) {
    return MANAGED_RESOURCE_FAILURE_CODES.Aborted
  }
  if (error.status === 401) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.status === 403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.status === 404) {
    return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  }
  if (error.status === undefined || error.status >= 500) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const toNativeError = (
  error: unknown,
  config: ClaudeCodeHubConfig,
): ClaudeCodeHubNativeError => {
  if (error instanceof ClaudeCodeHubNativeError) return error
  if (error instanceof ClaudeCodeHubApiError) {
    return new ClaudeCodeHubNativeError(
      {
        code: mapClaudeCodeHubFailureCode(error),
        message: toClaudeCodeHubDisclosureError(error, config).message,
        ...(error.code === undefined
          ? {}
          : { upstreamCode: String(error.code) }),
      },
      error,
    )
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ClaudeCodeHubNativeError(
      { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      error,
    )
  }
  return new ClaudeCodeHubNativeError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    error,
  )
}

export const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof ClaudeCodeHubNativeError) return error.failure
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

export const runRead = async <T>(
  nativeConfig: ClaudeCodeHubNativeConfig,
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
): Promise<ClaudeCodeHubNativeConfig> => {
  throwIfAborted(options)
  const preferences = await userPreferences.getPreferences()
  throwIfAborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.CLAUDE_CODE_HUB,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }

  let scopeKey: string
  try {
    const url = new URL(resolved.config.baseUrl.trim())
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid origin")
    }
    scopeKey = normalizeManagedUpstreamResourceScopeKey(url.origin)
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }

  return { config: resolved.config, scopeKey }
}

export const runMutation = async <T>(
  nativeConfig: ClaudeCodeHubNativeConfig,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toNativeError(error, nativeConfig.config)
  }
}
