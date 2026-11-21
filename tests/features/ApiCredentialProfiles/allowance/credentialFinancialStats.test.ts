import { expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { buildAllowanceSignals } from "~/features/ApiCredentialProfiles/allowance/apiCredentialAllowance"
import { projectCredentialFinancialStats } from "~/features/ApiCredentialProfiles/allowance/credentialFinancialStats"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialProfile,
} from "~/types/apiCredentialProfiles"

it.each([CURRENCIES.USD, CURRENCIES.CNY])(
  "shows custom %s spend and the same-observation balance runway",
  (currency) => {
    const now = Date.now()
    const profile: ApiCredentialProfile = {
      id: "fixture",
      name: "Fixture",
      apiType: "openai-compatible",
      apiKey: "synthetic",
      baseUrl: "https://fixture.example",
      tagIds: [],
      notes: "",
      createdAt: now,
      updatedAt: now,
      telemetrySnapshot: {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: now,
        attempts: [],
        facts: normalizeTelemetryPatchToFacts(
          currency === CURRENCIES.USD
            ? { todayCostUsd: "3", balanceUsd: "30" }
            : {
                todayCostUsd: "3",
                balance: { amount: "30", currency },
                financialMapping: {
                  asset: { kind: ASSET_KINDS.Currency, code: currency },
                  role: BALANCE_ROLES.Available,
                  scope: "credential",
                },
              },
          API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
          {
            profileId: "fixture",
            baseUrl: "https://fixture.example",
            observedAt: now,
          },
        ),
      },
    }
    const { telemetryStats } = projectCredentialFinancialStats([profile], now)
    expect(telemetryStats.todayUsageUsd).toBeUndefined()
    expect(telemetryStats.reportedTodayCosts).toEqual([
      {
        id: "fixture",
        name: "Fixture",
        amount: { asset: { kind: "currency", code: currency }, value: "3" },
      },
    ])
    expect(
      buildAllowanceSignals(profile.telemetrySnapshot!.facts),
    ).toContainEqual(expect.objectContaining({ runwayDays: 10 }))
  },
)

it("rejects a usage window ending after the supplied observation clock", () => {
  const profile: ApiCredentialProfile = {
    id: "fixture",
    name: "Fixture",
    apiType: "openai-compatible",
    apiKey: "synthetic",
    baseUrl: "https://fixture.example",
    tagIds: [],
    notes: "",
    createdAt: 1000,
    updatedAt: 1000,
    telemetrySnapshot: {
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1000,
      attempts: [],
      facts: {
        usage: {
          todayCost: {
            value: "10",
            unit: {
              kind: MEASUREMENT_UNIT_KINDS.Money,
              currency: CURRENCIES.USD,
              decimalPlaces: 2,
            },
            status: OBSERVATION_STATUSES.Known,
            coverage: FINANCIAL_COVERAGE.Complete,
            observedAt: 1000,
            source: {
              adapter: "fixture",
              operation: "usage",
              contractVersion: "2",
              kind: EVIDENCE_KINDS.Reported,
            },
            scope: {
              subject: {
                kind: FINANCIAL_SUBJECT_KINDS.Credential,
                profileId: "fixture",
              },
              authority: "https://fixture.example",
              walletId: "wallet",
              keys: { kind: SCOPE_SELECTION_KINDS.All },
              groups: { kind: SCOPE_SELECTION_KINDS.All },
              models: { kind: SCOPE_SELECTION_KINDS.All },
              projects: { kind: SCOPE_SELECTION_KINDS.All },
            },
            window: { start: 1000, end: 2000, timeZone: "UTC" },
          },
        },
      },
    },
  }
  expect(
    projectCredentialFinancialStats([profile], 1500).telemetryStats
      .todayUsageUsd,
  ).toBeUndefined()
})
