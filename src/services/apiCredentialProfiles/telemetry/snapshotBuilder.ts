import type { TelemetryPatch } from "~/services/apiCredentialProfiles/telemetry/contracts"
import {
  normalizeTelemetryPatchToFacts,
  type TelemetryObservationContext,
} from "~/services/apiCredentialProfiles/telemetry/facts"
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
  attempts?: ApiCredentialTelemetryAttempt[]
}

type BuildTelemetrySnapshotParams = {
  now: number
  attempts: ApiCredentialTelemetryAttempt[]
  models?: ApiCredentialModelTelemetry
  usageResult?: TelemetryUsageResult | null
  context: TelemetryObservationContext
}

/** Builds the persisted telemetry snapshot from completed read-only attempts. */
export function buildTelemetrySnapshot({
  now,
  attempts,
  models,
  usageResult,
  context,
}: BuildTelemetrySnapshotParams): ApiCredentialTelemetrySnapshot {
  const modelSucceeded = Boolean(models && models.count > 0)
  const usageSucceeded = Boolean(usageResult)
  const partialFailure = usageResult?.attempts?.find(
    (attempt) =>
      attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
  )
  const usageFacts: ApiCredentialTelemetryFacts = usageResult
    ? normalizeTelemetryPatchToFacts(
        usageResult.data,
        usageResult.source,
        context,
      )
    : {}
  const usageUnavailable = Boolean(
    usageResult?.data.availability === false ||
    usageResult?.data.balances?.some(
      (balance) => balance.isAvailable === false,
    ) ||
    usageResult?.data.balance?.isAvailable === false,
  )
  const customEndpointError = attempts.find(
    (attempt) =>
      attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error &&
      attempt.source ===
        API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
  )?.message
  const lastError =
    partialFailure?.message ??
    (usageSucceeded
      ? undefined
      : customEndpointError ||
        attempts.find(
          (attempt) =>
            attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
        )?.message ||
        undefined)

  return {
    schemaVersion: 2,
    health: partialFailure
      ? { status: SiteHealthStatus.Warning }
      : usageSucceeded ||
          (modelSucceeded &&
            !attempts.some(
              (attempt) =>
                attempt.source !== API_CREDENTIAL_TELEMETRY_SOURCES.Models,
            ))
        ? usageUnavailable
          ? {
              status: SiteHealthStatus.Warning,
              reason:
                API_CREDENTIAL_TELEMETRY_HEALTH_REASONS.InsufficientBalance,
            }
          : { status: SiteHealthStatus.Healthy }
        : { status: SiteHealthStatus.Warning },
    lastSyncTime: now,
    ...(usageSucceeded ? { lastSuccessTime: now } : {}),
    ...(lastError ? { lastError } : {}),
    ...(usageResult?.source ? { source: usageResult.source } : {}),
    facts: {
      ...usageFacts,
      ...(models ? { models } : {}),
    },
    attempts,
  }
}
