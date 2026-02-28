import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_TYPES } from "~/services/aiApiVerification"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { tagStorage } from "~/services/tags/tagStorage"
import type { AccountStorageConfig } from "~/types"

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

  it("ensureLegacyMigration converts account.tags -> account.tagIds and creates global tags", async () => {
    const accountsConfig: AccountStorageConfig = {
      accounts: [
        {
          id: "a1",
          site_name: "Site",
          site_url: "https://example.com",
          health: { status: "healthy" } as any,
          site_type: "test",
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
          site_type: "test",
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
          site_type: "test",
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
          site_type: "test",
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
})
