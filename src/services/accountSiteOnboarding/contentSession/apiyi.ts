import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityStorageRecord } from "~/services/accountBrowserSession/localIdentityState"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"
import { isRecord } from "~/utils/core/object"

import type { ContentSessionExtractor } from "../contracts"

// https://api.apiyi.com/ (v29.8.9) stores its dashboard user in USER_STATE.user.
// Forward identity only; its X-S-Token is unnecessary for the cookie API reads.
const APIYI_USER_STATE_KEY = "USER_STATE"

/** Shares APIyi's dashboard identity hint with passive browser verification. */
export function readApiyiStoredUser() {
  const user = readIdentityStorageRecord(APIYI_USER_STATE_KEY)?.user
  return isRecord(user) ? user : null
}

export const apiyiContentSessionExtractor: ContentSessionExtractor = {
  id: "apiyi",
  canExtract: (context) =>
    context.siteTypeHint === SITE_TYPES.APIYI &&
    localStorage.getItem(APIYI_USER_STATE_KEY) !== null,
  async extract() {
    const user = readApiyiStoredUser()
    if (!user) return null

    const identity = resolveStoredAccountUserIdentity(
      {
        id: user.id,
        ...(typeof user.username === "string"
          ? { username: user.username }
          : {}),
      },
      SITE_TYPES.APIYI,
    )
    if (!identity) return null

    return { ...identity, siteTypeHint: SITE_TYPES.APIYI }
  },
}
