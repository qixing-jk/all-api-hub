import { fetchApi } from "~/services/apiService/common/utils"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { writeLdohSiteListCache } from "~/services/integrations/ldohSiteLookup/cache"
import {
  LDOH_ORIGIN,
  LDOH_SITES_ENDPOINT,
} from "~/services/integrations/ldohSiteLookup/constants"
import type { LdohSiteLookupRefreshSitesResponse } from "~/services/integrations/ldohSiteLookup/runtime"
import {
  LdohSiteLookupMessageTypes,
  onLdohSiteLookupMessage,
} from "~/services/integrations/ldohSiteLookup/runtime"
import type { LdohSitesApiResponse } from "~/services/integrations/ldohSiteLookup/types"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

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

let ldohSiteLookupMessagingCleanup: (() => void)[] | null = null

/**
 * Background listeners for typed LDOH site lookup messaging.
 */
export function setupLdohSiteLookupMessagingListeners() {
  if (ldohSiteLookupMessagingCleanup) {
    return
  }

  ldohSiteLookupMessagingCleanup = [
    onLdohSiteLookupMessage(LdohSiteLookupMessageTypes.RefreshSites, () =>
      resolveLdohSiteLookupRefreshSitesMessage(),
    ),
  ]
}

/**
 * Resolve typed LDOH site lookup refresh messages through the shared service logic.
 */
async function resolveLdohSiteLookupRefreshSitesMessage(): Promise<LdohSiteLookupRefreshSitesResponse> {
  try {
    return await refreshLdohSiteListCache()
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
