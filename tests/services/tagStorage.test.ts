import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { tagStorage } from "~/services/tags/tagStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { AccountStorageConfig } from "~/types"
import * as browserApi from "~/utils/browser/browserApi"

const storageData = new Map<string, any>()

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: any) {
      storageData.set(key, value)
    }
    async get(key: string) {
      return storageData.get(key)
    }
    async remove(key: string) {
      storageData.delete(key)
    }
  }
  return { Storage }
})

describe("tagStorage", () => {
  beforeEach(() => {
    storageData.clear()
    vi.restoreAllMocks()
  })

  it("createTag enforces normalized uniqueness", async () => {
    vi.spyOn(Date, "now").mockReturnValue(123)
    vi.spyOn(Math, "random").mockReturnValue(0.1)

    const first = await tagStorage.createTag("Work")
    expect(first.name).toBe("Work")

    await expect(tagStorage.createTag("  work  ")).rejects.toThrow(
      "Tag name already exists.",
    )
  })

  it("createTag rejects empty names", async () => {
    await expect(tagStorage.createTag("   ")).rejects.toThrow(
      "Tag name cannot be empty.",
    )
  })

  it("getTagStore normalizes legacy falsy versions and listTags returns sorted names", async () => {
    storageData.set("global_tag_store", {
      version: 0,
      tagsById: {
        t2: { id: "t2", name: "Zoo", createdAt: 2, updatedAt: 2 },
        t1: { id: "t1", name: "alpha", createdAt: 1, updatedAt: 1 },
      },
    })

    const store = await tagStorage.getTagStore()
    expect(store.version).toBeGreaterThan(0)

    const tags = await tagStorage.listTags()
    expect(tags.map((tag) => tag.name)).toEqual(["alpha", "Zoo"])
    expect(await tagStorage.exportTagStore()).toEqual(store)
  })

  it("importTagStore sanitizes malformed payloads before persisting", async () => {
    await tagStorage.importTagStore({
      version: 0,
      tagsById: {
        keep: { id: "ignore-me", name: "  Work  ", createdAt: 1 },
        drop: { id: "drop", name: "   " },
      },
    })

    const savedStore = storageData.get("global_tag_store")
    expect(savedStore).toEqual({
      version: expect.any(Number),
      tagsById: {
        keep: {
          id: "keep",
          name: "Work",
          createdAt: 1,
          updatedAt: 1,
        },
      },
    })
  })

  it("createTag restores a legacy falsy store version and still succeeds when runtime notify is unavailable", async () => {
    vi.spyOn(Date, "now").mockReturnValue(456)
    vi.spyOn(browserApi, "sendRuntimeMessage").mockReturnValue(undefined as any)

    storageData.set("global_tag_store", {
      version: 0,
      tagsById: {},
    })

    const created = await tagStorage.createTag("Focus")

    expect(created).toEqual({
      id: expect.any(String),
      name: "Focus",
      createdAt: 456,
      updatedAt: 456,
    })

    const savedStore = storageData.get("global_tag_store")
    expect(savedStore.version).toBeGreaterThan(0)
    expect(savedStore.tagsById[created.id]).toEqual(created)
  })

  it("ensureLegacyMigration converts account.tags -> account.tagIds and creates global tags", async () => {
    const accountsConfig: AccountStorageConfig = {
      accounts: [
        {
          id: "a1",
          site_name: "Site",
          site_url: "https://example.com",
          health: { status: "healthy" } as any,
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: {
            id: 1,
            access_token: "token",
            username: "user",
            quota: 0,
            today_prompt_tokens: 0,
            today_completion_tokens: 0,
            today_quota_consumption: 0,
            today_requests_count: 0,
            today_income: 0,
          } as any,
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
          tags: [" Work "] as any,
        },
      ] as any,
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    }

    storageData.set("site_accounts", accountsConfig)

    const result = await tagStorage.ensureLegacyMigration()
    expect(result.migratedAccountCount).toBe(1)
    expect(result.createdTagCount).toBe(1)

    const savedAccounts = storageData.get(
      "site_accounts",
    ) as AccountStorageConfig
    expect(savedAccounts.accounts[0].tagIds).toHaveLength(1)
    expect((savedAccounts.accounts[0] as any).tags).toBeUndefined()

    const store = storageData.get("global_tag_store") as any
    expect(Object.values(store.tagsById).map((t: any) => t.name)).toEqual([
      "Work",
    ])
  })

  it("ensureLegacyMigration marks as checked when no legacy tags exist", async () => {
    const accountsConfig: AccountStorageConfig = {
      accounts: [
        {
          id: "a1",
          site_name: "Site",
          site_url: "https://example.com",
          health: { status: "healthy" } as any,
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: { id: 1, access_token: "token" } as any,
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
          tagIds: ["t1"],
        },
      ] as any,
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    }

    storageData.set("site_accounts", accountsConfig)

    const result = await tagStorage.ensureLegacyMigration()
    expect(result).toEqual({ migratedAccountCount: 0, createdTagCount: 0 })
  })

  it("ensureLegacyMigration still migrates when legacy tags reappear after being checked", async () => {
    const accountsConfig: AccountStorageConfig = {
      accounts: [
        {
          id: "a1",
          site_name: "Site",
          site_url: "https://example.com",
          health: { status: "healthy" } as any,
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: { id: 1, access_token: "token" } as any,
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
          tags: ["Work"] as any,
        },
      ] as any,
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    }

    storageData.set("site_accounts", accountsConfig)

    const result = await tagStorage.ensureLegacyMigration()
    expect(result.migratedAccountCount).toBe(1)
    expect(result.createdTagCount).toBe(1)
  })

  it("deleteTag removes references from accounts and bookmarks", async () => {
    const store = {
      version: 1,
      tagsById: {
        t1: { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
      },
    }

    const accountsConfig: AccountStorageConfig = {
      accounts: [
        {
          id: "a1",
          site_name: "Site",
          site_url: "https://example.com",
          health: { status: "healthy" } as any,
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: {
            id: 1,
            access_token: "token",
            username: "user",
          } as any,
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token" as any,
          checkIn: { enableDetection: false } as any,
          tagIds: ["t1"],
        },
      ] as any,
      bookmarks: [
        {
          id: "b1",
          name: "Docs",
          url: "https://example.com/docs",
          tagIds: ["t1"],
          notes: "",
          created_at: 0,
          updated_at: 0,
        },
        {
          id: "b2",
          name: "Home",
          url: "https://example.com",
          tagIds: [],
          notes: "",
          created_at: 0,
          updated_at: 0,
        },
      ],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    }

    storageData.set("global_tag_store", store)
    storageData.set("site_accounts", accountsConfig)

    const result = await tagStorage.deleteTag("t1")
    expect(result.updatedAccounts).toBe(1)
    expect(result.updatedBookmarks).toBe(1)

    const savedAccounts = storageData.get(
      "site_accounts",
    ) as AccountStorageConfig
    expect(savedAccounts.accounts[0].tagIds).toEqual([])
    expect(savedAccounts.bookmarks).toHaveLength(2)
    expect(savedAccounts.bookmarks[0].tagIds).toEqual([])
    expect(savedAccounts.bookmarks[1].tagIds).toEqual([])
    const savedStore = storageData.get("global_tag_store") as any
    expect(savedStore.tagsById.t1).toBeUndefined()
  })

  it("deleteTag keeps untouched account and bookmark tag lists while normalizing a legacy store version", async () => {
    storageData.set("global_tag_store", {
      version: 0,
      tagsById: {
        t1: { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
      },
    })
    storageData.set("site_accounts", {
      accounts: [
        {
          id: "a-hit",
          site_name: "Site",
          site_url: "https://example.com",
          health: { status: "healthy" },
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: { id: 1, access_token: "token" },
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token",
          checkIn: { enableDetection: false },
          tagIds: ["t1", "keep"],
        } as any,
        {
          id: "a-empty",
          site_name: "Site",
          site_url: "https://example.com/empty",
          health: { status: "healthy" },
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: { id: 2, access_token: "token" },
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token",
          checkIn: { enableDetection: false },
          tagIds: [],
        } as any,
        {
          id: "a-miss",
          site_name: "Site",
          site_url: "https://example.com/miss",
          health: { status: "healthy" },
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: { id: 3, access_token: "token" },
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token",
          checkIn: { enableDetection: false },
          tagIds: ["keep"],
        } as any,
        {
          id: "a-none",
          site_name: "Site",
          site_url: "https://example.com/none",
          health: { status: "healthy" },
          site_type: SITE_TYPES.UNKNOWN,
          exchange_rate: 7,
          account_info: { id: 4, access_token: "token" },
          last_sync_time: 0,
          updated_at: 0,
          created_at: 0,
          authType: "access_token",
          checkIn: { enableDetection: false },
        } as any,
      ],
      bookmarks: [
        {
          id: "b-hit",
          name: "Docs",
          url: "https://example.com/docs",
          tagIds: ["t1"],
          notes: "",
          created_at: 0,
          updated_at: 0,
        },
        {
          id: "b-miss",
          name: "Home",
          url: "https://example.com",
          tagIds: ["keep"],
          notes: "",
          created_at: 0,
          updated_at: 0,
        },
        {
          id: "b-empty",
          name: "Blank",
          url: "https://example.com/blank",
          tagIds: [],
          notes: "",
          created_at: 0,
          updated_at: 0,
        },
      ],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    } satisfies AccountStorageConfig)

    const result = await tagStorage.deleteTag("t1")

    expect(result).toEqual({
      updatedAccounts: 1,
      updatedBookmarks: 1,
      updatedApiCredentialProfiles: 0,
    })

    const savedAccounts = storageData.get(
      "site_accounts",
    ) as AccountStorageConfig
    expect(savedAccounts.accounts[0].tagIds).toEqual(["keep"])
    expect(savedAccounts.accounts[1].tagIds).toEqual([])
    expect(savedAccounts.accounts[2].tagIds).toEqual(["keep"])
    expect(savedAccounts.accounts[3].tagIds).toBeUndefined()
    expect(savedAccounts.bookmarks[0].tagIds).toEqual([])
    expect(savedAccounts.bookmarks[1].tagIds).toEqual(["keep"])
    expect(savedAccounts.bookmarks[2].tagIds).toEqual([])

    const savedStore = storageData.get("global_tag_store") as any
    expect(savedStore.version).toBeGreaterThan(0)
    expect(savedStore.tagsById.t1).toBeUndefined()
  })

  it("renameTag updates the display name and rejects missing, empty, or conflicting names", async () => {
    storageData.set("global_tag_store", {
      version: 1,
      tagsById: {
        t1: { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
        t2: { id: "t2", name: "Personal", createdAt: 2, updatedAt: 2 },
      },
    })

    await expect(tagStorage.renameTag("missing", "Focus")).rejects.toThrow(
      "Tag not found.",
    )
    await expect(tagStorage.renameTag("t1", "   ")).rejects.toThrow(
      "Tag name cannot be empty.",
    )
    await expect(tagStorage.renameTag("t1", " personal ")).rejects.toThrow(
      "Tag name already exists.",
    )

    vi.spyOn(Date, "now").mockReturnValue(999)
    const renamed = await tagStorage.renameTag("t1", "  Deep Work  ")

    expect(renamed).toEqual({
      id: "t1",
      name: "Deep Work",
      createdAt: 1,
      updatedAt: 999,
    })

    const savedStore = storageData.get("global_tag_store") as any
    expect(savedStore.tagsById.t1).toEqual(renamed)
  })

  it("deleteTag is a no-op when the tag does not exist", async () => {
    storageData.set("global_tag_store", {
      version: 1,
      tagsById: {
        t1: { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
      },
    })
    storageData.set("site_accounts", {
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    })

    const result = await tagStorage.deleteTag("missing")

    expect(result).toEqual({
      updatedAccounts: 0,
      updatedBookmarks: 0,
      updatedApiCredentialProfiles: 0,
    })
    expect(storageData.get("global_tag_store").tagsById.t1).toBeDefined()
  })

  it("deleteTag removes the tag id from API credential profiles", async () => {
    const store = {
      version: 1,
      tagsById: {
        t1: { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
      },
    }

    const accountsConfig: AccountStorageConfig = {
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    }

    storageData.set("global_tag_store", store)
    storageData.set("site_accounts", accountsConfig)
    storageData.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      {
        version: 2,
        profiles: [
          {
            id: "p-1",
            name: "Profile",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.com",
            apiKey: "sk-test",
            tagIds: ["t1"],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        lastUpdated: 1,
      },
    )

    const result = await tagStorage.deleteTag("t1")
    expect(result.updatedApiCredentialProfiles).toBe(1)

    const savedProfiles = storageData.get(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    ) as any
    expect(savedProfiles.profiles[0]?.tagIds).toEqual([])
  })

  it("deleteTag still succeeds when API credential profile cleanup fails", async () => {
    vi.spyOn(
      apiCredentialProfilesStorage,
      "removeTagIdFromAllProfiles",
    ).mockRejectedValue(new Error("profile cleanup failed"))

    storageData.set("global_tag_store", {
      version: 1,
      tagsById: {
        t1: { id: "t1", name: "Work", createdAt: 1, updatedAt: 1 },
      },
    })
    storageData.set("site_accounts", {
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    })

    const result = await tagStorage.deleteTag("t1")

    expect(result).toEqual({
      updatedAccounts: 0,
      updatedBookmarks: 0,
      updatedApiCredentialProfiles: 0,
    })
    expect(storageData.get("global_tag_store").tagsById.t1).toBeUndefined()
  })
})
