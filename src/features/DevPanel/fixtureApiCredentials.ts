/** Local API credential fixtures for the dev panel; no endpoint is contacted. */
import { Storage } from "@plasmohq/storage"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { API_CREDENTIAL_TELEMETRY_MODES } from "~/types/apiCredentialProfiles"
import { safeRandomUUID } from "~/utils/core/identifier"

import { DEV_ALLOWANCE_FIXTURES } from "./fixtureAllowanceTelemetry"

const storage = new Storage({ area: "local" })
const registryKey = STORAGE_KEYS.DEV_FIXTURE_API_CREDENTIAL_IDS
const registryLock = STORAGE_LOCKS.DEV_FIXTURE_API_CREDENTIALS

/** Read registered ids without treating storage failures as an empty registry. */
async function readIds(): Promise<string[]> {
  const raw = (await storage.get(registryKey)) as unknown
  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === "string" && id.length > 0)
    : []
}

/** Apply a registry mutation while holding the cross-context write lock. */
async function updateIds(change: (ids: string[]) => string[]): Promise<void> {
  await withExtensionStorageWriteLock(registryLock, async () => {
    const ids = await readIds()
    await storage.set(registryKey, Array.from(new Set(change(ids))))
  })
}

/** Intersect registered ids with profiles that still exist. */
async function liveIds(): Promise<string[]> {
  const [ids, profiles] = await Promise.all([
    readIds(),
    apiCredentialProfilesStorage.listProfiles(),
  ])
  const storedIds = new Set(profiles.map((profile) => profile.id))
  return ids.filter((id) => storedIds.has(id))
}

/** Count generated profiles still present in credential storage. */
export async function countDevFixtureApiCredentials(): Promise<number> {
  return (await liveIds()).length
}

/** Add harmless, varied credentials to exercise endpoint grouping and cards. */
export async function addDevFixtureApiCredentials(
  count: number,
): Promise<number> {
  const startingCount = await countDevFixtureApiCredentials()
  let added = 0

  for (let offset = 0; offset < count; offset += 1) {
    const serial = startingCount + offset + 1
    const endpoint = Math.floor((serial - 1) / 2) + 1
    const profile = await apiCredentialProfilesStorage.createProfile({
      name: `Dev Fixture Credential ${String(serial).padStart(2, "0")}`,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: `https://fixture-api-${endpoint}.example.invalid/v1`,
      apiKey: `dev-fixture-${safeRandomUUID()}`,
      notes:
        "Dev fixture: local display data; this endpoint cannot be reached.",
      telemetryConfig: { mode: API_CREDENTIAL_TELEMETRY_MODES.Disabled },
    })

    try {
      await updateIds((ids) => [...ids, profile.id])
    } catch (error) {
      await apiCredentialProfilesStorage.deleteProfile(profile.id)
      throw error
    }
    added += 1
  }

  return added
}

/** Remove only profiles whose ids were registered by this generator. */
export async function clearDevFixtureApiCredentials(): Promise<number> {
  const registeredIds = await readIds()
  const profiles = await apiCredentialProfilesStorage.listProfiles()
  const storedIds = new Set(profiles.map((profile) => profile.id))
  const ids = registeredIds.filter((id) => storedIds.has(id))
  const staleIds = new Set(registeredIds.filter((id) => !storedIds.has(id)))
  let deleted = 0
  for (const id of ids) {
    if (await apiCredentialProfilesStorage.deleteProfile(id)) {
      deleted += 1
    }
    await updateIds((registered) => registered.filter((item) => item !== id))
  }
  // Remove stale ids left after manual deletion.
  await updateIds((registered) => registered.filter((id) => !staleIds.has(id)))
  return deleted
}

/** One endpoint for every allowance fixture, so all cards render in one group. */
const ALLOWANCE_FIXTURE_BASE_URL =
  "https://fixture-allowance.example.invalid/v1"

/**
 * Deterministic key per fixture id.
 *
 * Profile identity is apiType + baseUrl + apiKey, so a fixed key makes adding
 * the same fixture twice refresh it in place instead of stacking duplicates.
 */
function allowanceFixtureApiKey(fixtureId: string): string {
  return `dev-allowance-${fixtureId}`
}

/**
 * Seed one profile per allowance state.
 *
 * Re-running refreshes the snapshots in place, which is what makes iterating on
 * the allowance UI bearable: reset times move forward instead of expiring, and
 * the library does not fill up with copies.
 *
 * Telemetry stays disabled so a refresh never contacts the unreachable fixture
 * host; pressing refresh in the credential library does replace these snapshots,
 * and re-running this action restores them.
 */
export async function addDevAllowanceFixtures(): Promise<number> {
  const now = Date.now()
  let seeded = 0

  for (const fixture of DEV_ALLOWANCE_FIXTURES) {
    const { profile, isNew } =
      await apiCredentialProfilesStorage.createProfileWithCreationStatus({
        name: fixture.name,
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: ALLOWANCE_FIXTURE_BASE_URL,
        apiKey: allowanceFixtureApiKey(fixture.id),
        notes: fixture.notes,
        telemetryConfig: { mode: API_CREDENTIAL_TELEMETRY_MODES.Disabled },
      })

    const snapshot = fixture.buildSnapshot(now)
    try {
      if (snapshot) {
        await apiCredentialProfilesStorage.updateTelemetrySnapshot(
          profile.id,
          snapshot,
        )
      }
      // The registry de-duplicates, so a refresh does not grow it.
      await updateIds((ids) => [...ids, profile.id])
    } catch (error) {
      // A reseed can reuse an existing profile, whose registry entry must survive.
      if (isNew) await apiCredentialProfilesStorage.deleteProfile(profile.id)
      throw error
    }
    seeded += 1
  }

  return seeded
}
