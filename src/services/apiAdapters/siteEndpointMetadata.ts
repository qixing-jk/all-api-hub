import type { SiteEndpointMetadataReadContext } from "~/services/apiAdapters/contracts/siteEndpointMetadata"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

/** Explicit projection also rejects unexpected credentials supplied at runtime. */
export function createPublicSiteEndpointMetadataRequest(
  context: SiteEndpointMetadataReadContext,
): ApiServiceRequest {
  return {
    baseUrl: context.baseUrl,
    auth: { authType: AuthTypeEnum.None },
    directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
    ...(context.fetchContext ? { fetchContext: context.fetchContext } : {}),
    ...(context.currentTabFallback
      ? { currentTabFallback: context.currentTabFallback }
      : {}),
  }
}

/** Preserve complete addresses; each consumer chooses its own safe projection. */
export function normalizeSiteEndpointMetadataUrls(
  values: readonly unknown[],
): string[] {
  const urls = new Set<string>()
  for (const value of values) {
    if (typeof value !== "string") continue
    try {
      const url = new URL(value)
      if (url.protocol === "http:" || url.protocol === "https:")
        urls.add(url.href)
    } catch {
      // Invalid entries provide no address evidence.
    }
  }
  return [...urls]
}
