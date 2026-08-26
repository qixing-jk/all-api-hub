import { describe, expect, it } from "vitest"

import { buildTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetrySnapshotBuilder"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

describe("api credential telemetry snapshot builder", () => {
  it("records model-only success as healthy", () => {
    const snapshot = buildTelemetrySnapshot({
      now: 123,
      attempts: [],
      models: { count: 1, preview: ["model"] },
    })

    expect(snapshot.health).toEqual({ status: SiteHealthStatus.Healthy })
    expect(snapshot.lastSuccessTime).toBe(123)
    expect(snapshot.facts?.models?.count).toBe(1)
  })

  it("marks an unavailable balance as insufficient", () => {
    const snapshot = buildTelemetrySnapshot({
      now: 123,
      attempts: [],
      usageResult: {
        source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
        data: { balance: { amount: 0, currency: "USD", isAvailable: false } },
      },
    })

    expect(snapshot.health).toMatchObject({
      status: SiteHealthStatus.Warning,
      reason: "insufficient-balance",
    })
    expect(snapshot.source).toBe(
      API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
    )
  })

  it("prioritizes custom endpoint errors when all probes fail", () => {
    const snapshot = buildTelemetrySnapshot({
      now: 123,
      attempts: [
        {
          source: API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling,
          endpoint: "/billing",
          status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
          message: "billing failed",
        },
        {
          source: API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
          endpoint: "/custom",
          status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
          message: "custom failed",
        },
      ],
    })

    expect(snapshot.lastError).toBe("custom failed")
    expect(snapshot.health.reason).toBeUndefined()
  })
})
