import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"

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

describe("apiCredentialProfilesStorage", () => {
  beforeEach(async () => {
    storageData.clear()
    await apiCredentialProfilesStorage.clearAllData()
  })

  it("returns a safe default config when empty", async () => {
    const config = await apiCredentialProfilesStorage.getConfig()
    expect(config.profiles).toEqual([])
    expect(typeof config.lastUpdated).toBe("number")
  })

  it("normalizes baseUrl, trims apiKey, and sanitizes tag ids", async () => {
    const created = await apiCredentialProfilesStorage.createProfile({
      name: "Test Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "example.com/api/v1/models?x=1#y",
      apiKey: "  sk-test  ",
      tagIds: [" t1 ", "t1", "", "t2"],
      notes: "  hello  ",
    })

    expect(created.baseUrl).toBe("https://example.com/api")
    expect(created.apiKey).toBe("sk-test")
    expect(created.tagIds).toEqual(["t1", "t2"])
    expect(created.notes).toBe("hello")
  })

  it("de-dupes identical profiles on create (identity: apiType+baseUrl+apiKey)", async () => {
    const first = await apiCredentialProfilesStorage.createProfile({
      name: "A",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://example.com/v1",
      apiKey: "sk-dup",
    })

    const second = await apiCredentialProfilesStorage.createProfile({
      name: "B",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://example.com",
      apiKey: "sk-dup",
    })

    expect(second.id).toBe(first.id)
    expect(await apiCredentialProfilesStorage.listProfiles()).toHaveLength(1)
  })

  it("de-dupes profiles when an update causes an identity conflict and unions tag ids", async () => {
    const a = await apiCredentialProfilesStorage.createProfile({
      name: "A",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://a.example.com",
      apiKey: "sk-same",
      tagIds: ["t1"],
    })

    const b = await apiCredentialProfilesStorage.createProfile({
      name: "B",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://b.example.com",
      apiKey: "sk-same",
      tagIds: ["t2"],
    })

    const updated = await apiCredentialProfilesStorage.updateProfile(b.id, {
      baseUrl: "https://a.example.com/v1",
    })

    const stored = await apiCredentialProfilesStorage.listProfiles()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.id).toBe(updated.id)
    expect(stored[0]!.id).toBe(b.id)
    expect(stored[0]!.id).not.toBe(a.id)
    expect(stored[0]!.tagIds).toEqual(["t2", "t1"])
  })

  it("removes profiles on delete", async () => {
    const created = await apiCredentialProfilesStorage.createProfile({
      name: "Delete Me",
      apiType: API_TYPES.GOOGLE,
      baseUrl: "https://example.com/v1beta",
      apiKey: "AIza-test",
    })

    const deleted = await apiCredentialProfilesStorage.deleteProfile(created.id)
    expect(deleted).toBe(true)
    expect(await apiCredentialProfilesStorage.listProfiles()).toEqual([])
  })

  it("stores config under the dedicated storage key", async () => {
    await apiCredentialProfilesStorage.createProfile({
      name: "Stored",
      apiType: API_TYPES.ANTHROPIC,
      baseUrl: "https://example.com/v1/messages",
      apiKey: "sk-test",
    })

    expect(
      storageData.has(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      ),
    ).toBe(true)
  })
})
