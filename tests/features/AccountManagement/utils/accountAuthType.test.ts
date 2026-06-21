import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  normalizeAccountAuthTypeOrDefault,
  normalizeOptionalAccountAuthType,
  resolveDefaultAccountAuthType,
} from "~/features/AccountManagement/utils/accountAuthType"
import { AuthTypeEnum } from "~/types"

describe("account auth type utilities", () => {
  it("resolves AnyRouter account defaults from its known domain before site type is known", () => {
    expect(
      resolveDefaultAccountAuthType({ siteUrl: "https://anyrouter.top" }),
    ).toBe(AuthTypeEnum.Cookie)
  })

  it("keeps the existing optional auth normalization behavior", () => {
    expect(normalizeOptionalAccountAuthType("")).toBeUndefined()
    expect(normalizeOptionalAccountAuthType(AuthTypeEnum.Cookie)).toBe(
      AuthTypeEnum.Cookie,
    )
    expect(normalizeOptionalAccountAuthType("bad-auth")).toBe(false)
  })

  it("keeps the existing explicit-or-default normalization behavior", () => {
    expect(normalizeAccountAuthTypeOrDefault(AuthTypeEnum.Cookie)).toBe(
      AuthTypeEnum.Cookie,
    )
    expect(normalizeAccountAuthTypeOrDefault("bad-auth")).toBe(
      AuthTypeEnum.AccessToken,
    )
  })

  it("resolves unknown and unsupported URL defaults to access-token auth", () => {
    expect(resolveDefaultAccountAuthType()).toBe(AuthTypeEnum.AccessToken)
    expect(
      resolveDefaultAccountAuthType({
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://example.invalid",
      }),
    ).toBe(AuthTypeEnum.AccessToken)
    expect(
      resolveDefaultAccountAuthType({ siteUrl: "https://example.com" }),
    ).toBe(AuthTypeEnum.AccessToken)
    expect(
      resolveDefaultAccountAuthType({
        siteUrl: "https://www.anyrouter.top/console",
      }),
    ).toBe(AuthTypeEnum.AccessToken)
    expect(resolveDefaultAccountAuthType({ siteUrl: "not a url" })).toBe(
      AuthTypeEnum.AccessToken,
    )
  })
})
