/** Local API credential fixtures for the dev panel; no endpoint is contacted. */
import { Storage } from "@plasmohq/storage"

import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { API_CREDENTIAL_TELEMETRY_MODES } from "~/types/apiCredentialProfiles"
import { safeRandomUUID } from "~/utils/core/identifier"

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
