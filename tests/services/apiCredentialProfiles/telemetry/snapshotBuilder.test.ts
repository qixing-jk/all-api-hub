import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { buildTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotBuilder"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

describe("api credential telemetry snapshot builder", () => {
  it("records model-only success as healthy without refreshing the usage success clock", () => {
    const snapshot = buildTelemetrySnapshot({
      context: {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
      now: 123,
      attempts: [],
      models: { count: 1, preview: ["model"] },
    })

    expect(snapshot.health).toEqual({ status: SiteHealthStatus.Healthy })
    expect(snapshot.schemaVersion).toBe(2)
    expect(snapshot.lastSyncTime).toBe(123)
    expect(snapshot.lastSuccessTime).toBeUndefined()
    expect(snapshot.facts?.models?.count).toBe(1)
    expect(snapshot.facts?.balanceSnapshot).toBeUndefined()
  })

  it("marks an unavailable balance as insufficient", () => {
    const snapshot = buildTelemetrySnapshot({
      now: 123,
      attempts: [],
      usageResult: {
        source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
        data: {
          balance: { amount: 0, currency: CURRENCIES.USD, isAvailable: false },
        },
      },
      context: {
        profileId: "actual-profile",
        baseUrl: "https://api.deepseek.com",
        observedAt: 123,
      },
    })

    expect(snapshot.health).toMatchObject({
      status: SiteHealthStatus.Warning,
      reason: "insufficient-balance",
    })
    expect(snapshot.source).toBe(
      API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
    )
    expect(snapshot.schemaVersion).toBe(2)
    expect(snapshot.lastSuccessTime).toBe(123)
    expect(snapshot.facts?.balanceSnapshot).toMatchObject({
      schemaVersion: 2,
      capturedAt: 123,
      subject: { kind: "credential", profileId: "actual-profile" },
      positions: [
        {
          id: "available:USD",
          amount: { status: "known", value: "0", observedAt: 123 },
          asset: { kind: "currency", code: "USD" },
          scope: {
            subject: { kind: "credential", profileId: "actual-profile" },
            authority: "https://api.deepseek.com",
          },
        },
        {
          id: "available:USD:granted",
          parentId: "available:USD",
          relation: "component",
          funding: "granted",
          amount: {
            status: "unavailable",
            reason: "invalid-or-missing-amount",
          },
          asset: { kind: "currency", code: "USD" },
          scope: {
            subject: { kind: "credential", profileId: "actual-profile" },
            authority: "https://api.deepseek.com",
          },
        },
        {
          id: "available:USD:purchased",
          parentId: "available:USD",
          relation: "component",
          funding: "purchased",
          amount: {
            status: "unavailable",
            reason: "invalid-or-missing-amount",
          },
          asset: { kind: "currency", code: "USD" },
          scope: {
            subject: { kind: "credential", profileId: "actual-profile" },
            authority: "https://api.deepseek.com",
          },
        },
      ],
    })
  })

  it("prioritizes custom endpoint errors when all probes fail", () => {
    const snapshot = buildTelemetrySnapshot({
      context: {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
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
    expect(snapshot.lastSuccessTime).toBeUndefined()
  })

  it("preserves usage failure even when the model catalogue succeeds", () => {
    const snapshot = buildTelemetrySnapshot({
      context: {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
      now: 456,
      models: { count: 1, preview: ["model"] },
      attempts: [
        {
          source: API_CREDENTIAL_TELEMETRY_SOURCES.Models,
          endpoint: "/models",
          status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success,
        },
        {
          source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
          endpoint: "/user/balance",
          status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error,
          message: "balance failed",
        },
      ],
    })
    expect(snapshot.health).toEqual({ status: SiteHealthStatus.Warning })
    expect(snapshot.lastError).toBe("balance failed")
    expect(snapshot.lastSuccessTime).toBeUndefined()
    expect(snapshot.facts).toEqual({ models: { count: 1, preview: ["model"] } })
  })
})
