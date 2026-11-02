import { readIdentityCookie } from "~/services/accountBrowserSession/localIdentityState"
import {
  AIMLAPI_CONSOLE_ENDPOINTS,
  AIMLAPI_CONSOLE_ORIGIN,
  AIMLAPI_WEB_ORIGIN,
  isCanonicalAimlApiUrl,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { isRecord } from "~/utils/core/object"

import {
  AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND,
  ContentSessionProtocolError,
  type ContentSessionExtractor,
} from "../contracts"

/** Only identity and completion-scoped auth leave the page; console JWTs are never saved. */
export const aimlApiContentSessionExtractor: ContentSessionExtractor = {
  id: SITE_TYPES.AIMLAPI,
  canExtract: ({ url, siteTypeHint }) =>
    siteTypeHint === SITE_TYPES.AIMLAPI && !!url && isCanonicalAimlApiUrl(url),
  async extract() {
    const unavailable = () =>
      new ContentSessionProtocolError("AI/ML API console session unavailable")
    if (location.origin !== AIMLAPI_WEB_ORIGIN) throw unavailable()
    const cookie = readIdentityCookie("playground.token")
    let token: string
    try {
      const parsed = JSON.parse(cookie || "{}")
      token = parsed.key
      if (typeof token !== "string" || !token) throw unavailable()
    } catch {
      throw unavailable()
    }
    const r = await fetch(
      `${AIMLAPI_CONSOLE_ORIGIN}${AIMLAPI_CONSOLE_ENDPOINTS.Identity}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!r.ok) throw unavailable()
    const user: unknown = await r.json()
    if (
      !isRecord(user) ||
      typeof user.id !== "string" ||
      !user.id ||
      typeof user.email !== "string" ||
      !user.email ||
      readIdentityCookie("playground.token") !== cookie
    )
      throw unavailable()
    return {
      userId: user.id,
      user: { id: user.id, username: user.email },
      siteTypeHint: SITE_TYPES.AIMLAPI,
      transientAuth: {
        kind: AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND,
        origin: AIMLAPI_WEB_ORIGIN,
        token,
        userId: user.id,
      },
    }
  },
}
