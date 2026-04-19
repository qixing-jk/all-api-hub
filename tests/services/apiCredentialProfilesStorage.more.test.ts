import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  apiCredentialProfilesStorage,
  coerceApiCredentialProfilesConfig,
  mergeApiCredentialProfilesConfigs,
  subscribeToApiCredentialProfilesChanges,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { SiteHealthStatus } from "~/types"
import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"

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
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-30T00:00:00.000Z"))
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
    vi.useRealTimers()
    ;(globalThis as any).browser = originalBrowser
  })

  it("falls back to JSON cloning when structuredClone is unavailable during writes", async () => {
    const originalStructuredClone = globalThis.structuredClone
    ;(globalThis as any).structuredClone = undefined

    try {
      await apiCredentialProfilesStorage.importConfig({
        profiles: [
          {
            id: "fallback-clone",
            name: "Fallback Clone",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://clone.example.com/v1/models",
            apiKey: "sk-clone",
            tagIds: ["tag-a"],
            notes: "persisted",
          },
        ],
      })

      const created = await apiCredentialProfilesStorage.createProfile({
        name: "New Profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://new.example.com/v1/models",
        apiKey: "sk-new",
      })

      expect(created.id).toBeTruthy()
      await expect(
        apiCredentialProfilesStorage.listProfiles(),
      ).resolves.toEqual([
        expect.objectContaining({ id: "fallback-clone" }),
        expect.objectContaining({ name: "New Profile" }),
      ])
    } finally {
      ;(globalThis as any).structuredClone = originalStructuredClone
    }
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

  it("coerces malformed rows with generated ids, fallback timestamps, and trimmed notes", () => {
    const coerced = coerceApiCredentialProfilesConfig(
      {
        version: "bad",
        lastUpdated: 0,
        profiles: [
          null,
          {
            id: "   ",
            apiType: API_TYPES.ANTHROPIC,
            baseUrl: "https://anthropic.example.com/v1/messages",
            apiKey: " sk-anthropic ",
            name: 42,
            notes: null,
            createdAt: "bad",
            updatedAt: "bad",
            tagIds: [" team-a ", 7, "team-a", "team-b"],
          },
        ],
      },
      { now: 54321 },
    )

    expect(coerced.version).toBe(API_CREDENTIAL_PROFILES_CONFIG_VERSION)
    expect(coerced.lastUpdated).toBe(54321)
    expect(coerced.profiles).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        apiType: API_TYPES.ANTHROPIC,
        baseUrl: "https://anthropic.example.com",
        apiKey: "sk-anthropic",
        name: "https://anthropic.example.com",
        notes: "",
        createdAt: 54321,
        updatedAt: 54321,
        tagIds: ["team-a", "team-b"],
      }),
    ])
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

  it("coerces telemetry config and snapshot fields for backup compatibility", () => {
    const coerced = coerceApiCredentialProfilesConfig(
      {
        profiles: [
          {
            id: "profile-1",
            name: "Profile",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.com",
            apiKey: "sk-1",
            telemetryConfig: {
              mode: "customReadOnlyEndpoint",
              customEndpoint: {
                endpoint: "/usage",
                jsonPaths: {
                  balanceUsd: "data.balance",
                  todayRequests: "data.today.requests",
                },
              },
            },
            telemetrySnapshot: {
              health: { status: SiteHealthStatus.Healthy },
              lastSyncTime: 1000,
              lastSuccessTime: 1000,
              balanceUsd: "12.5",
              todayTokens: { upload: "100", download: 50 },
              models: { count: 2, preview: ["gpt-4o", "", 1] },
              attempts: [
                {
                  source: "newApiTokenUsage",
                  endpoint: "/api/usage/token/",
                  status: "success",
                  message: "ok",
                },
              ],
            },
          },
        ],
      },
      { now: 12345 },
    )

    expect(coerced.profiles[0]).toEqual(
      expect.objectContaining({
        telemetryConfig: {
          mode: "customReadOnlyEndpoint",
          customEndpoint: {
            endpoint: "/usage",
            jsonPaths: {
              balanceUsd: "data.balance",
              todayRequests: "data.today.requests",
            },
          },
        },
        telemetrySnapshot: expect.objectContaining({
          lastSyncTime: 1000,
          balanceUsd: 12.5,
          todayTokens: { upload: 100, download: 50 },
          models: { count: 2, preview: ["gpt-4o"] },
          attempts: [
            {
              source: "newApiTokenUsage",
              endpoint: "/api/usage/token/",
              status: "success",
              message: "ok",
            },
          ],
        }),
      }),
    )
  })

  it("merges telemetry snapshots by newest successful query without changing identity winner", () => {
    const merged = mergeApiCredentialProfilesConfigs({
      now: 67890,
      local: {
        version: 2,
        lastUpdated: 1,
        profiles: [
          {
            id: "local-1",
            name: "Local",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.com",
            apiKey: "sk-1",
            tagIds: ["local"],
            notes: "",
            createdAt: 1,
            updatedAt: 10,
            telemetryConfig: { mode: "auto" },
            telemetrySnapshot: {
              health: { status: SiteHealthStatus.Healthy },
              lastSyncTime: 5000,
              lastSuccessTime: 5000,
              balanceUsd: 1,
              attempts: [],
            },
          },
        ],
      },
      incoming: {
        version: 2,
        lastUpdated: 2,
        profiles: [
          {
            id: "incoming-1",
            name: "Incoming",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.com",
            apiKey: "sk-1",
            tagIds: ["remote"],
            notes: "",
            createdAt: 2,
            updatedAt: 20,
            telemetryConfig: { mode: "newApiTokenUsage" },
            telemetrySnapshot: {
              health: { status: SiteHealthStatus.Healthy },
              lastSyncTime: 9000,
              lastSuccessTime: 9000,
              balanceUsd: 9,
              attempts: [],
            },
          },
        ],
      },
    })

    expect(merged.profiles).toHaveLength(1)
    expect(merged.profiles[0]).toEqual(
      expect.objectContaining({
        id: "incoming-1",
        telemetryConfig: { mode: "newApiTokenUsage" },
        telemetrySnapshot: expect.objectContaining({ balanceUsd: 9 }),
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

  it("returns the existing profile instead of creating a duplicate identity", async () => {
    const existing = await apiCredentialProfilesStorage.createProfile({
      name: "Original",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://example.com/v1/models",
      apiKey: " sk-duplicate ",
      tagIds: ["t1"],
      notes: "primary",
    })

    const duplicate = await apiCredentialProfilesStorage.createProfile({
      name: "Duplicate",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://example.com",
      apiKey: "sk-duplicate",
      tagIds: ["t2"],
      notes: "secondary",
    })

    expect(duplicate).toEqual(existing)
    await expect(apiCredentialProfilesStorage.listProfiles()).resolves.toEqual([
      existing,
    ])
  })

  it("returns the newer identity winner when an update collides with an existing profile", async () => {
    await apiCredentialProfilesStorage.importConfig({
      profiles: [
        {
          id: "older",
          name: "Older Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://older.example.com",
          apiKey: "sk-old",
          tagIds: ["legacy"],
          notes: "old notes",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: "winner",
          name: "Winner Profile",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://shared.example.com",
          apiKey: "sk-shared",
          tagIds: ["remote"],
          notes: "keep me",
          createdAt: 3000,
          updatedAt: 5000,
        },
      ],
    })

    vi.setSystemTime(new Date("1970-01-01T00:00:02.000Z"))

    const updated = await apiCredentialProfilesStorage.updateProfile("older", {
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://shared.example.com/v1/models",
      apiKey: "sk-shared",
      tagIds: ["local", "remote"],
      notes: "updated locally",
    })

    expect(updated).toEqual(
      expect.objectContaining({
        id: "winner",
        name: "Winner Profile",
        tagIds: ["remote", "local"],
        createdAt: 1000,
        updatedAt: 5000,
      }),
    )

    await expect(apiCredentialProfilesStorage.listProfiles()).resolves.toEqual([
      expect.objectContaining({
        id: "winner",
        tagIds: ["remote", "local"],
      }),
    ])
  })

  it("sorts profiles by name when updatedAt timestamps are equal", async () => {
    await apiCredentialProfilesStorage.importConfig({
      profiles: [
        {
          id: "beta",
          name: "Beta",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://beta.example.com",
          apiKey: "sk-beta",
          createdAt: 1,
          updatedAt: 10,
        },
        {
          id: "alpha",
          name: "Alpha",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://alpha.example.com",
          apiKey: "sk-alpha",
          createdAt: 2,
          updatedAt: 10,
        },
      ],
    })

    const profiles = await apiCredentialProfilesStorage.listProfiles()

    expect(profiles.map((profile) => profile.id)).toEqual(["alpha", "beta"])
  })

  it("sorts profiles by newest updatedAt before falling back to name order", async () => {
    await apiCredentialProfilesStorage.importConfig({
      profiles: [
        {
          id: "older",
          name: "Zulu",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://older.example.com",
          apiKey: "sk-older",
          createdAt: 1,
          updatedAt: 10,
        },
        {
          id: "newer",
          name: "Alpha",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://newer.example.com",
          apiKey: "sk-newer",
          createdAt: 2,
          updatedAt: 20,
        },
      ],
    })

    const profiles = await apiCredentialProfilesStorage.listProfiles()

    expect(profiles.map((profile) => profile.id)).toEqual(["newer", "older"])
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

  it("returns null when looking up a missing profile id", async () => {
    await expect(
      apiCredentialProfilesStorage.getProfileById("missing"),
    ).resolves.toBeNull()
  })

  it("falls back to an empty default config when the storage read fails", async () => {
    const getSpy = vi
      .spyOn((apiCredentialProfilesStorage as any).storage, "get")
      .mockRejectedValueOnce(new Error("storage unavailable"))

    const config = await apiCredentialProfilesStorage.getConfig()

    expect(config).toEqual({
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles: [],
      lastUpdated: Date.now(),
    })

    getSpy.mockRestore()
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
