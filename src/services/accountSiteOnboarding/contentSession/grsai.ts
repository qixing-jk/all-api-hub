import { SITE_TYPES } from "~/constants/siteType"
import { GRSAI_HOSTNAMES } from "~/services/accountSiteDefinitions/identifiers"
import {
  GRSAI_CONSOLE_API_ORIGIN,
  GRSAI_ENDPOINTS,
} from "~/services/apiService/grsai/constants"
import { isGrsaiUserInfo } from "~/services/apiService/grsai/parsing"

import type { ContentSessionExtractor } from "../contracts"

/**
 * Storage key the Grsai console keeps its session token under.
 *
 * The console replaces it with the token `getConfig` returns on every page
 * load, and that same token is the `authorization` value every console call
 * takes, so reading it is the only way into the account.
 */
const GRSAI_TOKEN_STORAGE_KEY = "Token"

const getString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/** Reads the console's own session token without generating or renewing one. */
function readGrsaiBrowserToken(): string | null {
  return getString(localStorage.getItem(GRSAI_TOKEN_STORAGE_KEY)) || null
}

const toConsoleOrigin = (url?: string): string | null => {
  if (!url) return null

  try {
    const { hostname } = new URL(url)
    return GRSAI_HOSTNAMES.some((allowed) => allowed === hostname.toLowerCase())
      ? GRSAI_CONSOLE_API_ORIGIN
      : null
  } catch {
    return null
  }
}

/**
 * Reads Grsai's logged-in console session.
 *
 * The stored token is an opaque session token, so the account identity has to
 * come from the console itself: `/client/grsai/getUserInfo` is the same call
 * the console makes, and it answers with the account id and sign-in email.
 */
export const grsaiContentSessionExtractor: ContentSessionExtractor = {
  id: "grsai",
  canExtract: (context) =>
    toConsoleOrigin(context?.url) !== null && readGrsaiBrowserToken() !== null,
  async extract(context) {
    const origin = toConsoleOrigin(context?.url)
    const accessToken = readGrsaiBrowserToken()
    if (!origin || !accessToken) return null

    try {
      const response = await fetch(`${origin}${GRSAI_ENDPOINTS.userInfo}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          // Grsai takes the raw session token, not `Bearer <token>`.
          Authorization: accessToken,
        },
        body: JSON.stringify({}),
      })
      if (!response.ok) return null

      const envelope = (await response.json()) as {
        code?: unknown
        data?: unknown
      }
      if (envelope.code !== 0 || !isGrsaiUserInfo(envelope.data)) return null

      return {
        userId: envelope.data.id,
        // The console identifies an account by its sign-in email and shows no
        // separate display name, so the email is the account's username.
        user: { id: envelope.data.id, username: envelope.data.mail ?? "" },
        accessToken,
        siteTypeHint: SITE_TYPES.GRSAI,
      }
    } catch {
      return null
    }
  },
}
