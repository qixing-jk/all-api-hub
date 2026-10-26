import {
  PMAPI_HOSTNAMES,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  PMAPI_ENDPOINTS,
  PMAPI_TOKEN_STORAGE_KEY,
} from "~/services/apiService/pmapi/constants"
import { parsePmApiIdentity } from "~/services/apiService/pmapi/identity"
import { isRecord } from "~/utils/core/object"

import {
  ContentSessionProtocolError,
  type ContentSessionExtractor,
} from "../contracts"

const isPmApiOrigin = (url: string | undefined) => {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return PMAPI_HOSTNAMES.some((registered) => registered === hostname)
  } catch {
    return false
  }
}

/**
 * PM-API keeps its console session in localStorage (`pm_token`) after the user
 * completes the site login (including its manual slider/Turnstile captcha).
 * The stored token is not a protocol signature by itself, so extraction
 * verifies the live identity through `/api/me` before returning it.
 */
export const pmApiContentSessionExtractor: ContentSessionExtractor = {
  id: "pmapi",
  canExtract: (context) =>
    context.siteTypeHint === SITE_TYPES.PMAPI &&
    isPmApiOrigin(context.url) &&
    Boolean(localStorage.getItem(PMAPI_TOKEN_STORAGE_KEY)?.trim()),
  async extract() {
    const token = localStorage.getItem(PMAPI_TOKEN_STORAGE_KEY)?.trim()
    if (!token) return null
    let body: unknown
    try {
      const response = await fetch(
        new URL(PMAPI_ENDPOINTS.Identity, location.origin),
        {
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (response.status >= 500 || response.status === 429)
        throw new Error("PM-API session probe unavailable")
      if (!response.ok) return null
      body = await response.json()
    } catch (error) {
      if (error instanceof ContentSessionProtocolError) throw error
      // A transport/body failure does not establish that another protocol owns
      // the page, and must not be hidden by a cached generic user fallback.
      throw new Error("PM-API session probe request failed")
    }
    if (!isRecord(body) || body.success !== true) return null
    let user
    try {
      user = parsePmApiIdentity(body)
    } catch {
      return null
    }
    // A website account switch may have replaced the storage key mid-flight;
    // only extract the identity the verified token still belongs to.
    if (localStorage.getItem(PMAPI_TOKEN_STORAGE_KEY)?.trim() !== token)
      return null
    return {
      userId: String(user.id),
      user: { id: String(user.id), username: user.username },
      accessToken: token,
      siteTypeHint: SITE_TYPES.PMAPI,
    }
  },
}
