import { Storage } from "@plasmohq/storage"

import {
  assertSupportedApiCredentialProfilesConfigVersion,
  coerceApiCredentialProfilesConfig,
  coerceTelemetryRefreshGeneration,
} from "~/services/apiCredentialProfiles/storage/configCodec"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"

const storage = new Storage({ area: "local" })

/** Explicit replacement reads the admission clock without decoding corrupt financial data. */
export async function readApiCredentialProfilesTelemetryGeneration(): Promise<number> {
  const raw = await storage.get<unknown>(
    API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
  )
  assertSupportedApiCredentialProfilesConfigVersion(raw)
  if (raw === undefined) return 0
  const profiles =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).profiles
      : undefined
  if (!Array.isArray(profiles))
    throw new Error("Invalid API credential profiles config")
  return Math.max(
    0,
    ...profiles.map((profile: unknown) => {
      const generation =
        profile && typeof profile === "object"
          ? (profile as Record<string, unknown>).telemetryRefreshGeneration
          : undefined
      return generation === undefined
        ? 0
        : coerceTelemetryRefreshGeneration(generation)
    }),
  )
}

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
