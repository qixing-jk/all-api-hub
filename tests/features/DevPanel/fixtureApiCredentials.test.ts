import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEV_ALLOWANCE_FIXTURES } from "~/features/DevPanel/fixtureAllowanceTelemetry"
import {
  addDevAllowanceFixtures,
  addDevFixtureApiCredentials,
  clearDevFixtureApiCredentials,
  countDevFixtureApiCredentials,
} from "~/features/DevPanel/fixtureApiCredentials"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const { createProfile, deleteProfile, listProfiles, updateTelemetrySnapshot } =
  vi.hoisted(() => ({
    createProfile: vi.fn(),
    deleteProfile: vi.fn(),
    listProfiles: vi.fn(),
    updateTelemetrySnapshot: vi.fn(),
  }))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile,
      deleteProfile,
      listProfiles,
      updateTelemetrySnapshot,
    },
  }),
)

const storage = new Map<string, unknown>()
let storageSetShouldThrow = false
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return storage.get(key)
    }
    async set(key: string, value: unknown) {
      if (storageSetShouldThrow) throw new Error("registry unavailable")
      storage.set(key, value)
    }
  },
}))

describe("dev fixture API credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    storageSetShouldThrow = false
    listProfiles.mockResolvedValue([])
    createProfile.mockImplementation(async (input) => ({
      ...input,
      id: `fixture-${input.name}`,
    }))
    deleteProfile.mockResolvedValue(true)
  })

  it("creates local-only profiles across endpoint groups and records their ids", async () => {
    await expect(addDevFixtureApiCredentials(5)).resolves.toBe(5)

    const inputs = createProfile.mock.calls.map(([input]) => input)
    expect(inputs).toHaveLength(5)
    expect(new Set(inputs.map((input) => input.baseUrl)).size).toBeGreaterThan(
      1,
    )
    expect(inputs.every((input) => input.baseUrl.includes(".invalid"))).toBe(
      true,
    )
    expect(
      inputs.every((input) => input.telemetryConfig.mode === "disabled"),
    ).toBe(true)
    expect(
      storage.get(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS),
    ).toHaveLength(5)
  })

  it("counts and clears only registered profiles, including when names change", async () => {
    storage.set(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS, [
      "fixture-1",
      "missing",
    ])
    listProfiles.mockResolvedValue([
      { id: "fixture-1", name: "Renamed by user" },
      { id: "real-1", name: "Dev Fixture 01" },
    ])

    await expect(countDevFixtureApiCredentials()).resolves.toBe(1)
    await expect(clearDevFixtureApiCredentials()).resolves.toBe(1)
    expect(deleteProfile).toHaveBeenCalledExactlyOnceWith("fixture-1")
    expect(storage.get(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS)).toEqual([])
  })

  it("retains a failed deletion in the registry for retry", async () => {
    storage.set(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS, ["fixture-1"])
    listProfiles.mockResolvedValue([{ id: "fixture-1" }])
    deleteProfile.mockRejectedValueOnce(new Error("storage unavailable"))

    await expect(clearDevFixtureApiCredentials()).rejects.toThrow(
      "storage unavailable",
    )
    expect(storage.get(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS)).toEqual([
      "fixture-1",
    ])
  })

  it("rolls back a new profile if its id cannot be registered", async () => {
    storageSetShouldThrow = true

    await expect(addDevFixtureApiCredentials(1)).rejects.toThrow(
      "registry unavailable",
    )
    expect(deleteProfile).toHaveBeenCalledExactlyOnceWith(
      "fixture-Dev Fixture Credential 01",
    )
  })
})

describe("dev allowance fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    storageSetShouldThrow = false
    listProfiles.mockResolvedValue([])
    createProfile.mockImplementation(async (input) => ({
      ...input,
      id: `fixture-${input.apiKey}`,
    }))
    deleteProfile.mockResolvedValue(true)
    updateTelemetrySnapshot.mockImplementation(async (id) => ({ id }))
  })

  it("seeds one credential per allowance state and records them for clearing", async () => {
    await expect(addDevAllowanceFixtures()).resolves.toBe(
      DEV_ALLOWANCE_FIXTURES.length,
    )

    const inputs = createProfile.mock.calls.map(([input]) => input)
    expect(inputs).toHaveLength(DEV_ALLOWANCE_FIXTURES.length)
    expect(new Set(inputs.map((input) => input.baseUrl)).size).toBe(1)
    expect(inputs.every((input) => input.baseUrl.includes(".invalid"))).toBe(
      true,
    )
    expect(
      inputs.every((input) => input.telemetryConfig.mode === "disabled"),
    ).toBe(true)
    expect(
      storage.get(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS),
    ).toHaveLength(DEV_ALLOWANCE_FIXTURES.length)

    // The unmonitored state is the point of one fixture, so it seeds no snapshot.
    const snapshotsWritten = updateTelemetrySnapshot.mock.calls.length
    expect(snapshotsWritten).toBe(DEV_ALLOWANCE_FIXTURES.length - 1)

    listProfiles.mockResolvedValue(
      inputs.map((input) => ({ ...input, id: `fixture-${input.apiKey}` })),
    )
    await expect(clearDevFixtureApiCredentials()).resolves.toBe(
      DEV_ALLOWANCE_FIXTURES.length,
    )
  })

  it("keys each fixture deterministically so re-running refreshes in place", async () => {
    await addDevAllowanceFixtures()
    const firstKeys = createProfile.mock.calls.map(([input]) => input.apiKey)

    createProfile.mockClear()
    await addDevAllowanceFixtures()
    const secondKeys = createProfile.mock.calls.map(([input]) => input.apiKey)

    expect(secondKeys).toEqual(firstKeys)
    // Re-running refreshes the countdowns rather than stacking duplicates.
    expect(
      storage.get(STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS),
    ).toHaveLength(DEV_ALLOWANCE_FIXTURES.length)
  })

  it("rolls back a fixture when its snapshot cannot be written", async () => {
    updateTelemetrySnapshot.mockRejectedValue(
      new Error("Invalid telemetry snapshot."),
    )

    await expect(addDevAllowanceFixtures()).rejects.toThrow(
      "Invalid telemetry snapshot.",
    )
    expect(deleteProfile).toHaveBeenCalledTimes(1)
  })
})
