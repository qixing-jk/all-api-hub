import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { resolveAccountSiteDefaultAuthType } from "~/services/accounts/accountSiteProfile"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configCodec"
import {
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import { AuthTypeEnum } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("login check-in configuration", () => {
  it("keeps access-token defaults for the Agent Router URL", () => {
    expect(
      resolveAccountSiteDefaultAuthType({
        url: "https://agentrouter.org",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toBe(AuthTypeEnum.AccessToken)
  })
  it("saves only a valid login provider and preserves it across status refresh", () => {
    const base = buildSiteAccount().checkIn
    const draft = normalizeCheckInConfigV7({
      ...base,
      loginCheckIn: { provider: "linuxdo", cookie: "must-not-persist" },
    })
    expect(draft.loginCheckIn).toEqual({ provider: "linuxdo" })
    const latest = mergeUserOwnedCheckInDraft({ latest: base, draft })
    expect(latest.loginCheckIn).toEqual({ provider: "linuxdo" })
    expect(
      mergeRefreshedCheckInStatus({ latest, refreshed: base }).loginCheckIn,
    ).toEqual({ provider: "linuxdo" })
    expect(
      normalizeCheckInConfigV7({
        ...base,
        loginCheckIn: { provider: "untrusted" },
      }),
    ).not.toHaveProperty("loginCheckIn")
  })
})
