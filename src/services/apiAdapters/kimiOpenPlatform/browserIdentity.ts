import { readJwtExpiry, readJwtSubject } from "~/services/kimiOpenPlatform/auth"
import { isKimiOpenPlatformSiteType } from "~/services/kimiOpenPlatform/deployments"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

const TOKEN_KEY = "token"

/** Confirms the open console tab still has the same signed-in user. */
export const kimiOpenPlatformBrowserIdentity: AccountBrowserIdentityCapability =
  {
    canObserve: ({ siteType }) => isKimiOpenPlatformSiteType(siteType),
    observe({ origin }) {
      const token = localStorage.getItem(TOKEN_KEY)?.trim() ?? ""
      if (!token) return null
      const expiresAt = readJwtExpiry(token)
      const userId = readJwtSubject(token)
      return {
        sessionKey: token,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        async verify(read) {
          if (expiresAt !== undefined && expiresAt <= Date.now()) return null
          const body = await read({
            url: `${origin}/api?endpoint=userInfo`,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          })
          const data = body?.data
          if (!data || typeof data !== "object" || Array.isArray(data))
            return null
          const uid = (data as { uid?: unknown }).uid
          return typeof uid === "string" &&
            uid.trim() &&
            (!userId || uid.trim() === userId)
            ? uid.trim()
            : null
        },
      }
    },
  }
