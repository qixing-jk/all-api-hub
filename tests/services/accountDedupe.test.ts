import { describe, expect, it } from "vitest"

import { scanDuplicateAccounts } from "~/services/accounts/accountDedupe"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("scanDuplicateAccounts", () => {
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
      origin: "https://api.example.com",
      userId: 1,
    })
    expect(result.groups[0].accounts.map((a) => a.id).sort()).toEqual([
      "acc-1",
      "acc-2",
    ])
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
      origin: "https://api.example.com",
      userId: 1,
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

  it("skips accounts with unsafe upstream user ids as unscannable", () => {
    const unsafeA = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: "9007199254740992" } as any,
    })
    const unsafeB = buildSiteAccount({
      id: "acc-2",
      site_url: "https://api.example.com",
      account_info: { id: "9007199254740993" } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [unsafeA, unsafeB],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(0)
    expect(result.unscannable.map((a) => a.id).sort()).toEqual([
      "acc-1",
      "acc-2",
    ])
  })

  it("skips accounts with invalid URLs as unscannable", () => {
    const ok = buildSiteAccount({
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      account_info: { id: 1 } as any,
    })
    const bad = buildSiteAccount({
      id: "acc-2",
      site_url: "not a url",
      account_info: { id: 1 } as any,
    })

    const result = scanDuplicateAccounts({
      accounts: [ok, bad],
      pinnedAccountIds: [],
      strategy: "keepPinned",
    })

    expect(result.groups).toHaveLength(0)
    expect(result.unscannable.map((a) => a.id)).toEqual(["acc-2"])
  })
})
