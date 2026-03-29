import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  apiCredentialProfilesStorage,
  coerceApiCredentialProfilesConfig,
  mergeApiCredentialProfilesConfigs,
  subscribeToApiCredentialProfilesChanges,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
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

describe("apiCredentialProfilesStorage additional flows", () => {
  const originalBrowser = (globalThis as any).browser
  let addListenerMock: ReturnType<typeof vi.fn>
  let removeListenerMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    storageData.clear()
    await apiCredentialProfilesStorage.clearAllData()

    addListenerMock = vi.fn()
    removeListenerMock = vi.fn()
    ;(globalThis as any).browser = {
      storage: {
        onChanged: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
  })

  it("coerces imported configs by dropping invalid rows and normalizing names", () => {
    const coerced = coerceApiCredentialProfilesConfig(
      {
        profiles: [
          {
            id: "row-1",
            apiType: "unsupported",
            baseUrl: "example.com/v1/models",
            apiKey: " sk-1 ",
            name: " ",
            tagIds: [" t1 ", "t1", ""],
            notes: " note ",
            createdAt: 100,
            updatedAt: 200,
          },
          {
            id: "invalid-empty",
            apiType: API_TYPES.OPENAI,
            baseUrl: "",
            apiKey: "  ",
            name: "Invalid",
          },
        ],
      },
      { now: 12345 },
    )

    expect(coerced.profiles).toEqual([
      expect.objectContaining({
        id: "row-1",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://example.com",
        apiKey: "sk-1",
        name: "https://example.com",
        tagIds: ["t1"],
        notes: "note",
        createdAt: 100,
        updatedAt: 200,
      }),
    ])
    expect(coerced.lastUpdated).toBe(12345)
  })

  it("merges incoming configs using identity de-dupe and refreshes lastUpdated", () => {
    const merged = mergeApiCredentialProfilesConfigs({
      now: 67890,
      local: {
        version: 1,
        lastUpdated: 1,
        profiles: [
          {
            id: "local-1",
            name: "Local",
            apiType: API_TYPES.OPENAI,
            baseUrl: "https://example.com/v1",
            apiKey: "sk-1",
            tagIds: ["local"],
            notes: "",
            createdAt: 1,
            updatedAt: 10,
          },
        ],
      },
      incoming: {
        version: 1,
        lastUpdated: 2,
        profiles: [
          {
            id: "incoming-1",
            name: "Incoming",
            apiType: API_TYPES.OPENAI,
            baseUrl: "https://example.com",
            apiKey: "sk-1",
            tagIds: ["remote"],
            notes: "",
            createdAt: 2,
            updatedAt: 20,
          },
          {
            id: "incoming-2",
            name: "Other",
            apiType: API_TYPES.GOOGLE,
            baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
            apiKey: "AIza-1",
            tagIds: [],
            notes: "",
            createdAt: 3,
            updatedAt: 30,
          },
        ],
      },
    })

    expect(merged.lastUpdated).toBe(67890)
    expect(merged.profiles).toHaveLength(2)
    expect(
      merged.profiles.find((profile) => profile.id === "incoming-1"),
    ).toEqual(
      expect.objectContaining({
        tagIds: ["remote", "local"],
      }),
    )
  })

  it("imports and merges configs through the storage service", async () => {
    const imported = await apiCredentialProfilesStorage.importConfig({
      profiles: [
        {
          id: "imported-1",
          name: "Imported",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com/v1/models",
          apiKey: "sk-1",
          tagIds: ["t1"],
          notes: "first",
        },
      ],
    })

    expect(imported.profiles).toHaveLength(1)
    expect(
      await apiCredentialProfilesStorage.getProfileById("imported-1"),
    ).toEqual(
      expect.objectContaining({
        id: "imported-1",
        baseUrl: "https://example.com",
      }),
    )

    const merged = await apiCredentialProfilesStorage.mergeConfig({
      profiles: [
        {
          id: "merged-1",
          name: "Merged",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://example.com",
          apiKey: "sk-1",
          tagIds: ["t2"],
          notes: "second",
          updatedAt: Date.now() + 1,
        },
      ],
    })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.profiles[0]?.tagIds).toEqual(["t2", "t1"])
  })

  it("validates update operations and removes tag ids from matching profiles only", async () => {
    const first = await apiCredentialProfilesStorage.createProfile({
      name: "Profile A",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://a.example.com",
      apiKey: "sk-a",
      tagIds: ["t1", "t2"],
    })
    const second = await apiCredentialProfilesStorage.createProfile({
      name: "Profile B",
      apiType: API_TYPES.GOOGLE,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      apiKey: "AIza-b",
      tagIds: ["t2", "t3"],
    })

    await expect(
      apiCredentialProfilesStorage.updateProfile("missing", { name: "Next" }),
    ).rejects.toThrow("Profile not found.")
    await expect(
      apiCredentialProfilesStorage.updateProfile(first.id, { name: "   " }),
    ).rejects.toThrow("Profile name cannot be empty.")
    await expect(
      apiCredentialProfilesStorage.updateProfile(first.id, { apiKey: "   " }),
    ).rejects.toThrow("API key cannot be empty.")
    await expect(
      apiCredentialProfilesStorage.updateProfile(first.id, {
        baseUrl: "   ",
      }),
    ).rejects.toThrow("Base URL is invalid.")

    expect(
      await apiCredentialProfilesStorage.removeTagIdFromAllProfiles(""),
    ).toEqual({ updatedProfiles: 0 })
    expect(
      await apiCredentialProfilesStorage.removeTagIdFromAllProfiles("missing"),
    ).toEqual({ updatedProfiles: 0 })
    expect(
      await apiCredentialProfilesStorage.removeTagIdFromAllProfiles("t2"),
    ).toEqual({ updatedProfiles: 2 })

    const profiles = await apiCredentialProfilesStorage.listProfiles()
    expect(profiles.find((profile) => profile.id === first.id)?.tagIds).toEqual(
      ["t1"],
    )
    expect(
      profiles.find((profile) => profile.id === second.id)?.tagIds,
    ).toEqual(["t3"])
  })

  it("returns false when deleting a missing profile id", async () => {
    await expect(
      apiCredentialProfilesStorage.deleteProfile("missing"),
    ).resolves.toBe(false)
  })

  it("subscribes only to local storage changes affecting the profile key", () => {
    const callback = vi.fn()
    const unsubscribe = subscribeToApiCredentialProfilesChanges(callback)

    expect(addListenerMock).toHaveBeenCalledTimes(1)
    const listener = addListenerMock.mock.calls[0]?.[0]
    expect(listener).toBeTypeOf("function")

    listener?.({}, "sync")
    expect(callback).not.toHaveBeenCalled()

    listener?.(
      {
        unrelated: {
          oldValue: null,
          newValue: {},
        },
      },
      "local",
    )
    expect(callback).not.toHaveBeenCalled()

    listener?.(
      {
        [API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES]: {
          oldValue: null,
          newValue: {},
        },
      },
      "local",
    )
    expect(callback).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(removeListenerMock).toHaveBeenCalledWith(listener)
  })
})
