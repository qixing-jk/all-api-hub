import { describe, expect, it, vi } from "vitest"

import {
  migrateAccountTagsData,
  needsAccountTagsDataMigration,
} from "~/services/tags/migrations/accountTagsDataMigration"
import {
  createDefaultTagStore,
  mergeTagStoresAndRemapAccounts,
  normalizeTagNameForUniqueness,
  sanitizeTagStore,
} from "~/services/tags/tagStoreUtils"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"

/**
 * Creates a minimal SiteAccount fixture for tag-related tests.
 * Defaults `tagIds` to an empty list when omitted.
 */
function makeAccount(overrides: Partial<SiteAccount>): SiteAccount {
  return {
    id: overrides.id ?? "account-1",
    site_name: overrides.site_name ?? "Site",
    site_url: overrides.site_url ?? "https://example.com",
    health: overrides.health ?? ({ status: "healthy" } as any),
    site_type: overrides.site_type ?? "test",
    exchange_rate: overrides.exchange_rate ?? 7,
    account_info:
      overrides.account_info ??
      ({
        id: 1,
        access_token: "token",
        username: "user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      } as any),
    last_sync_time: overrides.last_sync_time ?? 0,
    updated_at: overrides.updated_at ?? 0,
    created_at: overrides.created_at ?? 0,
    authType: overrides.authType ?? AuthTypeEnum.AccessToken,
    checkIn: overrides.checkIn ?? ({ enableDetection: false } as any),
    tagIds: overrides.tagIds ?? [],
    ...overrides,
  }
}

describe("tagStoreUtils.normalizeTagNameForUniqueness", () => {
  it("trims and collapses whitespace, compares case-insensitively", () => {
    const normalized = normalizeTagNameForUniqueness("  Work   Stuff  ")
    expect(normalized).not.toBeNull()
    expect(normalized?.displayName).toBe("Work Stuff")
    expect(normalized?.normalizedKey).toBe("work stuff")
  })

  it("returns null for empty/whitespace names", () => {
    expect(normalizeTagNameForUniqueness("   ")).toBeNull()
  })
})

describe("tagStoreUtils.sanitizeTagStore", () => {
  it("returns default store for non-object", () => {
    expect(sanitizeTagStore(null)).toEqual(createDefaultTagStore())
  })

  it("drops malformed tag entries and normalizes names", () => {
    const now = 123
    vi.spyOn(Date, "now").mockReturnValue(now)

    const store = sanitizeTagStore({
      version: 1,
      tagsById: {
        "": { id: "", name: "x" },
        good: { id: "good", name: "  Work  " },
        bad: { id: "bad", name: "   " },
      },
    })

    expect(Object.keys(store.tagsById)).toEqual(["good"])
    expect(store.tagsById.good.name).toBe("Work")
    vi.restoreAllMocks()
  })
})

describe("accountTagsDataMigration.migrateAccountTagsData", () => {
  it("creates global tags and replaces account.tags with account.tagIds", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.123456789)
      .mockReturnValueOnce(0.223456789)

    const accounts: SiteAccount[] = [
      makeAccount({ id: "a1", tags: [" Work ", "work", ""] as any }),
      makeAccount({ id: "a2", tags: ["Personal"] as any }),
    ]

    const result = migrateAccountTagsData({
      accounts,
      tagStore: createDefaultTagStore(),
    })

    expect(result.migratedAccountCount).toBe(2)
    expect(Object.values(result.tagStore.tagsById).map((t) => t.name)).toEqual(
      expect.arrayContaining(["Work", "Personal"]),
    )

    const migratedA1 = result.accounts.find((a) => a.id === "a1")!
    expect(migratedA1.tagIds).toHaveLength(1)
    expect((migratedA1 as any).tags).toBeUndefined()

    const migratedA2 = result.accounts.find((a) => a.id === "a2")!
    expect(migratedA2.tagIds).toHaveLength(1)
    expect((migratedA2 as any).tags).toBeUndefined()

    vi.restoreAllMocks()
  })

  it("is idempotent when account already has tagIds", () => {
    const existingStore = createDefaultTagStore()
    existingStore.tagsById["t1"] = {
      id: "t1",
      name: "Work",
      createdAt: 1,
      updatedAt: 1,
    }

    const accounts: SiteAccount[] = [
      makeAccount({ id: "a1", tagIds: ["t1"], tags: ["Work"] as any }),
    ]

    const result = migrateAccountTagsData({
      accounts,
      tagStore: existingStore,
    })

    expect(result.migratedAccountCount).toBe(0)
    expect(result.createdTagCount).toBe(0)
    expect(result.accounts[0].tagIds).toEqual(["t1"])
  })
})

describe("accountTagsDataMigration.needsAccountTagsDataMigration", () => {
  it("returns true when legacy string tags exist without tagIds", () => {
    const accounts: SiteAccount[] = [
      makeAccount({ id: "a1", tags: [" Work "] as any }),
      makeAccount({ id: "a2", tags: [""] as any }),
    ]
    expect(needsAccountTagsDataMigration(accounts)).toBe(true)
  })

  it("returns false when tagIds already exist", () => {
    const accounts: SiteAccount[] = [
      makeAccount({ id: "a1", tagIds: ["t1"], tags: ["Work"] as any }),
    ]
    expect(needsAccountTagsDataMigration(accounts)).toBe(false)
  })

  it("returns false when legacy tags are empty/whitespace", () => {
    const accounts: SiteAccount[] = [
      makeAccount({ id: "a1", tags: ["   ", ""] as any }),
    ]
    expect(needsAccountTagsDataMigration(accounts)).toBe(false)
  })
})

describe("tagStoreUtils.mergeTagStoresAndRemapAccounts", () => {
  it("prefers local ids when names collide and remaps remote account ids", () => {
    const localStore = createDefaultTagStore()
    localStore.tagsById.local = {
      id: "local",
      name: "Work",
      createdAt: 1,
      updatedAt: 2,
    }

    const remoteStore = createDefaultTagStore()
    remoteStore.tagsById.remote = {
      id: "remote",
      name: " work ",
      createdAt: 10,
      updatedAt: 20,
    }

    const localAccounts = [makeAccount({ id: "a1", tagIds: ["local"] })]
    const remoteAccounts = [makeAccount({ id: "a2", tagIds: ["remote"] })]

    const merged = mergeTagStoresAndRemapAccounts({
      localTagStore: localStore,
      remoteTagStore: remoteStore,
      localAccounts,
      remoteAccounts,
    })

    expect(Object.keys(merged.tagStore.tagsById)).toEqual(["local"])
    expect(merged.remoteAccounts[0].tagIds).toEqual(["local"])
  })

  it("remaps remote taggables (non-account entities) using the same id map", () => {
    const localStore = createDefaultTagStore()
    localStore.tagsById.local = {
      id: "local",
      name: "Work",
      createdAt: 1,
      updatedAt: 2,
    }

    const remoteStore = createDefaultTagStore()
    remoteStore.tagsById.remote = {
      id: "remote",
      name: " work ",
      createdAt: 10,
      updatedAt: 20,
    }

    const merged = mergeTagStoresAndRemapAccounts({
      localTagStore: localStore,
      remoteTagStore: remoteStore,
      localAccounts: [],
      remoteAccounts: [],
      localTaggables: [],
      remoteTaggables: [{ id: "p1", tagIds: ["remote"] }],
    })

    expect(merged.remoteTaggables[0]?.tagIds).toEqual(["local"])
  })
})
