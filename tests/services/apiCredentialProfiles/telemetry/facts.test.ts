import { describe, expect, it } from "vitest"

import {
  normalizeTelemetryPatchToFacts,
  selectTelemetryBalances,
} from "~/services/apiCredentialProfiles/telemetry/facts"

describe("api credential telemetry facts", () => {
  it("preserves provider currency without calling a mixed wallet cash", () => {
    const facts = normalizeTelemetryPatchToFacts(
      { balances: [{ amount: 250, currency: "JPY", isAvailable: true }] },
      "deepSeekBalance",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(facts.balanceSnapshot?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "JPY" },
      cashClassification: "unknown",
      amount: { value: "250" },
    })
    expect(selectTelemetryBalances(facts)[0]).toMatchObject({
      amount: 250,
      unit: { kind: "money", currency: "JPY", decimalPlaces: 0 },
      semantics: "provider-wallet",
    })
  })
  it("does not infer provider availability from a reported balance", () => {
    const balance = selectTelemetryBalances(
      normalizeTelemetryPatchToFacts(
        { balance: { amount: 3, currency: "CNY" } },
        "kimiOpenPlatformBalance",
        {
          profileId: "fixture",
          baseUrl: "https://fixture.example",
          observedAt: 1000,
        },
      ),
    )[0]
    expect(balance).toMatchObject({
      amount: 3,
      unit: { kind: "money", currency: "CNY" },
      semantics: "provider-wallet",
    })
    expect(balance).not.toHaveProperty("isAvailable")
  })
  it("retains undocumented flattened USD values as legacy with unknown asset", () => {
    const facts = normalizeTelemetryPatchToFacts(
      { balanceUsd: 5 },
      "newApiTokenUsage",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(facts.balanceSnapshot?.positions[0]).toMatchObject({
      asset: { kind: "unknown" },
      amount: { value: "5", source: { kind: "legacy" } },
    })
  })
  it("keeps the GLM quota unit and observation source", () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        quota: {
          windows: [
            {
              type: "fiveHour",
              unit: "provider",
              used: 25,
              limit: 100,
              remaining: 75,
              percentRemaining: 75,
            },
          ],
        },
      },
      "glmQuota",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    expect(facts.quota?.windows[0]).toMatchObject({
      type: "fiveHour",
      unit: { kind: "quota", code: "glm-credit", label: "GLM credits" },
      remaining: 75,
      remainingPercent: 75,
      source: { adapter: "glmQuota" },
    })
  })
})
