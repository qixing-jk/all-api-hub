import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityStorageRecord } from "~/services/accountBrowserSession/localIdentityState"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"
import { isRecord } from "~/utils/core/object"

import type { ContentSessionExtractor } from "../contracts"

// The current V-API dashboard at https://gpt.ge stores its user in this
// Zustand envelope; older deployments continue through the generic `user` key.
const V_API_USER_STORE_STORAGE_KEY = "user-storage"

/** Reads the current dashboard store without falling back to an older user object. */
export function readVApiStoredUser() {
  const state = readIdentityStorageRecord(V_API_USER_STORE_STORAGE_KEY)?.state
  return isRecord(state) && isRecord(state.user) ? state.user : null
}

export const vApiContentSessionExtractor: ContentSessionExtractor = {
  id: "v-api",
  canExtract: (context) =>
    context.siteTypeHint === SITE_TYPES.V_API &&
    localStorage.getItem(V_API_USER_STORE_STORAGE_KEY) !== null,
  async extract() {
    const identity = resolveStoredAccountUserIdentity(
      readVApiStoredUser(),
      SITE_TYPES.V_API,
    )
    if (!identity) return null

    return {
      ...identity,
      siteTypeHint: SITE_TYPES.V_API,
    }
  },
}
