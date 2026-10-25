import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import {
  PMAPI_ENDPOINTS,
  PMAPI_TOKEN_STORAGE_KEY,
} from "~/services/apiService/pmapi/constants"
import { isRecord } from "~/utils/core/object"

/**
 * The console keeps its Bearer session in localStorage (`pm_token`); the
 * passive identity check verifies it against `/api/me` without persisting or
 * logging the token.
 */
export const pmApiBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.PMAPI,
  observe() {
    const token = localStorage.getItem(PMAPI_TOKEN_STORAGE_KEY)?.trim()
    if (!token) return null
    return {
      sessionKey: token,
      cacheResult: false,
      async verify(read) {
        try {
          const body = await read({
            url: `${location.origin}${PMAPI_ENDPOINTS.Identity}`,
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!isRecord(body) || body.success !== true || !isRecord(body.data))
            return null
          const id = body.data.id
          return typeof id === "number" ? String(id) : null
        } catch {
          return null
        }
      },
    }
  },
}
