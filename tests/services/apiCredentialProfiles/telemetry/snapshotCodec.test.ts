import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { MEASUREMENT_UNIT_KINDS } from "~/services/amounts/financialConstants"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotCodec"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

describe("api credential telemetry snapshot codec", () => {
  it("keeps historical quota balances and topped-up operands without changing their unit", () => {
    const snapshot = coerceTelemetrySnapshot({
      lastSyncTime: 2000,
      facts: {
        balances: [
          {
            amount: 50,
            unit: { kind: "quota", code: "credits", label: "Credits" },
            semantics: "legacy",
            toppedUpAmount: 45,
            status: "stale",
            observedAt: 1000,
          },
        ],
      },
    })!
    expect(snapshot.facts?.balances).toEqual([
      {
        amount: 50,
        unit: { kind: "quota", code: "credits", label: "Credits" },
        semantics: "legacy",
        toppedUpAmount: 45,
        status: "stale",
        observedAt: 1000,
      },
    ])
  })
  it.each([
    { displayScale: 0, displayLabel: " " },
    { displayScale: -1, displayLabel: 9 },
    { displayScale: Infinity, displayLabel: null },
  ])(
    "discards invalid display metadata without discarding native cost %j",
    (metadata) => {
      const snapshot = coerceTelemetrySnapshot({
        lastSyncTime: 2000,
        facts: {
          usage: {
            todayCost: {
              value: "250",
              unit: {
                kind: "quota",
                code: "credits",
                label: "Credits",
                ...metadata,
              },
            },
            todayRequests: { value: 3, unit: { kind: "count", code: 7 } },
          },
        },
      })!
      expect(snapshot.facts?.usage?.todayCost).toMatchObject({
        value: "250",
        unit: { kind: "quota", code: "credits", label: "Credits" },
      })
      expect(snapshot.facts?.usage?.todayCost?.unit).not.toHaveProperty(
        "displayScale",
      )
      expect(snapshot.facts?.usage?.todayCost?.unit).not.toHaveProperty(
        "displayLabel",
      )
      expect(snapshot.facts?.usage?.todayRequests).toBeUndefined()
    },
  )
  it("preserves membership-only quota facts", () => {
    expect(
      coerceTelemetrySnapshot({
        lastSyncTime: 123,
        health: { status: SiteHealthStatus.Healthy },
        facts: { quota: { windows: [], membershipLevel: "pro" } },
        attempts: [],
      })?.facts?.quota,
    ).toEqual({ windows: [], membershipLevel: "pro" })
  })

  it("filters invalid persisted facts while coercing valid numeric values", () => {
    const snapshot = coerceTelemetrySnapshot({
      lastSyncTime: "123",
      health: { status: "not-a-status", reason: "  degraded  " },
      source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
      attempts: [
        {
          source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
          endpoint: " /balance ",
          status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success,
          message: " ok ",
        },
        { source: "unknown", endpoint: "/bad", status: "error" },
        null,
      ],
      facts: {
        balances: [
          {
            amount: "4.5",
            unit: {
              kind: MEASUREMENT_UNIT_KINDS.Money,
              currency: CURRENCIES.USD,
              decimalPlaces: "2",
            },
            semantics: "cash",
            grantedAmount: "1",
            isAvailable: true,
          },
          {
            amount: "bad",
            unit: { kind: MEASUREMENT_UNIT_KINDS.Money },
            semantics: "cash",
          },
        ],
        quota: {
          windows: [
            {
              type: "weekly",
              unit: { kind: MEASUREMENT_UNIT_KINDS.Percent },
              remainingPercent: "75",
              resetTime: "1800000000000",
            },
            {
              type: "bad",
              unit: { kind: MEASUREMENT_UNIT_KINDS.Percent },
              remainingPercent: 5,
            },
          ],
        },
        usage: {
          todayCost: {
            value: "1.25",
            unit: {
              kind: MEASUREMENT_UNIT_KINDS.Money,
              currency: CURRENCIES.USD,
            },
          },
          todayRequests: {
            value: 3,
            unit: { kind: MEASUREMENT_UNIT_KINDS.Count, code: "requests" },
          },
          todayTokens: { upload: "10" },
          unlimited: false,
          expiresAt: "1800000000000",
        },
        models: { count: "2.9", preview: ["a", 2, "b"] },
      },
    })

    expect(snapshot).toEqual({
      health: { status: SiteHealthStatus.Unknown, reason: "degraded" },
      lastSyncTime: 123,
      source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
      attempts: [
        {
          source: API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
          endpoint: "/balance",
          status: API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success,
          message: "ok",
        },
      ],
      facts: {
        balances: [
          {
            amount: 4.5,
            unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
            semantics: "legacy",
            grantedAmount: 1,
            isAvailable: true,
          },
        ],
        quota: {
          windows: [
            {
              type: "weekly",
              unit: { kind: "percent" },
              remainingPercent: 75,
              resetTime: 1800000000000,
            },
          ],
        },
        usage: {
          todayCost: {
            value: "1.25",
            unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
          },
          todayRequests: {
            value: 3,
            unit: { kind: "count", code: "requests" },
          },
          todayTokens: {
            upload: 10,
            unit: { kind: "count", code: "tokens" },
          },
          unlimited: false,
          expiresAt: 1800000000000,
        },
        models: { count: 2, preview: ["a", "b"] },
      },
    })
  })

  it("migrates legacy flat telemetry by source and rejects unusable snapshots", () => {
    expect(coerceTelemetrySnapshot(null)).toBeUndefined()
    expect(coerceTelemetrySnapshot({ lastSyncTime: 0 })).toBeUndefined()

    expect(
      coerceTelemetrySnapshot({
        lastSyncTime: 10,
        source: API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage,
        health: { status: SiteHealthStatus.Healthy },
        balanceUsd: "5",
        todayCostUsd: "1",
        todayRequests: "2",
        todayTokens: { download: "4" },
        totalUsedUsd: "3",
        totalGrantedUsd: "10",
        totalAvailableUsd: "7",
        unlimitedQuota: true,
        expiresAt: "20",
        models: { count: 1, preview: ["model"] },
      }),
    ).toEqual({
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 10,
      source: API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage,
      facts: {
        balances: [
          {
            amount: 5,
            unit: {
              kind: "quota",
              code: "usd-equivalent",
              label: "USD-equivalent budget",
            },
            semantics: "legacy",
          },
        ],
        usage: {
          todayCost: {
            value: 1,
            unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
          },
          todayRequests: {
            value: 2,
            unit: { kind: "count", code: "requests" },
          },
          todayTokens: {
            download: 4,
            unit: { kind: "count", code: "tokens" },
          },
          totalUsed: {
            value: 3,
            unit: {
              kind: "quota",
              code: "usd-equivalent",
              label: "USD-equivalent budget",
            },
          },
          totalGranted: {
            value: 10,
            unit: {
              kind: "quota",
              code: "usd-equivalent",
              label: "USD-equivalent budget",
            },
          },
          totalAvailable: {
            value: 7,
            unit: {
              kind: "quota",
              code: "usd-equivalent",
              label: "USD-equivalent budget",
            },
          },
          unlimited: true,
          expiresAt: 20,
        },
        models: { count: 1, preview: ["model"] },
      },
      attempts: [],
    })
  })

  it("preserves total-only token facts without inventing split counters", () => {
    expect(
      coerceTelemetrySnapshot({
        lastSyncTime: 10,
        health: { status: SiteHealthStatus.Healthy },
        facts: {
          usage: { todayTokens: { total: "12" } },
        },
        attempts: [],
      })?.facts?.usage?.todayTokens,
    ).toEqual({ total: 12, unit: { kind: "count", code: "tokens" } })
  })
})
