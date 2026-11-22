import { I18nextProvider } from "react-i18next"
import { afterEach, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { ProviderDayUsageSummary } from "~/features/AccountManagement/components/ProviderDayUsageSummary"
import enAccount from "~/locales/en/account.json"
import enOverview from "~/locales/en/optionsOverview.json"
import enUsage from "~/locales/en/usageAnalytics.json"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

// Hoisted fixtures load dependency-free runtime values before component imports.
const { CURRENCIES, CURRENCY_DISPLAY_MODES } = await vi.hoisted(
  () => import("~/constants/money"),
)

const displayPreference = vi.hoisted(() => ({
  mode: CURRENCY_DISPLAY_MODES.Original as "original" | "USD" | "CNY",
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({
    currencyType: CURRENCIES.USD,
    currencyDisplay: displayPreference.mode,
  }),
}))
afterEach(() => {
  displayPreference.mode = CURRENCY_DISPLAY_MODES.Original
})

it.each([
  CURRENCY_DISPLAY_MODES.Original,
  CURRENCIES.USD,
  CURRENCIES.CNY,
] as const)(
  "preserves native Token cost precision in %s provider-day display",
  (mode) => {
    displayPreference.mode = mode
    const site = buildDisplaySiteData({
      usage: {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        cost: {
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "fixture:tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
          amount: {
            status: OBSERVATION_STATUSES.Known,
            value: "3123456.789",
            observedAt: Date.now(),
            source: {
              adapter: "fixture",
              operation: "daily",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          },
        },
      },
    })
    render(<ProviderDayUsageSummary sites={[site]} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.getByText("3.123456789 M Token")).toBeVisible()
  },
)

it("preserves exact original currency cost precision in the provider-day summary", () => {
  const site = buildDisplaySiteData({
    usage: {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        amount: {
          status: OBSERVATION_STATUSES.Known,
          value: "140.123456789",
          observedAt: Date.now(),
          source: {
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        },
      },
    },
  })
  render(<ProviderDayUsageSummary sites={[site]} />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })
  expect(screen.getByText(/CNY\s*140\.123456789/)).toBeVisible()
})

it.each([
  [CURRENCIES.USD, CURRENCIES.CNY, "140", /^USD\s*10(?:\.00)?$/],
  [CURRENCIES.CNY, CURRENCIES.USD, "10", /^CNY\s*140(?:\.00)?$/],
  [
    CURRENCY_DISPLAY_MODES.Original,
    CURRENCIES.CNY,
    "140",
    /^CNY\s*140(?:\.00)?$/,
  ],
] as const)(
  "shows provider-day %s amounts with the account's nondefault rate and preserves Original",
  (mode, code, value, expected) => {
    displayPreference.mode = mode
    const site = buildDisplaySiteData({
      name: "Rate fourteen account",
      exchangeRate: 14,
      usage: {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        reportedDay: "2026-11-17",
        cost: {
          asset: { kind: ASSET_KINDS.Currency, code },
          amount: {
            status: OBSERVATION_STATUSES.Known,
            value,
            observedAt: Date.now(),
            source: {
              adapter: "fixture",
              operation: "daily",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          },
        },
      },
    })
    const { rerender } = render(<ProviderDayUsageSummary sites={[site]} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.getByText(expected)).toBeVisible()
    expect(screen.getByText("2026-11-17")).toBeVisible()
    displayPreference.mode = CURRENCY_DISPLAY_MODES.Original
    rerender(<ProviderDayUsageSummary sites={[site]} />)
    expect(
      screen.getByText(new RegExp(`^${code}\\s*${value}(?:\\.00)?$`)),
    ).toBeVisible()
  },
)

it("labels provider-day request counts in the selected application language", async () => {
  const i18n = await createResourceTestI18n({
    en: {
      account: enAccount,
      optionsOverview: enOverview,
      usageAnalytics: enUsage,
    },
  })
  const site = buildDisplaySiteData({
    name: "Provider A",
    usage: {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      totalRequests: 4,
      observedAt: Date.now(),
    },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <ProviderDayUsageSummary sites={[site]} />
    </I18nextProvider>,
    { withUserPreferencesProvider: false, withThemeProvider: false },
  )
  expect(screen.getByText("Requests: 4")).toBeVisible()
})

it("keeps a selected account's provider-day cost visible without counting disabled accounts", () => {
  const site = buildDisplaySiteData({
    name: "Provider A",
    usage: {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      totalRequests: 4,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        amount: {
          status: OBSERVATION_STATUSES.Known,
          value: "3.5",
          observedAt: Date.now(),
          source: {
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        },
      },
    },
  })
  const disabled = {
    ...site,
    id: "disabled",
    name: "Disabled provider",
    disabled: true,
  }
  render(<ProviderDayUsageSummary sites={[site, disabled]} />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })
  expect(screen.getByText("Provider A")).toBeVisible()
  expect(screen.getByText(/3\.5/)).toBeVisible()
  expect(screen.queryByText("Disabled provider")).not.toBeInTheDocument()
})

it.each(["complete", "partial"] as const)(
  "keeps %s provider cost coverage visible without changing the amount",
  (coverage) => {
    const site = buildDisplaySiteData({
      name: "Provider A",
      usage: {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        cost: {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          coverage,
          amount: {
            status: OBSERVATION_STATUSES.Known,
            value: "3.5",
            observedAt: Date.now(),
            source: {
              adapter: "fixture",
              operation: "daily",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          },
        },
      },
    })
    render(<ProviderDayUsageSummary sites={[site]} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.getByText(/USD\s*3.5/)).toBeVisible()
    if (coverage === "partial")
      expect(
        screen.getByText("account:todayMetricAvailability.partial"),
      ).toBeVisible()
    else
      expect(
        screen.queryByText("account:todayMetricAvailability.partial"),
      ).not.toBeInTheDocument()
  },
)
