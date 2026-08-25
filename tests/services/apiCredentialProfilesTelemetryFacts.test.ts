import { describe, expect, it } from "vitest"

import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetryFacts"
import {
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

describe("api credential telemetry facts", () => {
  it("preserves provider currency and cash semantics for native balances", () => {
    expect(
      normalizeTelemetryPatchToFacts(
        {
          balances: [{ amount: 250, currency: "JPY", isAvailable: true }],
        },
        API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance,
      ),
    ).toEqual({
      balances: [
        {
          amount: 250,
          unit: { kind: "money", currency: "JPY", decimalPlaces: 0 },
          semantics: "cash",
          isAvailable: true,
        },
      ],
    })
  })

  it("marks New API quota values as budget equivalents instead of cash", () => {
    expect(
      normalizeTelemetryPatchToFacts(
        { balanceUsd: 5, totalGrantedUsd: 10, totalUsedUsd: 5 },
        API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage,
      ),
    ).toEqual({
      balances: [
        {
          amount: 5,
          unit: {
            kind: "quota",
            code: "usd-equivalent",
            label: "USD-equivalent budget",
          },
          semantics: "budget-equivalent",
        },
      ],
      usage: {
        totalGranted: {
          value: 10,
          unit: {
            kind: "quota",
            code: "usd-equivalent",
            label: "USD-equivalent budget",
          },
        },
        totalUsed: {
          value: 5,
          unit: {
            kind: "quota",
            code: "usd-equivalent",
            label: "USD-equivalent budget",
          },
        },
      },
    })
  })

  it("maps provider quota windows to GLM credit facts", () => {
    expect(
      normalizeTelemetryPatchToFacts(
        {
          quota: {
            windows: [
              {
                type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour,
                unit: "provider",
                used: 25,
                limit: 100,
                remaining: 75,
                percentRemaining: 75,
              },
            ],
          },
        },
        API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota,
      ),
    ).toEqual({
      quota: {
        windows: [
          {
            type: API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES.FiveHour,
            unit: {
              kind: "quota",
              code: "glm-credit",
              label: "GLM credits",
            },
            used: 25,
            limit: 100,
            remaining: 75,
            remainingPercent: 75,
          },
        ],
      },
    })
  })
})
