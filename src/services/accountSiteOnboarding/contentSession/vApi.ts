import { SITE_TYPES } from "~/constants/siteType"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/accountIdentity"
import { isRecord } from "~/utils/core/object"

import type { ContentSessionExtractor } from "../contracts"

// The current V-API dashboard at https://gpt.ge stores its user in this
// Zustand envelope; older deployments continue through the generic `user` key.
const V_API_USER_STORE_STORAGE_KEY = "user-storage"

export const vApiContentSessionExtractor: ContentSessionExtractor = {
  id: "v-api",
  canExtract: (context) =>
    context.siteTypeHint === SITE_TYPES.V_API &&
    localStorage.getItem(V_API_USER_STORE_STORAGE_KEY) !== null,
  async extract() {
    const rawUserStore = localStorage.getItem(V_API_USER_STORE_STORAGE_KEY)
    if (!rawUserStore) return null

    let userStore: unknown
    try {
      userStore = JSON.parse(rawUserStore)
    } catch {
      return null
    }

    const state = isRecord(userStore) ? userStore.state : null
    const identity = resolveStoredAccountUserIdentity(
      isRecord(state) ? state.user : null,
      SITE_TYPES.V_API,
    )
    if (!identity) return null

    return {
      ...identity,
      siteTypeHint: SITE_TYPES.V_API,
    }
  },
}
