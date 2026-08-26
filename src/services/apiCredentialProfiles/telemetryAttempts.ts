import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiCredentialTelemetryAttempt } from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES } from "~/types/apiCredentialProfiles"

const REDACTED_QUERY_VALUE = "[REDACTED]"

export class TelemetryEndpointError extends Error {
  constructor(
    message: string,
    public endpoint: string,
    public unsupported: boolean = false,
  ) {
    super(message)
    this.name = "TelemetryEndpointError"
  }
}

/**
 * Redacts sensitive query values before attempts are persisted with snapshots.
 */
export function sanitizeTelemetryEndpoint(
  endpoint: string,
  secrets: string[],
): string {
  const redactedEndpoint = toSanitizedErrorSummary(endpoint, secrets)
  try {
    const parsed = new URL(redactedEndpoint, "https://telemetry.local")

    for (const key of Array.from(parsed.searchParams.keys())) {
      parsed.searchParams.set(key, REDACTED_QUERY_VALUE)
    }

    return `${parsed.pathname}${parsed.search}`
  } catch {
    return redactedEndpoint
  }
}

/**
 * Removes duplicate secrets and orders overlapping values for full redaction.
 */
export function prepareTelemetrySecrets(
  secrets: Array<string | undefined>,
): string[] {
  return Array.from(
    new Set(secrets.filter((secret): secret is string => !!secret)),
  ).sort((first, second) => second.length - first.length)
}

/**
 * Creates a normalized telemetry attempt entry for the profile snapshot.
 * Messages are persisted with snapshots, so they are redacted here as well;
 * callers that pre-sanitize remain unaffected because redaction is idempotent.
 */
export function createAttempt(
  source: ApiCredentialTelemetryAttempt["source"],
  endpoint: string,
  status: ApiCredentialTelemetryAttempt["status"],
  message?: string,
  secrets: string[] = [],
): ApiCredentialTelemetryAttempt {
  return {
    source,
    endpoint: sanitizeTelemetryEndpoint(endpoint, secrets),
    status,
    ...(message ? { message: toSanitizedErrorSummary(message, secrets) } : {}),
  }
}

/**
 * Converts thrown endpoint errors into sanitized telemetry attempt entries.
 */
export function attemptFromError(
  source: ApiCredentialTelemetryAttempt["source"],
  endpoint: string,
  error: unknown,
  secrets: string[],
): ApiCredentialTelemetryAttempt {
  if (error instanceof TelemetryEndpointError) {
    return createAttempt(
      source,
      error.endpoint || endpoint,
      error.unsupported
        ? API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported
        : API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
      toSanitizedErrorSummary(error, secrets),
      secrets,
    )
  }

  return createAttempt(
    source,
    endpoint,
    API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
    toSanitizedErrorSummary(error, secrets),
    secrets,
  )
}
