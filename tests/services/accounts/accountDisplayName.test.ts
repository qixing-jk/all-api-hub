import { describe, expect, it } from "vitest"

import {
  ACCOUNT_DISPLAY_NAME_SEPARATOR,
  buildAccountDisplayNameMap,
  collectDuplicateAccountNameKeys,
  compareAccountDisplayNames,
  formatDisambiguatedAccountDisplayName,
  normalizeAccountDisplayNamePart,
  resolveAccountDisplayName,
} from "~/services/accounts/utils/accountDisplayName"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("accountDisplayName helpers", () => {
  it("detects duplicate keys globally with case, whitespace, and full-width normalization", () => {
    const accounts = [
      buildSiteAccount({ id: "a", site_name: "My Site" }),
      buildSiteAccount({ id: "b", site_name: " my   site " }),
      buildSiteAccount({ id: "c", site_name: "Ｍｙ　Ｓｉｔｅ" }),
      buildSiteAccount({ id: "d", site_name: "Other Site" }),
    ]

    const duplicateKeys = collectDuplicateAccountNameKeys(accounts)

    expect(duplicateKeys).toEqual(
      new Set([normalizeAccountDisplayNamePart("My Site")]),
    )
  })

  it("formats the shared display separator once", () => {
    expect(formatDisambiguatedAccountDisplayName("My Site", "alice")).toBe(
      `My Site${ACCOUNT_DISPLAY_NAME_SEPARATOR}alice`,
    )
  })

  it("disambiguates only duplicate names that have a username", () => {
    const duplicateKeys = new Set([normalizeAccountDisplayNamePart("My Site")])

    expect(
      resolveAccountDisplayName({
        baseName: "My Site",
        username: "alice",
        duplicateKeys,
      }),
    ).toBe("My Site · alice")
    expect(
      resolveAccountDisplayName({
        baseName: "My Site",
        username: "",
        duplicateKeys,
      }),
    ).toBe("My Site")
    expect(
      resolveAccountDisplayName({
        baseName: "Unique Site",
        username: "alice",
        duplicateKeys,
      }),
    ).toBe("Unique Site")
  })

  it("builds a global account-id display-name map", () => {
    const accounts = [
      buildSiteAccount({
        id: "a",
        site_name: "Shared",
        account_info: {
          id: 1,
          access_token: "token-a",
          username: "alice",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
      buildSiteAccount({
        id: "b",
        site_name: "shared",
        account_info: {
          id: 2,
          access_token: "token-b",
          username: "bob",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
      buildSiteAccount({
        id: "c",
        site_name: "Unique",
        account_info: {
          id: 3,
          access_token: "token-c",
          username: "carol",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
    ]

    const displayNameById = buildAccountDisplayNameMap(accounts)

    expect(displayNameById.get("a")).toBe("Shared · alice")
    expect(displayNameById.get("b")).toBe("shared · bob")
    expect(displayNameById.get("c")).toBe("Unique")
  })

  it("sorts by normalized base name and normalized username before raw label/id", () => {
    const alice = {
      id: "a",
      name: "Ｍｙ　Ｓｉｔｅ · Alice",
      baseName: "Ｍｙ　Ｓｉｔｅ",
      username: "Alice",
    }
    const bob = {
      id: "b",
      name: "my   site · bob",
      baseName: "my   site",
      username: "bob",
    }

    expect(compareAccountDisplayNames(alice, bob)).toBeLessThan(0)
    expect(compareAccountDisplayNames(bob, alice)).toBeGreaterThan(0)
  })
})
