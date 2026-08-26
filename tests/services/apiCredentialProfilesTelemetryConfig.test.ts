import { describe, expect, it } from "vitest"

import {
  API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS,
  coerceApiCredentialTelemetryJsonPathMap,
  isSupportedApiCredentialTelemetryEndpoint,
  resolveApiCredentialTelemetryRequestTarget,
} from "~/services/apiCredentialProfiles/telemetryConfig"

describe("api credential telemetry config", () => {
  it("keeps the canonical JSON path field list complete and ordered", () => {
    expect(API_CREDENTIAL_TELEMETRY_JSON_PATH_FIELDS).toEqual([
      "balanceUsd",
      "todayCostUsd",
      "todayRequests",
      "todayPromptTokens",
      "todayCompletionTokens",
      "totalUsedUsd",
      "totalGrantedUsd",
      "totalAvailableUsd",
      "expiresAt",
    ])
  })

  it("trims valid paths and drops empty or malformed mappings", () => {
    expect(
      coerceApiCredentialTelemetryJsonPathMap({
        balanceUsd: "  account . balance ",
        todayCostUsd: " ",
        todayRequests: "usage..requests",
        expiresAt: "expires.at",
      }),
    ).toEqual({
      balanceUsd: "account.balance",
      expiresAt: "expires.at",
    })
  })

  it("resolves root-relative endpoints against the profile origin", () => {
    expect(
      resolveApiCredentialTelemetryRequestTarget(
        "https://example.invalid/api/v1",
        "/readonly/usage?window=today",
      ),
    ).toEqual({
      baseUrl: "https://example.invalid",
      endpoint: "/readonly/usage?window=today",
      isCrossOrigin: false,
    })
  })

  it("accepts explicit HTTP(S) cross-origin targets but rejects unsafe schemes", () => {
    expect(
      isSupportedApiCredentialTelemetryEndpoint(
        "https://example.invalid",
        "https://telemetry.example.invalid/usage",
      ),
    ).toBe(true)
    expect(
      isSupportedApiCredentialTelemetryEndpoint(
        "https://example.invalid",
        "//telemetry.example.invalid/usage",
      ),
    ).toBe(false)
    expect(
      isSupportedApiCredentialTelemetryEndpoint(
        "https://example.invalid",
        "ftp://telemetry.example.invalid/usage",
      ),
    ).toBe(false)
  })
})
