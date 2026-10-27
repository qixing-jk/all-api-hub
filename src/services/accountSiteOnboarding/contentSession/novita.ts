import { readIdentityCookie } from "~/services/accountBrowserSession/localIdentityState"
import {
  isCanonicalNovitaUrl,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  encodeNovitaConsoleCredential,
  NOVITA_CONSOLE_IDENTITY_URL,
} from "~/services/apiService/novita/constants"
import { parseNovitaUserInfo } from "~/services/apiService/novita/parsing"

import {
  ContentSessionProtocolError,
  type ContentSessionExtractor,
} from "../contracts"

/** Acquires a console bearer only after verifying its live account identity. */
export const novitaContentSessionExtractor: ContentSessionExtractor = {
  id: SITE_TYPES.NOVITA,
  canExtract: ({ url, siteTypeHint }) =>
    siteTypeHint === SITE_TYPES.NOVITA && !!url && isCanonicalNovitaUrl(url),
  async extract() {
    const unavailable = () =>
      new ContentSessionProtocolError("Novita console identity is unavailable")
    if (!isCanonicalNovitaUrl(location.href)) throw unavailable()
    const token = readIdentityCookie("token")
    if (!token) throw unavailable()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(NOVITA_CONSOLE_IDENTITY_URL, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (!response.ok) throw unavailable()
      const user = parseNovitaUserInfo(await response.json())
      if (
        !isCanonicalNovitaUrl(location.href) ||
        readIdentityCookie("token") !== token
      )
        throw unavailable()
      return {
        siteTypeHint: SITE_TYPES.NOVITA,
        userId: user.id,
        accessToken: encodeNovitaConsoleCredential(token),
        user: { id: user.id, username: user.username },
      }
    } catch {
      // A failed recognized protocol must not fall through to stale cached user
      // objects, and response/authentication details must not cross messaging.
      throw unavailable()
    } finally {
      clearTimeout(timeout)
    }
  },
}
