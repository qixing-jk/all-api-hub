import {
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import { coerceApiCredentialTelemetryConfig } from "~/services/apiCredentialProfiles/storage/configCodec"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import {
  getTelemetryAdapter,
  queryModels,
  runUsageAdapter,
  sourceForMode,
  type AdapterSuccess,
} from "~/services/apiCredentialProfiles/telemetry/adapters"
import {
  attemptFromError,
  createAttempt,
  prepareTelemetrySecrets,
} from "~/services/apiCredentialProfiles/telemetry/attempts"
import { TelemetryRefreshSupersededError } from "~/services/apiCredentialProfiles/telemetry/contracts"
import {
  hasTelemetryUsageData,
  resolveTelemetryModes,
} from "~/services/apiCredentialProfiles/telemetry/modePlanner"
import { buildTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotBuilder"
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
  const profile =
    await apiCredentialProfilesStorage.beginTelemetryRefresh(profileId)

  const config = coerceApiCredentialTelemetryConfig(profile.telemetryConfig, {
    baseUrl: profile.baseUrl,
  })
  const secrets = prepareTelemetrySecrets([
    profile.apiKey,
    ...Object.values(profile.requestHeaders ?? {}),
    config.customEndpoint?.bearerToken,
  ])
  const modes = resolveTelemetryModes(profile, config)
  const attempts: ApiCredentialTelemetryAttempt[] = []
  const models =
    config.mode !== API_CREDENTIAL_TELEMETRY_MODES.Disabled
      ? await queryModels(profile, attempts)
      : undefined
  let usageResult: AdapterSuccess | null = null

  for (const mode of modes) {
    try {
      const result = await runUsageAdapter(profile, mode, config)
      if (hasTelemetryUsageData(result.data)) {
        usageResult = result
        attempts.push(...(result.attempts ?? []))
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
    now: Date.now(),
    attempts,
    models,
    usageResult,
    context: {
      profileId: profile.id,
      baseUrl: usageResult?.reportingAuthority ?? profile.baseUrl,
      observedAt: Date.now(),
    },
  })

  const accepted = await apiCredentialProfilesStorage.updateTelemetrySnapshot(
    profile.id,
    snapshot,
    profile,
    usageResult?.data.balanceCoverage === FINANCIAL_COVERAGE.Complete
      ? FINANCIAL_ENUMERATION.Complete
      : FINANCIAL_ENUMERATION.Partial,
  )
  if (!accepted.accepted) throw new TelemetryRefreshSupersededError()
  if (!accepted.profile.telemetrySnapshot)
    throw new Error("Telemetry context changed before acceptance")
  return accepted.profile.telemetrySnapshot
}
