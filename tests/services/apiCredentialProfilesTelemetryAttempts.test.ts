import { describe, expect, it } from "vitest"

import {
  attemptFromError,
  createAttempt,
  prepareTelemetrySecrets,
  sanitizeTelemetryEndpoint,
  TelemetryEndpointError,
} from "~/services/apiCredentialProfiles/telemetryAttempts"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

describe("api credential telemetry attempts", () => {
  it("orders overlapping secrets longest-first and redacts query values", () => {
    const secrets = prepareTelemetrySecrets(["token", "token-extra", "token"])
    expect(secrets).toEqual(["token-extra", "token"])
    expect(
      sanitizeTelemetryEndpoint(
        "/usage?api_key=token-extra&window=today",
        secrets,
      ),
    ).toBe("/usage?api_key=%5BREDACTED%5D&window=%5BREDACTED%5D")
  })

  it("keeps attempt endpoint and status separate from sanitized diagnostics", () => {
    expect(
      createAttempt(
        API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
        "/usage?secret=token",
        API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
        "request failed: token",
        ["token"],
      ),
    ).toEqual({
      source: API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
      endpoint: "/usage?secret=%5BREDACTED%5D",
      status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
      message: "request failed: token",
    })
  })

  it("maps unsupported endpoint errors to unsupported attempts", () => {
    const error = new TelemetryEndpointError("HTTP 405", "/usage", true)
    expect(
      attemptFromError(
        API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage,
        "/usage",
        error,
        [],
      ),
    ).toMatchObject({
      source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage,
      endpoint: "/usage",
      status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported,
    })
  })
})
