import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveNewApiStoredUserHint,
  vApiStoredUserHint,
} from "~/services/accountBrowserSession/newApiStoredUserHint"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/identity/accountIdentity"

import type { ContentSessionExtractor } from "../contracts"

export const vApiContentSessionExtractor: ContentSessionExtractor = {
  id: "v-api",
  canExtract: (context) =>
    resolveNewApiStoredUserHint(context.siteTypeHint).kind ===
      vApiStoredUserHint.kind && vApiStoredUserHint.isPresent(),
  async extract(context) {
    const siteType = context.siteTypeHint ?? SITE_TYPES.V_API
    const identity = resolveStoredAccountUserIdentity(
      vApiStoredUserHint.read(),
      siteType,
    )
    if (!identity) return null

    return {
      ...identity,
      siteTypeHint: siteType,
    }
  },
}
