import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type Sub2ApiNativeConfig } from "~/services/apiAdapters/managedResources/sub2apiNativeContracts"
import {
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
} from "~/services/managedSites/providers/sub2api"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value.trim())
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof Sub2ApiAdminApiError) {
    const upstreamCode =
      error.code === undefined ? undefined : String(error.code)
    const code =
      error.code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE ||
      error.status === 403
        ? MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
        : error.status === 401
          ? MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
          : error.status === 404
            ? MANAGED_RESOURCE_FAILURE_CODES.NotFound
            : error.status === undefined
              ? MANAGED_RESOURCE_FAILURE_CODES.Unavailable
              : MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
    return {
      code,
      message: error.message,
      ...(upstreamCode ? { upstreamCode } : {}),
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

export const openConfig = async (): Promise<Sub2ApiNativeConfig> => {
  const preferences = await userPreferences.getPreferences()
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.SUB2API,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }
  if (!isHttpUrl(resolved.config.baseUrl)) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }
  return {
    config: {
      baseUrl: resolved.config.baseUrl.trim(),
      adminToken: resolved.config.adminToken.trim(),
    },
    scopeKey: normalizeManagedUpstreamResourceScopeKey(resolved.config.baseUrl),
  }
}
