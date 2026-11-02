import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AIMLAPI_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import {
  AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND,
  type ContentSessionTransientAuthContext,
} from "~/services/accountSiteOnboarding/contracts"
import { normalizeContentSessionTransientAuth } from "~/services/accountSiteOnboarding/transientAuth"

const auth = {
  kind: AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND,
  origin: AIMLAPI_WEB_ORIGIN,
  token: " console-token ",
  userId: "123",
}
const context: ContentSessionTransientAuthContext = {
  baseUrl: `${AIMLAPI_WEB_ORIGIN}/console`,
  siteType: SITE_TYPES.AIMLAPI,
}

describe("AIMLAPI transient authentication admission", () => {
  it("preserves accepted credential bytes and projects only the auth contract", () => {
    expect(
      normalizeContentSessionTransientAuth(
        { ...auth, extra: "discard" },
        context,
      ),
    ).toEqual(auth)
  })

  it("admits an unknown site only with the exact AIMLAPI hint and origin", () => {
    expect(
      normalizeContentSessionTransientAuth(auth, {
        ...context,
        siteType: SITE_TYPES.UNKNOWN,
        siteTypeHint: SITE_TYPES.AIMLAPI,
      }),
    ).toEqual(auth)
  })

  it.each([
    null,
    [],
    {},
    { ...auth, kind: "other" },
    { ...auth, token: " " },
    { ...auth, token: 123 },
    { ...auth, userId: "" },
    { ...auth, userId: 123 },
    { ...auth, origin: "https://app.aimlapi.com" },
    { ...auth, origin: `${AIMLAPI_WEB_ORIGIN}/` },
  ])("rejects invalid payload %#", (value) => {
    expect(normalizeContentSessionTransientAuth(value, context)).toBeUndefined()
  })

  it.each<Partial<ContentSessionTransientAuthContext>>([
    { baseUrl: "invalid" },
    { baseUrl: "http://aimlapi.com" },
    { baseUrl: "https://app.aimlapi.com" },
    { baseUrl: "https://aimlapi.com.evil.invalid" },
    { siteType: SITE_TYPES.NOVITA, siteTypeHint: SITE_TYPES.AIMLAPI },
    { siteType: SITE_TYPES.UNKNOWN },
    { siteType: SITE_TYPES.UNKNOWN, siteTypeHint: SITE_TYPES.NOVITA },
  ])("rejects a mismatched request context %#", (overrides) => {
    expect(
      normalizeContentSessionTransientAuth(auth, { ...context, ...overrides }),
    ).toBeUndefined()
  })
})
