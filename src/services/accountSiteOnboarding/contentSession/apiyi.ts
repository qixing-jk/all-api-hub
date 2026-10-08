import { SITE_TYPES } from "~/constants/siteType"
import {
  apiyiStoredUserHint,
  resolveNewApiStoredUserHint,
} from "~/services/accountBrowserSession/newApiStoredUserHint"
import { resolveStoredAccountUserIdentity } from "~/services/accounts/identity/accountIdentity"

import type { ContentSessionExtractor } from "../contracts"

export const apiyiContentSessionExtractor: ContentSessionExtractor = {
  id: "apiyi",
  canExtract: (context) =>
    resolveNewApiStoredUserHint(context.siteTypeHint).kind ===
      apiyiStoredUserHint.kind && apiyiStoredUserHint.isPresent(),
  async extract(context) {
    const user = apiyiStoredUserHint.read()
    if (!user) return null

    const identity = resolveStoredAccountUserIdentity(
      {
        id: user.id,
        ...(typeof user.username === "string"
          ? { username: user.username }
          : {}),
      },
      context.siteTypeHint ?? SITE_TYPES.APIYI,
    )
    if (!identity) return null

    return { ...identity, siteTypeHint: context.siteTypeHint }
  },
}
