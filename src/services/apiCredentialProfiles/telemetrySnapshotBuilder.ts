import type { TelemetryPatch } from "~/services/apiCredentialProfiles/telemetryContracts"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetryFacts"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_HEALTH_REASONS,
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialModelTelemetry,
  type ApiCredentialTelemetryAttempt,
  type ApiCredentialTelemetryFacts,
  type ApiCredentialTelemetrySnapshot,
  type ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"

type TelemetryUsageResult = {
  source: ApiCredentialTelemetrySource
  data: TelemetryPatch
}

type BuildTelemetrySnapshotParams = {
  now: number
  attempts: ApiCredentialTelemetryAttempt[]
  models?: ApiCredentialModelTelemetry
  usageResult?: TelemetryUsageResult | null
}

/** Builds the persisted telemetry snapshot from completed read-only attempts. */
export function buildTelemetrySnapshot({
  now,
  attempts,
  models,
  usageResult,
}: BuildTelemetrySnapshotParams): ApiCredentialTelemetrySnapshot {
  const modelSucceeded = Boolean(models && models.count > 0)
  const usageSucceeded = Boolean(usageResult)
  const usageFacts: ApiCredentialTelemetryFacts = usageResult
    ? normalizeTelemetryPatchToFacts(usageResult.data, usageResult.source)
    : {}
  const usageUnavailable = Boolean(
    usageFacts.balances?.some((balance) => balance.isAvailable === false),
  )
  const customEndpointError = attempts.find(
    (attempt) =>
      attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error &&
      attempt.source ===
        API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
  )?.message
  const lastError =
    usageSucceeded || modelSucceeded
      ? undefined
      : customEndpointError ||
        attempts.find(
          (attempt) =>
            attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
        )?.message ||
        "No supported telemetry endpoint returned data"

  return {
    health:
      usageSucceeded || modelSucceeded
        ? usageUnavailable
          ? {
              status: SiteHealthStatus.Warning,
              reason:
                API_CREDENTIAL_TELEMETRY_HEALTH_REASONS.InsufficientBalance,
            }
          : { status: SiteHealthStatus.Healthy }
        : {
            status: SiteHealthStatus.Warning,
            reason: lastError,
          },
    lastSyncTime: now,
    ...(usageSucceeded || modelSucceeded ? { lastSuccessTime: now } : {}),
    ...(lastError ? { lastError } : {}),
    ...(usageResult?.source ? { source: usageResult.source } : {}),
    facts: {
      ...usageFacts,
      ...(models ? { models } : {}),
    },
    attempts,
  }
}
