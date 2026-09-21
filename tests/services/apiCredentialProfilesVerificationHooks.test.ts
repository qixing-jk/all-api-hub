import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"

const storageData = new Map<string, any>()

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: any) {
      storageData.set(key, structuredClone(value))
    }

    async get(key: string) {
      const value = storageData.get(key)
      return value === undefined ? undefined : structuredClone(value)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

function readStoredProfiles() {
  return storageData.get(
    API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )?.profiles
}

async function seedProfileResults(params: {
  profileId: string
  modelIds?: string[]
  verifiedAt?: number
}) {
  const results = [
    {
      id: "models" as const,
      status: "pass" as const,
      latencyMs: 1,
      summary: "ok",
    },
  ]
  const targets = [
    createProfileVerificationHistoryTarget(params.profileId)!,
    ...(params.modelIds ?? []).map(
      (modelId) =>
        createProfileModelVerificationHistoryTarget(params.profileId, modelId)!,
    ),
  ]

  await verificationResultHistoryStorage.upsertLatestSummaries(
    targets.map(
      (target) =>
        createVerificationHistorySummary({
          target,
          apiType: API_TYPES.OPENAI,
          verifiedAt: params.verifiedAt,
          results,
        })!,
    ),
  )
}

async function listStoredTargetKeys() {
  return (await verificationResultHistoryStorage.listSummaries())
    .map(({ targetKey }) => targetKey)
    .sort()
}

describe("apiCredentialProfilesStorage verification hooks", () => {
  beforeEach(() => {
    storageData.clear()
  })

  it("lists profile ids and propagates read failures", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "A",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://a.example.com",
      apiKey: "sk-a",
    })

    await expect(
      apiCredentialProfilesStorage.listProfileIdsOrThrow(),
    ).resolves.toEqual([profile.id])

    const readSpy = vi
      .spyOn(Storage.prototype, "get")
      .mockImplementationOnce(async (key) => {
        expect(key).toBe(
          API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
        )
        throw new Error("unreadable")
      })
    await expect(
      apiCredentialProfilesStorage.listProfileIdsOrThrow(),
    ).rejects.toThrow("unreadable")
    readSpy.mockRestore()
  })

  it("drops a deleted profile's results", async () => {
    const doomed = await apiCredentialProfilesStorage.createProfile({
      name: "doomed",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://doomed.example.com",
      apiKey: "sk-doomed",
    })
    const survivor = await apiCredentialProfilesStorage.createProfile({
      name: "survivor",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://survivor.example.com",
      apiKey: "sk-survivor",
    })
    await seedProfileResults({ profileId: doomed.id, modelIds: ["m-1"] })
    await seedProfileResults({ profileId: survivor.id })

    await expect(
      apiCredentialProfilesStorage.deleteProfile(doomed.id),
    ).resolves.toBe(true)

    await expect(listStoredTargetKeys()).resolves.toEqual([
      `profile:${survivor.id}`,
    ])
  })

  it("keeps a profile deletion committed when verification cleanup fails", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "cleanup failure",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://cleanup-failure.example.com",
      apiKey: "sk-cleanup-failure",
    })
    const reconcileSpy = vi
      .spyOn(verificationResultHistoryStorage, "reconcileOwners")
      .mockRejectedValueOnce(new Error("verification storage unavailable"))

    await expect(
      apiCredentialProfilesStorage.deleteProfile(profile.id),
    ).resolves.toBe(true)
    await expect(apiCredentialProfilesStorage.listProfiles()).resolves.toEqual(
      [],
    )

    reconcileSpy.mockRestore()
  })

  it("drops a profile's results when its credentials change", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "A",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://a.example.com",
      apiKey: "sk-a",
    })
    await seedProfileResults({ profileId: profile.id, modelIds: ["m-1"] })

    await apiCredentialProfilesStorage.updateProfile(profile.id, {
      apiKey: "sk-rotated",
    })

    await expect(listStoredTargetKeys()).resolves.toEqual([])
  })

  it.each([
    ["apiType", { apiType: API_TYPES.ANTHROPIC }],
    ["baseUrl", { baseUrl: "https://moved.example.com" }],
  ])(
    "drops a profile's results when its %s changes",
    async (_label, updates) => {
      const profile = await apiCredentialProfilesStorage.createProfile({
        name: "A",
        apiType: API_TYPES.OPENAI,
        baseUrl: "https://a.example.com",
        apiKey: "sk-a",
      })
      await seedProfileResults({ profileId: profile.id })

      await apiCredentialProfilesStorage.updateProfile(profile.id, updates)

      await expect(listStoredTargetKeys()).resolves.toEqual([])
    },
  )

  it("keeps a profile's results when only its name and tags change", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "A",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://a.example.com",
      apiKey: "sk-a",
    })
    await seedProfileResults({ profileId: profile.id })

    await apiCredentialProfilesStorage.updateProfile(profile.id, {
      name: "Renamed",
      tagIds: ["t1"],
      notes: "note",
    })

    await expect(listStoredTargetKeys()).resolves.toEqual([
      `profile:${profile.id}`,
    ])
  })

  it("moves a merged profile's results onto the surviving profile", async () => {
    // Two distinct profiles become one identity when the second adopts the first's
    // credentials. The just-updated profile wins, the first is merged away, and
    // its results stay valid because the credentials now match.
    const merged = await apiCredentialProfilesStorage.createProfile({
      name: "merged",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://shared.example.com",
      apiKey: "sk-shared",
    })
    await seedProfileResults({ profileId: merged.id, modelIds: ["m-1"] })
    const survivor = await apiCredentialProfilesStorage.createProfile({
      name: "survivor",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://other.example.com",
      apiKey: "sk-other",
    })
    // The survivor's own results were measured with its previous credentials, so
    // they must not outlive the edit.
    await seedProfileResults({ profileId: survivor.id, modelIds: ["m-1"] })

    await apiCredentialProfilesStorage.updateProfile(survivor.id, {
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://shared.example.com",
      apiKey: "sk-shared",
    })

    expect(readStoredProfiles().map(({ id }: { id: string }) => id)).toEqual([
      survivor.id,
    ])
    await expect(listStoredTargetKeys()).resolves.toEqual([
      `profile:${survivor.id}`,
      `profile:${survivor.id}:model:m-1`,
    ])
  })

  it("moves merged results onto the survivor when an imported payload de-dupes", async () => {
    const existing = await apiCredentialProfilesStorage.createProfile({
      name: "existing",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://shared.example.com",
      apiKey: "sk-shared",
    })
    await seedProfileResults({ profileId: existing.id })

    await apiCredentialProfilesStorage.importConfig({
      version: 1,
      profiles: [
        { ...existing, updatedAt: existing.updatedAt - 1000 },
        {
          ...existing,
          id: "imported-winner",
          name: "imported",
          updatedAt: existing.updatedAt + 1000,
        },
      ],
      links: [],
      linkTombstones: [],
      lastUpdated: Date.now(),
    })

    await expect(listStoredTargetKeys()).resolves.toEqual([
      "profile:imported-winner",
    ])
  })

  it("does not rewrite verification results when a create needs no de-dupe", async () => {
    await apiCredentialProfilesStorage.createProfile({
      name: "first",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://first.example.com",
      apiKey: "sk-first",
    })
    const reconcileSpy = vi.spyOn(
      verificationResultHistoryStorage,
      "reconcileOwners",
    )

    await apiCredentialProfilesStorage.createProfile({
      name: "second",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://second.example.com",
      apiKey: "sk-second",
    })

    expect(reconcileSpy).not.toHaveBeenCalled()
    reconcileSpy.mockRestore()
  })

  it("does not reconcile verification results when removing an unused tag", async () => {
    await apiCredentialProfilesStorage.createProfile({
      name: "untagged",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://untagged.example.com",
      apiKey: "sk-untagged",
    })
    const reconcileSpy = vi.spyOn(
      verificationResultHistoryStorage,
      "reconcileOwners",
    )

    await expect(
      apiCredentialProfilesStorage.removeTagIdFromAllProfiles("unused-tag"),
    ).resolves.toEqual({ updatedProfiles: 0 })
    expect(reconcileSpy).not.toHaveBeenCalled()

    reconcileSpy.mockRestore()
  })

  it("normalizes duplicates in memory without writing on read", async () => {
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: "A",
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://a.example.com",
      apiKey: "sk-a",
    })
    // A payload with a duplicate identity, as an older build could leave behind.
    storageData.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      {
        version: 1,
        profiles: [
          profile,
          {
            ...profile,
            id: "legacy-twin",
            updatedAt: profile.updatedAt - 1000,
          },
        ],
        links: [],
        linkTombstones: [],
        lastUpdated: Date.now(),
      },
    )
    const before = structuredClone(
      storageData.get(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      ),
    )

    await apiCredentialProfilesStorage.listProfiles()
    await apiCredentialProfilesStorage.listProfileIdsOrThrow()
    await apiCredentialProfilesStorage.getConfig()

    expect(
      storageData.get(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      ),
    ).toEqual(before)
  })
})
