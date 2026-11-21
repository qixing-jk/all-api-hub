import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { ApiCredentialProfileQuotaMeters } from "~/features/ApiCredentialProfiles/allowance/ApiCredentialProfileQuotaMeters"
import { ApiCredentialProfileTelemetryDetails } from "~/features/ApiCredentialProfiles/allowance/ApiCredentialProfileTelemetryDetails"
import en from "~/locales/en/apiCredentialProfiles.json"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  EVIDENCE_KINDS,
  FINANCIAL_OBSERVATION_REASONS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { acceptTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/acceptance"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import {
  mapCustomJson,
  parseDeepSeekBalance,
} from "~/services/apiCredentialProfiles/telemetry/parsers"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/snapshotCodec"
import { SiteHealthStatus } from "~/types"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

describe("credential financial details", () => {
  it("preserves custom quota spending scale through persistence and display", async () => {
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    const facts = normalizeTelemetryPatchToFacts(
      mapCustomJson(
        { cost: "250" },
        { todayCostUsd: "cost" },
        {
          asset: {
            kind: "quota",
            id: "credits",
            label: "Raw credits",
            displayScale: 100,
            displayLabel: "Credits",
          },
          role: "available",
          scope: "credential",
        },
      ),
      "customReadOnlyEndpoint",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    const snapshot = coerceTelemetrySnapshot({
      schemaVersion: 2,
      lastSyncTime: 1000,
      attempts: [],
      facts,
    })!
    render(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfileTelemetryDetails
          snapshot={snapshot}
          missingTelemetryValue="-"
        />
      </I18nextProvider>,
    )
    expect(await screen.findByText("2.5 Credits")).toBeVisible()
  })
  it("marks retained spending with its original observation time", async () => {
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfileTelemetryDetails
          snapshot={{
            lastSyncTime: 2000,
            health: { status: SiteHealthStatus.Warning },
            attempts: [],
            facts: {
              usage: {
                todayCost: {
                  value: "3",
                  unit: { kind: "money", currency: "CNY", decimalPlaces: 2 },
                  status: "stale",
                  observedAt: 1000,
                },
              },
            },
          }}
          missingTelemetryValue="-"
        />
      </I18nextProvider>,
    )
    expect(await screen.findByText("Last known")).toBeVisible()
    expect(
      document.querySelector('time[datetime="1970-01-01T00:00:01.000Z"]'),
    ).toBeVisible()
    expect(
      document.querySelector('time[datetime="1970-01-01T00:00:02.000Z"]'),
    ).toBeNull()
  })
  it("formats spending from its original decimal string", async () => {
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfileTelemetryDetails
          snapshot={{
            lastSyncTime: 2000,
            health: { status: SiteHealthStatus.Healthy },
            attempts: [],
            facts: {
              usage: {
                todayCost: {
                  value: "9007199254740993.00000001",
                  unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
                },
              },
            },
          }}
          missingTelemetryValue="-"
        />
      </I18nextProvider>,
    )
    expect(
      await screen.findByText(/9,007,199,254,740,993\.00000001/),
    ).toBeVisible()
  })
  it("shows omitted quota limits separately with their original observation time", async () => {
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfileQuotaMeters
          windows={[
            {
              type: "weekly",
              remaining: 20,
              unit: { kind: "quota", code: "requests", label: "Requests" },
              retainedAmounts: {
                limit: { value: 100, status: "stale", observedAt: 1000 },
              },
            },
          ]}
        />
      </I18nextProvider>,
    )
    expect(await screen.findByText("20 Requests left")).toBeVisible()
    expect(screen.getByText("Last known limit: 100")).toBeVisible()
    expect(
      document.querySelector('time[datetime="1970-01-01T00:00:01.000Z"]'),
    ).toBeVisible()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })
  it("localizes the generic provider quota label for ordinary details", async () => {
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    const facts = normalizeTelemetryPatchToFacts(
      { quota: { windows: [{ type: "weekly", remaining: 20 }] } },
      "kimiQuota",
      {
        profileId: "ordinary",
        baseUrl: "https://quota.example",
        observedAt: 1000,
      },
    )
    render(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfileQuotaMeters windows={facts.quota!.windows} />
      </I18nextProvider>,
    )
    expect(await screen.findByText("20 Quota left")).toBeVisible()
    expect(screen.queryByText(/Provider quota/)).not.toBeInTheDocument()
  })

  it("keeps the last reported percentage and observation time after a quota refresh fails", async () => {
    const i18n = await createResourceTestI18n({
      en: { apiCredentialProfiles: en },
    })
    const facts = normalizeTelemetryPatchToFacts(
      {
        quota: {
          windows: [
            { type: "fiveHour", percentRemaining: 62, unit: "percent" },
          ],
        },
      },
      "glmQuota",
      {
        profileId: "percent-only",
        baseUrl: "https://quota.example",
        observedAt: 1000,
      },
    )
    const accepted = acceptTelemetrySnapshot(
      {
        schemaVersion: 2,
        facts,
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 1000,
        attempts: [],
      },
      {
        schemaVersion: 2,
        health: { status: SiteHealthStatus.Error },
        lastSyncTime: 2000,
        attempts: [],
      },
    )
    render(
      <I18nextProvider i18n={i18n}>
        <ApiCredentialProfileQuotaMeters
          windows={accepted.facts!.quota!.windows}
        />
      </I18nextProvider>,
    )
    expect(await screen.findByText("62% left")).toBeVisible()
    expect(screen.getByText(/Last known/)).toBeVisible()
    expect(
      document.querySelector('time[datetime="1970-01-01T00:00:01.000Z"]'),
    ).toHaveAttribute("datetime", "1970-01-01T00:00:01.000Z")
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it.each([0, 20])(
    "shows remaining-only capacity %s as the main quota value",
    async (remaining) => {
      const i18n = await createResourceTestI18n({
        en: { apiCredentialProfiles: en },
      })
      render(
        <I18nextProvider i18n={i18n}>
          <ApiCredentialProfileQuotaMeters
            windows={[
              {
                type: "weekly",
                remaining,
                status: OBSERVATION_STATUSES.Known,
                unit: {
                  kind: MEASUREMENT_UNIT_KINDS.Quota,
                  code: "provider-quota",
                  label: "Requests",
                },
              },
            ]}
          />
        </I18nextProvider>,
      )
      expect(
        await screen.findByText(`${remaining} Requests left`),
      ).toBeVisible()
      expect(screen.queryByText("Not provided")).not.toBeInTheDocument()
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    },
  )

  it("shows a failed refresh's unlimited state with the original confirmation time", async () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        budget: {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          unlimited: true,
        },
      },
      "newApiTokenUsage",
      {
        profileId: "credential",
        baseUrl: "https://gateway.example",
        observedAt: 1000,
      },
    )
    facts.budgets![0]!.stateObservation = {
      status: OBSERVATION_STATUSES.Stale,
      source: {
        adapter: "newApiTokenUsage",
        operation: "newApiTokenUsage",
        contractVersion: "2",
        kind: EVIDENCE_KINDS.Reported,
      },
      observedAt: 1000,
      reason: FINANCIAL_OBSERVATION_REASONS.RefreshFailed,
    }
    render(
      <ApiCredentialProfileTelemetryDetails
        snapshot={{
          schemaVersion: 2,
          health: { status: SiteHealthStatus.Error },
          lastSyncTime: 2000,
          attempts: [],
          facts,
        }}
        missingTelemetryValue="Not reported"
      />,
    )
    expect(
      await screen.findByText(
        "apiCredentialProfiles:telemetry.balanceSemantics.stale",
      ),
    ).toBeVisible()
    expect(screen.getByText(/1970/, { selector: "time" })).toHaveAttribute(
      "datetime",
      "1970-01-01T00:00:01.000Z",
    )
  })
  it("labels a retained stale component with its original observation time beside the fresh total", async () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        balance: {
          amount: "110",
          currency: CURRENCIES.CNY,
          grantedAmount: "10",
          toppedUpAmount: "100",
        },
      },
      "deepSeekBalance",
      {
        profileId: "wallet",
        baseUrl: "https://wallet.example",
        observedAt: 1000,
      },
    )
    const granted = facts.balanceSnapshot!.positions.find(
      (position) => position.funding === BALANCE_FUNDING.Granted,
    )!
    if (granted.amount.status === OBSERVATION_STATUSES.Known)
      granted.amount = {
        ...granted.amount,
        status: OBSERVATION_STATUSES.Stale,
        reason: "missing-field",
      }
    render(
      <ApiCredentialProfileTelemetryDetails
        snapshot={{
          schemaVersion: 2,
          health: { status: SiteHealthStatus.Warning },
          lastSyncTime: 2000,
          attempts: [],
          facts,
        }}
        missingTelemetryValue="Not reported"
      />,
    )
    expect(
      await screen.findByText(
        "apiCredentialProfiles:telemetry.balanceSemantics.stale",
      ),
    ).toBeVisible()
    expect(screen.getByText(/1970/, { selector: "time" })).toHaveAttribute(
      "datetime",
      "1970-01-01T00:00:01.000Z",
    )
  })
  it("keeps a wallet visible alongside an unlimited key budget", async () => {
    const facts = normalizeTelemetryPatchToFacts(
      {
        balance: { amount: "42", currency: CURRENCIES.USD },
        budget: {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          unlimited: true,
        },
        unlimitedQuota: true,
      },
      "openaiBilling",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    render(
      <ApiCredentialProfileTelemetryDetails
        snapshot={{
          schemaVersion: 2,
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1000,
          attempts: [],
          facts,
        }}
        missingTelemetryValue="Not reported"
      />,
    )
    expect(await screen.findByText(/USD\s+42$/)).toBeVisible()
  })
  it("shows the native available total and the gift and purchased components", async () => {
    const facts = normalizeTelemetryPatchToFacts(
      parseDeepSeekBalance({
        balance_infos: [
          {
            currency: CURRENCIES.CNY,
            total_balance: "110",
            granted_balance: "10",
            topped_up_balance: "100",
          },
        ],
      }),
      "deepSeekBalance",
      {
        profileId: "fixture",
        baseUrl: "https://fixture.example",
        observedAt: 1000,
      },
    )
    render(
      <ApiCredentialProfileTelemetryDetails
        snapshot={{
          schemaVersion: 2,
          health: { status: SiteHealthStatus.Healthy },
          lastSyncTime: 1000,
          attempts: [],
          facts,
        }}
        missingTelemetryValue="Not reported"
      />,
    )
    expect(await screen.findByText(/CNY\s+110(?:\.00)?$/)).toBeVisible()
    expect(screen.getByText(/CNY\s+10(?:\.00)?$/)).toBeVisible()
    expect(screen.getByText(/CNY\s+100(?:\.00)?$/)).toBeVisible()
  })
})
