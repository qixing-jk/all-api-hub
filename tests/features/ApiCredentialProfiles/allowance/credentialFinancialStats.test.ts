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
import type { ApiCredentialTelemetryAmount } from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialProfile,
} from "~/types/apiCredentialProfiles"

const CLOCK = Date.UTC(2026, 5, 1, 12)
it("uses captured quota spending metadata after the current mapping changes", () => {
  const profile = reportedCost({
    unit: {
      kind: "quota",
      code: "credits",
      label: "Raw",
      displayScale: 100,
      displayLabel: "Captured credits",
    },
  })
  profile.telemetryConfig = {
    mode: "customReadOnlyEndpoint",
    customEndpoint: {
      endpoint: "/usage",
      jsonPaths: { todayCostUsd: "cost" },
      financialMapping: {
        role: "available",
        scope: "credential",
        asset: {
          kind: "quota",
          id: "credits",
          label: "New label",
          displayScale: 10,
          displayLabel: "New credits",
        },
      },
    },
  }
  expect(
    projectCredentialFinancialStats([profile], CLOCK).telemetryStats
      .reportedTodayCosts[0]?.amount,
  ).toEqual({
    value: "3",
    asset: {
      kind: "quota",
      id: "credits",
      label: "Raw",
      displayScale: 100,
      displayLabel: "Captured credits",
    },
  })
})
it("keeps old quota units usable when captured display metadata is absent or the current mapping names a different asset", () => {
  const profile = reportedCost({
    unit: { kind: "quota", code: "credits", label: "Credits" },
  })
  profile.telemetryConfig = {
    mode: "customReadOnlyEndpoint",
    customEndpoint: {
      endpoint: "/usage",
      jsonPaths: { todayCostUsd: "cost" },
      financialMapping: {
        role: "available",
        scope: "credential",
        asset: {
          kind: "quota",
          id: "other",
          label: "Other",
          displayScale: 10,
          displayLabel: "Other",
        },
      },
    },
  }
  expect(
    projectCredentialFinancialStats([profile], CLOCK).telemetryStats
      .reportedTodayCosts[0]?.amount,
  ).toEqual({
    value: "3",
    asset: {
      kind: "quota",
      id: "credits",
      label: "Credits",
      displayScale: 1,
      displayLabel: "Credits",
    },
  })
  profile.telemetryConfig.customEndpoint!.financialMapping!.asset = {
    kind: "quota",
    id: "credits",
    label: "Raw",
    displayScale: 10,
    displayLabel: "Historical credits",
  }
  expect(
    projectCredentialFinancialStats([profile], CLOCK).telemetryStats
      .reportedTodayCosts[0]?.amount,
  ).toEqual({
    value: "3",
    asset: {
      kind: "quota",
      id: "credits",
      label: "Credits",
      displayScale: 10,
      displayLabel: "Historical credits",
    },
  })
})
function reportedCost(
  overrides: Partial<ApiCredentialTelemetryAmount> = {},
): ApiCredentialProfile {
  return {
    id: "reported",
    name: "Reported",
    baseUrl: "https://reported.example",
    apiKey: "synthetic",
    apiType: "openai-compatible",
    createdAt: 1,
    updatedAt: 1,
    tagIds: [],
    notes: "",
    telemetrySnapshot: {
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: CLOCK,
      attempts: [],
      facts: {
        usage: {
          todayCost: {
            value: "3",
            unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
            status: "known",
            observedAt: CLOCK,
            coverage: "complete",
            source: {
              kind: "reported",
              adapter: "fixture",
              operation: "usage",
              contractVersion: "1",
            },
            scope: {
              subject: { kind: "credential", profileId: "reported" },
              authority: "https://reported.example",
              walletId: "wallet",
              projects: { kind: "all" },
              keys: { kind: "all" },
              models: { kind: "all" },
              groups: { kind: "all" },
            },
            window: { start: CLOCK - 3600000, end: CLOCK, timeZone: "UTC" },
            ...overrides,
          },
        },
      },
    },
  }
}

it("sums complete distinct-wallet spending only for a common reporting interval", () => {
  const first = reportedCost()
  const second = reportedCost({ value: "2" })
  second.id = "second"
  second.telemetrySnapshot!.facts!.usage!.todayCost!.scope!.walletId = "other"
  expect(
    projectCredentialFinancialStats([first, second], CLOCK).telemetryStats
      .todayUsageUsd,
  ).toBe("5")
  second.telemetrySnapshot!.facts!.usage!.todayCost!.scope!.walletId = "wallet"
  expect(
    projectCredentialFinancialStats([first, second], CLOCK).telemetryStats
      .todayUsageUsd,
  ).toBeUndefined()
})

it.each([
  {
    unit: { kind: "crypto", id: "XNO" } as const,
    asset: { kind: "crypto", id: "XNO" },
  },
  {
    unit: {
      kind: "quota",
      code: "credits",
      label: "Raw",
      displayScale: 100,
      displayLabel: "Credits",
    } as const,
    asset: {
      kind: "quota",
      id: "credits",
      label: "Raw",
      displayScale: 100,
      displayLabel: "Credits",
    },
  },
])(
  "keeps native $unit.kind spending rows outside the USD aggregate",
  ({ unit, asset }) => {
    const result = projectCredentialFinancialStats(
      [reportedCost({ unit })],
      CLOCK,
    )
    expect(result.telemetryStats.reportedTodayCosts[0]?.amount).toEqual({
      asset,
      value: "3",
    })
    expect(result.telemetryStats.todayUsageUsd).toBeUndefined()
  },
)

it("keeps historical unverified USD spending readable without assigning that unit to new custom data", () => {
  const source = {
    kind: "legacy",
    adapter: "customReadOnlyEndpoint",
    operation: "legacy",
    contractVersion: "1",
  } as const
  expect(
    projectCredentialFinancialStats(
      [reportedCost({ unit: { kind: "unknown" }, source })],
      CLOCK,
    ).telemetryStats.reportedTodayCosts[0]?.amount.asset,
  ).toEqual({ kind: "currency", code: "USD" })
  expect(
    projectCredentialFinancialStats(
      [
        reportedCost({
          unit: { kind: "unknown" },
          source: { ...source, kind: "reported" },
        }),
      ],
      CLOCK,
    ).telemetryStats.reportedTodayCosts,
  ).toEqual([])
})

it.each([
  { status: "stale" as const },
  { value: "invalid" },
  { unit: { kind: "count", code: "requests" } as const },
  { window: { start: CLOCK - 3600000, end: CLOCK, timeZone: "Invalid/Zone" } },
  { window: { start: CLOCK - 86400000, end: CLOCK, timeZone: "UTC" } },
  { window: undefined, observedAt: CLOCK + 1 },
  { window: undefined, observedAt: CLOCK - 86400000 },
])(
  "excludes stale, invalid or out-of-day cost observations %j",
  (overrides) => {
    expect(
      projectCredentialFinancialStats([reportedCost(overrides)], CLOCK)
        .telemetryStats.reportedTodayCosts,
    ).toEqual([])
  },
)

it("leaves overflowed spending totals unavailable without losing the reported rows", () => {
  const first = reportedCost({ value: "9".repeat(256) })
  const second = reportedCost({ value: "1" })
  second.telemetrySnapshot!.facts!.usage!.todayCost!.scope!.walletId = "other"
  const result = projectCredentialFinancialStats(
    [first, second],
    CLOCK,
  ).telemetryStats
  expect(result.reportedTodayCosts).toHaveLength(2)
  expect(result.todayUsageUsd).toBeUndefined()
})

it("keeps route-restricted spending in its own row and excludes it from the all-scope total", () => {
  const profile = reportedCost()
  profile.telemetrySnapshot!.facts!.usage!.todayCost!.scope!.routes = {
    kind: "restricted",
    ids: ["chat"],
  }
  expect(
    projectCredentialFinancialStats([profile], CLOCK).telemetryStats
      .todayUsageUsd,
  ).toBeUndefined()
  expect(
    projectCredentialFinancialStats([profile], CLOCK).telemetryStats
      .reportedTodayCosts[0]?.amount.value,
  ).toBe("3")
})

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
          {
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
