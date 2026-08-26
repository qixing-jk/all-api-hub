import {
  apiCredentialProfilesStorage,
  coerceApiCredentialTelemetryConfig,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  getTelemetryAdapter,
  queryModels,
  runUsageAdapter,
  sourceForMode,
  type AdapterSuccess,
} from "~/services/apiCredentialProfiles/telemetryAdapters"
import {
  attemptFromError,
  createAttempt,
  prepareTelemetrySecrets,
} from "~/services/apiCredentialProfiles/telemetryAttempts"
import {
  hasTelemetryUsageData,
  resolveTelemetryModes,
} from "~/services/apiCredentialProfiles/telemetryModePlanner"
import { buildTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetrySnapshotBuilder"
import type {
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_MODES,
} from "~/types/apiCredentialProfiles"

/**
 * Refreshes and persists telemetry for one API credential profile.
 */
export async function refreshApiCredentialProfileTelemetry(
  profileId: string,
): Promise<ApiCredentialTelemetrySnapshot> {
  const profile = await apiCredentialProfilesStorage.getProfileById(profileId)
  if (!profile) {
    throw new Error("Profile not found.")
  }

  const config = coerceApiCredentialTelemetryConfig(profile.telemetryConfig, {
    baseUrl: profile.baseUrl,
  })
  const secrets = prepareTelemetrySecrets([
    profile.apiKey,
    config.customEndpoint?.bearerToken,
  ])
  const modes = resolveTelemetryModes(profile, config)
  const attempts: ApiCredentialTelemetryAttempt[] = []
  const now = Date.now()
  const models =
    modes.length > 0 ? await queryModels(profile, attempts) : undefined
  let usageResult: AdapterSuccess | null = null

  for (const mode of modes) {
    try {
      const result = await runUsageAdapter(profile, mode, config)
      if (hasTelemetryUsageData(result.data)) {
        usageResult = result
        attempts.push(
          createAttempt(
            result.source,
            result.endpoint,
            API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success,
            "Fetched usage",
            secrets,
          ),
        )
        break
      }

      attempts.push(
        createAttempt(
          result.source,
          result.endpoint,
          API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported,
          "No usage fields returned",
          secrets,
        ),
      )
    } catch (error) {
      const endpoint =
        mode === API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint
          ? config.customEndpoint?.endpoint || "custom"
          : getTelemetryAdapter(mode).defaultEndpoint
      attempts.push(
        attemptFromError(sourceForMode(mode), endpoint, error, secrets),
      )
    }
  }

  const snapshot = buildTelemetrySnapshot({
    now,
    attempts,
    models,
    usageResult,
  })

  await apiCredentialProfilesStorage.updateTelemetrySnapshot(
    profile.id,
    snapshot,
  )
  return snapshot
}
