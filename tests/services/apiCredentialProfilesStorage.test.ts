import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { SiteHealthStatus } from "~/types"

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
  it.each(["create", "capture"])(
    "directs duplicate %s callers to edit differing headers without modifying the profile",
    async (operation) => {
      const input = {
        name: "Headers",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://api.example",
        apiKey: "key",
        requestHeaders: { "x-client": "old" },
      }
      const original = await apiCredentialProfilesStorage.createProfile(input)
      const changed = { ...input, requestHeaders: { "x-client": "new" } }
      const task =
        operation === "create"
          ? apiCredentialProfilesStorage.createProfileWithCreationStatus(
              changed,
            )
          : apiCredentialProfilesStorage.captureProfile({
              profile: changed,
              linkedBy: "creation-response",
            })
      await expect(task).rejects.toThrow(
        "apiCredentialProfiles:dialog.errors.duplicateRequestHeaders",
      )
      expect(
        await apiCredentialProfilesStorage.getProfileById(original.id),
      ).toEqual(original)
      expect(await apiCredentialProfilesStorage.createProfile(input)).toEqual(
        original,
      )
    },
  )
  it("round-trips normalized headers through storage and import, and clears them explicitly", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "Headers",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://api.example",
      apiKey: "key",
      requestHeaders: { "X-Client": " custom " },
    })
    expect(profile.requestHeaders).toEqual({ "x-client": "custom" })
    const exported = await apiCredentialProfilesStorage.exportConfig()
    await apiCredentialProfilesStorage.clearAllData()
    await apiCredentialProfilesStorage.importConfig(exported)
    expect(
      (await apiCredentialProfilesStorage.getProfileById(profile.id))
        ?.requestHeaders,
    ).toEqual({ "x-client": "custom" })
    await apiCredentialProfilesStorage.updateProfile(profile.id, {
      notes: "metadata",
    })
    expect(
      (await apiCredentialProfilesStorage.getProfileById(profile.id))
        ?.requestHeaders,
    ).toEqual({ "x-client": "custom" })
    const cleared = await apiCredentialProfilesStorage.updateProfile(
      profile.id,
      { requestHeaders: {} },
    )
    expect(cleared.requestHeaders).toEqual({})
  })

  it("does not persist a telemetry response from before the headers were edited", async () => {
    const original = await apiCredentialProfilesStorage.createProfile({
      name: "Headers",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://api.example",
      apiKey: "key",
      requestHeaders: { "x-client": "old" },
    })
    await apiCredentialProfilesStorage.updateProfile(original.id, {
      requestHeaders: { "x-client": "new" },
    })
    await apiCredentialProfilesStorage.updateTelemetrySnapshot(
      original.id,
      {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 1,
        attempts: [],
      },
      original,
    )
    expect(
      (await apiCredentialProfilesStorage.getProfileById(original.id))
        ?.telemetrySnapshot,
    ).toBeUndefined()
  })
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
    const expiresAt = new Date(2026, 6, 31).getTime()
    const created = await apiCredentialProfilesStorage.createProfile({
      name: "Test Profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "example.com/api/v1/models?x=1#y",
      apiKey: "  sk-test  ",
      tagIds: [" t1 ", "t1", "", "t2"],
      notes: "  hello  ",
      expiresAt,
    })

    expect(created.baseUrl).toBe("https://example.com/api")
    expect(created.apiKey).toBe("sk-test")
    expect(created.tagIds).toEqual(["t1", "t2"])
    expect(created.notes).toBe("hello")
    expect(created.expiresAt).toBe(expiresAt)
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

  it("reports creation ownership atomically when concurrent callers share an identity", async () => {
    const input = {
      name: "Fixture",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://example.com/v1",
      apiKey: "sk-fixture",
    }
    const results = await Promise.all([
      apiCredentialProfilesStorage.createProfileWithCreationStatus(input),
      apiCredentialProfilesStorage.createProfileWithCreationStatus({
        ...input,
        baseUrl: "https://example.com",
      }),
    ])
    expect(results.filter((result) => result.isNew)).toHaveLength(1)
    expect(results[0]!.profile.id).toBe(results[1]!.profile.id)
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
