import { SITE_TYPES } from "~/constants/siteType"
import { NANOGPT_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { NANOGPT_ENDPOINTS } from "~/services/apiService/nanogpt/constants"
import { isRecord } from "~/utils/core/object"

import type { ContentSessionExtractor } from "../contracts"

/**
 * Reads the signed-in NanoGPT console session.
 *
 * The saved credential is an inference API key, so the only thing this pass
 * contributes is the account it belongs to: Auth.js reports the console user
 * (`/api/auth/session`) and the local session carries the account's Nano
 * deposit address, which is the same anchor `POST /api/check-balance` returns
 * for a key. Comparing the two proves a pasted key belongs to the signed-in
 * account (evidence/probe-01, probe-10).
 *
 * It never mints a key: `POST /api/create-api-key` requires an email step-up
 * challenge the extension cannot satisfy (evidence/probe-13/14).
 */
export const nanoGptContentSessionExtractor: ContentSessionExtractor = {
  id: SITE_TYPES.NANOGPT,
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.NANOGPT || !url) return false
    try {
      return new URL(url).origin === NANOGPT_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const [sessionResponse, localSessionResponse] = await Promise.all([
        fetch(`${NANOGPT_WEB_ORIGIN}${NANOGPT_ENDPOINTS.session}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`${NANOGPT_WEB_ORIGIN}${NANOGPT_ENDPOINTS.localSession}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ])
      if (!sessionResponse.ok || !localSessionResponse.ok) return null

      const session: unknown = await sessionResponse.json()
      const localSession: unknown = await localSessionResponse.json()

      const user = isRecord(session) ? session.user : undefined
      const local = isRecord(localSession) ? localSession.data : undefined
      if (!isRecord(user) || !isRecord(local)) return null
      if (
        user.clientSession !== undefined &&
        local.id !== undefined &&
        String(user.clientSession) !== String(local.id)
      )
        return null

      const consoleUserId =
        typeof user.id === "string" && user.id.trim() ? user.id.trim() : ""
      const depositAddress =
        typeof local.nanoDepositAddress === "string"
          ? local.nanoDepositAddress.trim()
          : ""
      if (!consoleUserId || !depositAddress) return null

      const name = typeof user.name === "string" ? user.name.trim() : ""
      const email = typeof user.email === "string" ? user.email.trim() : ""

      return {
        // Persisted identities must match what the saved key can prove, so the
        // deposit address is the account id and the console UUID stays a fact.
        userId: depositAddress,
        user: {
          id: consoleUserId,
          username: name || email,
          email,
          nanoDepositAddress: depositAddress,
        },
        siteTypeHint: SITE_TYPES.NANOGPT,
      }
    } catch {
      return null
    }
  },
}
