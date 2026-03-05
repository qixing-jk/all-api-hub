import { describe, expect, it } from "vitest"

import { scanDuplicateAccounts } from "~/services/accounts/accountDedupe"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

const createAccount = (overrides: Partial<SiteAccount> = {}): SiteAccount => {
  const numericId = overrides.id?.replace(/\D/g, "") || "1"

  return {
    id: overrides.id || "account-1",
    site_name: overrides.site_name || "Test Site",
    site_url: overrides.site_url || "https://test.example.com",
    health: overrides.health || { status: SiteHealthStatus.Healthy },
    site_type: overrides.site_type || "test",
    exchange_rate: overrides.exchange_rate ?? 7.2,
    account_info: {
      id: overrides.account_info?.id ?? Number(numericId),
      access_token: overrides.account_info?.access_token || "token",
      username: overrides.account_info?.username || "tester",
      quota: overrides.account_info?.quota ?? 1_000_000,
      today_prompt_tokens: overrides.account_info?.today_prompt_tokens ?? 0,
      today_completion_tokens:
        overrides.account_info?.today_completion_tokens ?? 0,
      today_quota_consumption:
        overrides.account_info?.today_quota_consumption ?? 0,
      today_requests_count: overrides.account_info?.today_requests_count ?? 0,
      today_income: overrides.account_info?.today_income ?? 0,
    },
    last_sync_time: overrides.last_sync_time ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
    created_at: overrides.created_at ?? Date.now(),
    notes: overrides.notes,
    tagIds: overrides.tagIds ?? [],
    disabled: overrides.disabled,
    authType: overrides.authType ?? AuthTypeEnum.AccessToken,
    checkIn: overrides.checkIn || {
      enableDetection: false,
      autoCheckInEnabled: false,
      siteStatus: { isCheckedInToday: false },
    },
  }
}

describe("scanDuplicateAccounts", () => {
  it("groups duplicates by origin + upstream user id", () => {
    const a1 = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com/panel",
      account_info: { id: 1 } as any,
    })
    const a2 = createAccount({
      id: "acc-2",
      site_url: "https://api.example.com/v1",
      account_info: { id: "1" } as any,
    })
    const a3 = createAccount({
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

  it("picks the pinned account when strategy is keepPinned", () => {
    const older = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 1,
      created_at: 1,
    })
    const pinned = createAccount({
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
    const enabled = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      disabled: false,
      updated_at: 1,
      created_at: 1,
    })
    const disabledPinned = createAccount({
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
    const older = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })
    const newer = createAccount({
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
    const olderCreated = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })
    const newerCreated = createAccount({
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

    const idTieA = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com",
      account_info: { id: 1 } as any,
      updated_at: 10,
      created_at: 10,
    })
    const idTieB = createAccount({
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

  it("skips accounts with invalid URLs as unscannable", () => {
    const ok = createAccount({
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      account_info: { id: 1 } as any,
    })
    const bad = createAccount({
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
