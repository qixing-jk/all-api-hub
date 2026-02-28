import { RuntimeActionIds } from "~/constants/runtimeActions"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { fetchApi } from "~/services/apiService/common/utils"
import { writeLdohSiteListCache } from "~/services/integrations/ldohSiteLookup/cache"
import {
  LDOH_ORIGIN,
  LDOH_SITES_ENDPOINT,
} from "~/services/integrations/ldohSiteLookup/constants"
import type {
  LdohSiteLookupRefreshSitesResponse,
  LdohSiteLookupRuntimeRequest,
} from "~/services/integrations/ldohSiteLookup/runtime"
import type { LdohSitesApiResponse } from "~/services/integrations/ldohSiteLookup/types"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const logger = createLogger("LdohSiteLookupBackground")

/**
 * Fetches the site directory from LDOH using the shared `fetchApi` wrapper.
 *
 * - Tries background fetch first (credentials include).
 * - Falls back to the temp-window flow when needed.
 */
const LDOH_SITE_LIST_REQUEST = {
  baseUrl: LDOH_ORIGIN,
  // Sentinel value to avoid fetchApi warning noise about missing accountId.
  accountId: "__ldoh_site_lookup__",
  // LDOH is session-cookie based; we do not have per-account auth here.
  auth: { authType: AuthTypeEnum.None },
} satisfies ApiServiceRequest

/**
 * Fetches the site directory from LDOH using the shared `fetchApi` wrapper.
 */
async function fetchLdohSites(): Promise<LdohSitesApiResponse> {
  return await fetchApi<LdohSitesApiResponse>(
    LDOH_SITE_LIST_REQUEST,
    {
      endpoint: LDOH_SITES_ENDPOINT,
      responseType: "json",
      tempWindowFallback: {
        statusCodes: [403],
        codes: [API_ERROR_CODES.HTTP_403],
      },
      options: {
        credentials: "include",
      },
    },
    true,
  )
}

let inFlightRefresh: Promise<LdohSiteLookupRefreshSitesResponse> | null = null

/**
 * Refreshes the cached LDOH site directory in extension storage.
 *
 * Uses the shared fetch pipeline (background first + temp-window fallback) and
 * de-duplicates concurrent refresh requests so we don't spam network or storage.
 */
export async function refreshLdohSiteListCache(): Promise<LdohSiteLookupRefreshSitesResponse> {
  if (inFlightRefresh) {
    return inFlightRefresh
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetchLdohSites()
      const cache = await writeLdohSiteListCache(response.sites)

      return { success: true, cachedCount: cache.items.length }
    } catch (error) {
      const isApiError = error instanceof ApiError
      const code = isApiError ? (error.code as unknown) : null
      const statusCode = isApiError ? error.statusCode : null

      const unauthenticated =
        isApiError &&
        (statusCode === 401 ||
          code === API_ERROR_CODES.HTTP_401 ||
          code === 401 ||
          code === "401")
      const isForbidden =
        isApiError &&
        (statusCode === 403 ||
          code === API_ERROR_CODES.HTTP_403 ||
          code === 403 ||
          code === "403")

      if (!unauthenticated && !isForbidden) {
        logger.warn("Failed to refresh LDOH site list cache", {
          error: getErrorMessage(error),
        })
      }

      return {
        success: false,
        unauthenticated: unauthenticated || undefined,
        error: getErrorMessage(error),
      }
    }
  })()

  try {
    return await inFlightRefresh
  } finally {
    inFlightRefresh = null
  }
}

/**
 * Handles runtime messages for the LDOH site lookup feature.
 *
 * Message contract:
 * - Request: `{ action: RuntimeActionIds.LdohSiteLookupRefreshSites }`
 * - Response: `{ success: boolean, cachedCount?: number, unauthenticated?: boolean, error?: string }`
 */
export async function handleLdohSiteLookupMessage(
  request: LdohSiteLookupRuntimeRequest,
  sendResponse: (response: LdohSiteLookupRefreshSitesResponse) => void,
) {
  try {
    switch (request.action) {
      case RuntimeActionIds.LdohSiteLookupRefreshSites: {
        const result = await refreshLdohSiteListCache()
        sendResponse(result)
        return
      }
      default: {
        sendResponse({
          success: false,
          error: "Unknown LDOH site lookup action.",
        })
      }
    }
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
