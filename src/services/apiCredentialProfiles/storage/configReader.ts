import { Storage } from "@plasmohq/storage"

import { coerceApiCredentialProfilesConfig } from "~/services/apiCredentialProfiles/storage/configCodec"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"

const storage = new Storage({ area: "local" })

/** Reads and normalizes the persisted snapshot without writing or swallowing failures. */
export async function readApiCredentialProfilesConfig(): Promise<ApiCredentialProfilesConfig> {
  const raw = await storage.get(
    API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  return coerceApiCredentialProfilesConfig(raw)
}

/**
 * Lists live profile owners while preserving the difference between unreadable and empty.
 * History retention must skip an ownership check when this read fails.
 */
export async function listApiCredentialProfileIdsOrThrow(): Promise<string[]> {
  const config = await readApiCredentialProfilesConfig()
  return config.profiles.map((profile) => profile.id)
}
