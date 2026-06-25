import { describe, expect, it } from "vitest"

import { buildDefaultTokenCreatePrefill } from "~/features/TokenProvisioning/components/AddTokenDialog/defaultTokenCreatePrefill"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"

describe("buildDefaultTokenCreatePrefill", () => {
  it("keeps the default token name when the default group is available", () => {
    expect(buildDefaultTokenCreatePrefill(["vip", "default"])).toEqual({
      modelId: "",
      defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      group: "default",
      allowedGroups: ["vip", "default"],
    })
  })

  it("uses the selected non-default group in the token name", () => {
    expect(buildDefaultTokenCreatePrefill(["vip", "paid"])).toEqual({
      modelId: "",
      defaultName: "vip group (auto)",
      group: "vip",
      allowedGroups: ["vip", "paid"],
    })
  })

  it("returns undefined without selectable groups", () => {
    expect(buildDefaultTokenCreatePrefill([])).toBeUndefined()
    expect(buildDefaultTokenCreatePrefill(undefined)).toBeUndefined()
  })
})
