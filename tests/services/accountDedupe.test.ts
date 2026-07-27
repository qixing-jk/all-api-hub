import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  findExactCredentialDuplicateAccountId,
  scanDuplicateAccounts,
} from "~/services/accounts/accountDedupe"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("scanDuplicateAccounts", () => {
  it("groups exact OpenRouter credentials and returns the original records", () => {
    const accountA = buildSiteAccount({
      id: "or-a",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://openrouter.ai",
      account_info: {
        id: "openrouter:or-a",
        access_token: "same-management-key",
      } as any,
    })
    const accountB = buildSiteAccount({
      id: "or-b",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://openrouter.ai/settings",
      account_info: {
        id: "openrouter:or-b",
        access_token: "same-management-key",
      } as any,
    })
    const accountC = buildSiteAccount({
      id: "or-c",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://openrouter.ai",
      account_info: {
        id: "openrouter:or-c",
        access_token: "different-management-key",
      } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [accountA, accountB, accountC],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({
      key: {
        origin: "https://openrouter.ai",
        siteType: SITE_TYPES.OPENROUTER,
        reason: "same_credential",
      },
      accounts: [accountA, accountB],
    })
    expect(result.groups[0].accounts[0]).toBe(accountA)
    expect(result.groups[0].accounts[1]).toBe(accountB)
    expect(result.groups[0].key.id).toBe('["or-a","or-b"]')
    expect(JSON.stringify(result.groups[0].key)).not.toContain(
      "same-management-key",
    )
  })

  it("normalizes stored OpenRouter credential whitespace before grouping", () => {
    const accountA = buildSiteAccount({
      id: "or-a",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://openrouter.ai",
      account_info: {
        id: "same-editable-user",
        access_token: "management-key",
      } as any,
    })
    const accountB = buildSiteAccount({
      id: "or-b",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://openrouter.ai/settings",
      account_info: {
        id: "same-editable-user",
        access_token: " management-key ",
      } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [accountA, accountB],
      strategy: "keepMostRecentlyUpdated",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].accounts).toEqual([accountA, accountB])
    expect(result.unscannable).toEqual([])
  })

  it("uses exact credential equality as the only OpenRouter grouping signal", () => {
    const accountA = buildSiteAccount({
      id: "or-a",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://first.example.invalid",
      account_info: {
        id: "editable-user-a",
        access_token: "same-management-key",
      } as any,
    })
    const accountB = buildSiteAccount({
      id: "or-b",
      site_type: SITE_TYPES.OPENROUTER,
      site_url: "https://second.example.invalid",
      account_info: {
        id: "editable-user-b",
        access_token: "same-management-key",
      } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [accountA, accountB],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].accounts).toEqual([accountA, accountB])
    expect(JSON.stringify(result.groups[0].key)).not.toContain(
      "same-management-key",
    )
  })

  it("assigns distinct secret-free ids to separate exact credential groups", () => {
    const accounts = [
      buildSiteAccount({
        id: "or-a1",
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          id: "upstream-a",
          access_token: "management-key-a",
        } as any,
      }),
      buildSiteAccount({
        id: "or-a2",
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          id: "upstream-a-2",
          access_token: "management-key-a",
        } as any,
      }),
      buildSiteAccount({
        id: "or-b1",
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          id: "upstream-b",
          access_token: "management-key-b",
        } as any,
      }),
      buildSiteAccount({
        id: "or-b2",
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          id: "upstream-b-2",
          access_token: "management-key-b",
        } as any,
      }),
    ]

    const result = scanDuplicateAccounts({
      accounts,
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].key.id).toBeTruthy()
    expect(result.groups[1].key.id).toBeTruthy()
    expect(result.groups[0].key.id).not.toBe(result.groups[1].key.id)
    expect(
      JSON.stringify(result.groups.map((group) => group.key)),
    ).not.toContain("management-key")
  })

  it.each<[string | undefined, string | undefined]>([
    [undefined, undefined],
    ["", ""],
    [" ", "\t"],
    ["management-key-a", "management-key-b"],
  ])(
    "does not fall back to editable user ID for OpenRouter keys %s and %s",
    (left, right) => {
      const accountA = buildSiteAccount({
        id: "or-a",
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai",
        account_info: {
          id: "same-editable-user",
          access_token: left,
        } as any,
      })
      const accountB = buildSiteAccount({
        id: "or-b",
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://openrouter.ai/settings",
        account_info: {
          id: "same-editable-user",
          access_token: right,
        } as any,
      })

      const result = scanDuplicateAccounts({
        accounts: [accountA, accountB],
        strategy: "keepMostRecentlyUpdated",
      })

      expect(result.groups).toHaveLength(0)
      expect(result.unscannable).toEqual(
        left?.trim() || right?.trim() ? [] : [accountA, accountB],
      )
    },
  )
  it("groups duplicates by origin + upstream user id", () => {
    const a1 = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com/panel",
      account_info: { id: 1 } as any,
    })
    const a2 = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com/v1",
      account_info: { id: "1" } as any,
    })
    const a3 = buildSiteAccount({
      id: "acc-3",
      site_url: "https://api.example.com",
      account_info: { id: 2 } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [a1, a2, a3],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toEqual({
      id: '["acc-1","acc-2"]',
      origin: "https://api.example.com",
      reason: "same_origin_user",
      userId: "1",
    })
    expect(result.groups[0].accounts).toEqual([a1, a2])
  })

  it("groups ordinary historical records by origin and user id across site types", () => {
    const historical = buildSiteAccount({
      id: "acc-historical",
      site_type: SITE_TYPES.UNKNOWN,
      site_url: "https://api.example.com",
      account_info: { id: "same-user" } as any,
    })
    const detected = buildSiteAccount({
      id: "acc-detected",
      site_type: SITE_TYPES.NEW_API,
      site_url: "https://api.example.com",
      account_info: { id: "same-user" } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [historical, detected],
      strategy: "keepPinned",
    })
    const reversedResult = scanDuplicateAccounts({
      accounts: [detected, historical],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toEqual({
      id: '["acc-detected","acc-historical"]',
      origin: "https://api.example.com",
      reason: "same_origin_user",
      userId: "same-user",
    })
    expect(reversedResult.groups[0].key).toEqual(result.groups[0].key)
    expect(result.groups[0].accounts).toEqual([historical, detected])
    expect(reversedResult.groups[0].accounts).toEqual([detected, historical])
  })

  it("excludes the current record when finding an exact credential duplicate", () => {
    const current = buildSiteAccount({
      id: "current",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: { access_token: "same-key" } as any,
    })
    const duplicate = buildSiteAccount({
      id: "duplicate",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: { access_token: "same-key" } as any,
    })

    expect(
      findExactCredentialDuplicateAccountId({
        accounts: [current, duplicate],
        siteType: SITE_TYPES.OPENROUTER,
        accessToken: "same-key",
        excludeAccountId: "current",
      }),
    ).toBe("duplicate")
  })

  it("requires exact credential equality when finding a duplicate", () => {
    const account = buildSiteAccount({
      id: "existing",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: { access_token: "different-management-key" } as any,
    })

    expect(
      findExactCredentialDuplicateAccountId({
        accounts: [account],
        siteType: SITE_TYPES.OPENROUTER,
        accessToken: "management-key",
      }),
    ).toBeUndefined()
  })

  it("normalizes stored credential whitespace before finding a duplicate", () => {
    const account = buildSiteAccount({
      id: "existing",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: { access_token: " management-key " } as any,
    })

    expect(
      findExactCredentialDuplicateAccountId({
        accounts: [account],
        siteType: SITE_TYPES.OPENROUTER,
        accessToken: "management-key",
      }),
    ).toBe("existing")
  })

  it("normalizes a draft credential before matching canonical storage", () => {
    const account = buildSiteAccount({
      id: "existing",
      site_type: SITE_TYPES.OPENROUTER,
      account_info: { access_token: "management-key" } as any,
    })

    expect(
      findExactCredentialDuplicateAccountId({
        accounts: [account],
        siteType: SITE_TYPES.OPENROUTER,
        accessToken: " management-key ",
      }),
    ).toBe("existing")
  })

  it("returns the lowest account id when several exact credential duplicates exist", () => {
    const accounts = ["duplicate-z", "duplicate-a"].map((id) =>
      buildSiteAccount({
        id,
        site_type: SITE_TYPES.OPENROUTER,
        site_url: "https://provider.example.invalid",
        account_info: { access_token: "same-management-key" } as any,
      }),
    )

    expect(
      findExactCredentialDuplicateAccountId({
        accounts,
        siteType: SITE_TYPES.OPENROUTER,
        accessToken: "same-management-key",
      }),
    ).toBe("duplicate-a")
  })

  it("treats scheme-less site URLs as scannable origins", () => {
    const a1 = buildSiteAccount({
      id: "acc-1",
      site_url: "api.example.com/panel",
      account_info: { id: 1 } as any,
    })
    const a2 = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com/v1",
      account_info: { id: 1 } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [a1, a2],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toEqual({
      id: '["acc-1","acc-2"]',
      origin: "https://api.example.com",
      reason: "same_origin_user",
      userId: "1",
    })
  })

  it("groups AIHubMix accounts across main and console hostnames", () => {
    const main = buildSiteAccount({
      id: "acc-1",
      site_url: "https://aihubmix.com",
      site_type: SITE_TYPES.AIHUBMIX,
      account_info: { id: 1 } as any,
    })
    const console = buildSiteAccount({
      id: "acc-2",
      site_url: "https://console.aihubmix.com/statistics?tab=detail",
      site_type: SITE_TYPES.AIHUBMIX,
      account_info: { id: 1 } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [main, console],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toEqual({
      id: '["acc-1","acc-2"]',
      origin: "https://console.aihubmix.com",
      reason: "same_origin_user",
      userId: "1",
    })
  })

  it("picks the pinned account when strategy is keepPinned", () => {
    const older = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 1,
      created_at: 1,
    })
    const pinned = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 2,
      created_at: 2,
    })

    const result = scanDuplicateAccounts({
      accounts: [older, pinned],
      pinnedAccountIds: ["acc-2"],
      strategy: "keepPinned",
    })

    expect(result.groups[0].keepAccountId).toBe("acc-2")
    expect(result.groups[0].deleteAccountIds).toEqual(["acc-1"])
  })

  it("picks an enabled account when strategy is keepEnabled (even if a disabled one is pinned)", () => {
    const enabled = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      disabled: false,
      updated_at: 1,
      created_at: 1,
    })
    const disabledPinned = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      disabled: true,
      updated_at: 2,
      created_at: 2,
    })

    const result = scanDuplicateAccounts({
      accounts: [enabled, disabledPinned],
      pinnedAccountIds: ["acc-2"],
      strategy: "keepEnabled",
    })

    expect(result.groups[0].keepAccountId).toBe("acc-1")
  })

  it("picks the most recently updated account when strategy is keepMostRecentlyUpdated", () => {
    const older = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })
    const newer = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 20,
      created_at: 20,
    })

    const result = scanDuplicateAccounts({
      accounts: [older, newer],
      pinnedAccountIds: [],
      strategy: "keepMostRecentlyUpdated",
    })

    expect(result.groups[0].keepAccountId).toBe("acc-2")
  })

  it("uses created_at then id as deterministic tie-breakers", () => {
    const olderCreated = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })
    const newerCreated = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 20,
    })

    const createdAtResult = scanDuplicateAccounts({
      accounts: [olderCreated, newerCreated],
      pinnedAccountIds: [],
      strategy: "keepMostRecentlyUpdated",
    })

    expect(createdAtResult.groups[0].keepAccountId).toBe("acc-2")

    const idTieA = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })
    const idTieB = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })

    const idResult = scanDuplicateAccounts({
      accounts: [idTieB, idTieA],
      pinnedAccountIds: [],
      strategy: "keepMostRecentlyUpdated",
    })

    expect(idResult.groups[0].keepAccountId).toBe("acc-1")
  })

  it("treats large numeric-looking strings as ordinary upstream user ids", () => {
    const accountA = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: "9007199254740992" } as any,
    })
    const accountB = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: "9007199254740993" } as any,
    })
    const duplicateA = buildSiteAccount({
      id: "acc-3",
      site_url: "https://api.example.com",
      account_info: { id: "9007199254740992" } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [accountA, accountB, duplicateA],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toEqual({
      id: '["acc-1","acc-3"]',
      origin: "https://api.example.com",
      reason: "same_origin_user",
      userId: "9007199254740992",
    })
    expect(result.groups[0].accounts).toEqual([accountA, duplicateA])
    expect(result.unscannable).toEqual([])
  })

  it("orders same-origin user duplicate groups by their normalized user id", () => {
    const accounts = [
      ["user-b-1", "user-b"],
      ["user-b-2", "user-b"],
      ["user-a-1", "user-a"],
      ["user-a-2", "user-a"],
    ].map(([id, userId]) =>
      buildSiteAccount({
        id,
        site_url: "https://provider.example.invalid",
        account_info: { id: userId } as any,
      }),
    )

    const result = scanDuplicateAccounts({
      accounts,
      strategy: "keepPinned",
    })

    expect(result.groups.map((group) => group.key)).toMatchObject([
      { reason: "same_origin_user", userId: "user-a" },
      { reason: "same_origin_user", userId: "user-b" },
    ])
  })

  it("marks accounts without a credential or usable user id as unscannable", () => {
    const missingIdentity = buildSiteAccount({
      id: "missing-identity",
      site_url: "https://provider.example.invalid",
      account_info: { id: "   " } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [missingIdentity],
      strategy: "keepPinned",
    })

    expect(result.groups).toEqual([])
    expect(result.unscannable).toEqual([missingIdentity])
  })

  it("skips accounts with invalid URLs as unscannable", () => {
    const ok = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      account_info: { id: "1" } as any,
    })
    const bad = buildSiteAccount({
      id: "acc-2",
      site_url: "not a url",
      account_info: { id: "1" } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [ok, bad],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(0)
    expect(result.unscannable).toEqual([bad])
    expect(result.unscannable[0]).toBe(bad)
  })
})
