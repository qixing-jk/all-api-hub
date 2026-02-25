import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  sendRuntimeActionMessage,
  type SendMessageRetryOptions,
} from "~/utils/browserApi"

/**
 * Runtime request to refresh the cached LDOH site directory (background-only work).
 */
export type LdohSiteLookupRefreshSitesRequest = {
  action: typeof RuntimeActionIds.LdohSiteLookupRefreshSites
}

/**
 * Runtime response for {@link LdohSiteLookupRefreshSitesRequest}.
 */
export type LdohSiteLookupRefreshSitesResponse =
  | {
      success: true
      cachedCount: number
    }
  | {
      success: false
      unauthenticated?: boolean
      error: string
    }

/**
 * Union of LDOH site lookup runtime requests handled by the background router.
 */
export type LdohSiteLookupRuntimeRequest = LdohSiteLookupRefreshSitesRequest

/**
 * Requests the background script to refresh the LDOH site directory cache.
 *
 * This is intentionally a thin wrapper around {@link sendRuntimeActionMessage} so
 * UI code does not depend on raw runtime action IDs.
 */
export async function requestLdohSiteLookupRefreshSites(
  options?: SendMessageRetryOptions,
): Promise<LdohSiteLookupRefreshSitesResponse> {
  const response = await sendRuntimeActionMessage(
    {
      action: RuntimeActionIds.LdohSiteLookupRefreshSites,
    },
    options,
  )

  if (response && typeof response === "object") {
    return response as LdohSiteLookupRefreshSitesResponse
  }

  return { success: false, error: "No response from background." }
}
