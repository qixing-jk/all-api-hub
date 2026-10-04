import { describe, expect, it } from "vitest"

import {
  DEFAULT_AUTO_PROVISION_KEY_NAME,
  getDefaultAccountKeyName,
  isAutomaticAccountKeyName,
} from "~/services/accounts/accountKeyNames"

describe("automatic account key names", () => {
  it("uses a default key name without group terminology", () => {
    expect(DEFAULT_AUTO_PROVISION_KEY_NAME).toBe("default key (auto)")
  })
  it("preserves group naming", () => {
    expect(getDefaultAccountKeyName("vip")).toBe("vip group (auto)")
    expect(getDefaultAccountKeyName("default")).toBe("user group (auto)")
    expect(getDefaultAccountKeyName()).toBe("user group (auto)")
  })
  it.each(["default key (auto)", "user group (auto)", "vip group (auto)"])(
    "recognizes current and legacy names: %s",
    (name) => {
      expect(isAutomaticAccountKeyName(name)).toBe(true)
    },
  )
  it("preserves user names", () => {
    expect(isAutomaticAccountKeyName("My key")).toBe(false)
  })
})
