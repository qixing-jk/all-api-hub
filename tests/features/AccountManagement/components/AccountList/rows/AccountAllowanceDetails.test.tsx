import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { AccountAllowanceDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountAllowanceDetails"
import { FinancialBalanceDisplay } from "~/features/AccountManagement/components/AccountList/rows/FinancialBalanceDisplay"
import en from "~/locales/en/account.json"
import balanceHistory from "~/locales/en/balanceHistory.json"
import common from "~/locales/en/common.json"
import keyManagement from "~/locales/en/keyManagement.json"
import zhCN from "~/locales/zh-CN/account.json"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { toggleDevUnlocked } from "~/utils/core/devMode"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

const scope = {
  ...accountBalanceScope({
    baseUrl: "https://fixture.example",
    accountId: "account",
  }),
  projects: { kind: SCOPE_SELECTION_KINDS.All },
  keys: { kind: SCOPE_SELECTION_KINDS.All },
  models: { kind: SCOPE_SELECTION_KINDS.All },
  groups: { kind: SCOPE_SELECTION_KINDS.All },
}
const source = {
  adapter: "fixture",
  operation: "plans",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
}
const entry = (
  id: string,
  label: string,
  overrides: Partial<Parameters<typeof budgetConstraint>[0]> = {},
  metadata: Partial<AccountAllowanceEntry> = {},
): AccountAllowanceEntry => ({
  id,
  label,
  collectionKey: "plans",
  identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
  validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
  constraint: budgetConstraint({
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    scope,
    source,
    observedAt: 100,
    limitState: BUDGET_LIMIT_STATES.Finite,
    remaining: "1",
    ...overrides,
  }),
  ...metadata,
})
const snapshot = (entries: AccountAllowanceEntry[]) =>
  accountAllowanceObservation(
    scope,
    [
      {
        source,
        collectionKey: "plans",
        enumeration: FINANCIAL_ENUMERATION.Complete,
        entries,
      },
    ],
    100,
  ).allowances
const englishI18n = () =>
  createResourceTestI18n({
    en: { account: en, balanceHistory, keyManagement, common },
  })

describe("AccountAllowanceDetails", () => {
  it("keeps the rolling reset rule visible beside the named period", async () => {
    const i18n = await englishI18n()
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          snapshot={snapshot([
            entry("rolling", "Pro plan", {
              window: {
                kind: BUDGET_WINDOW_KINDS.Rolling,
                period: BUDGET_PERIODS.FiveHours,
              },
            }),
          ])}
        />
      </I18nextProvider>,
    )
    expect(screen.getByText("5 hours (Rolling)")).toBeVisible()
  })

  it.each(["expired", "reset"])(
    "explains an %s plan beside its retained remaining amount",
    async (state) => {
      const i18n = await englishI18n()
      const plan = entry("elapsed", "Pro plan", {
        limit: "20",
        used: "12",
        enabled: true,
      })
      if (state === "expired")
        plan.validity = { kind: BALANCE_VALIDITY_KINDS.Expires, at: 1 }
      else
        plan.constraint.window = {
          kind: BUDGET_WINDOW_KINDS.Periodic,
          period: BUDGET_PERIODS.Day,
          resetsAt: 1,
        }
      render(
        <I18nextProvider i18n={i18n}>
          <AccountAllowanceDetails snapshot={snapshot([plan])} />
        </I18nextProvider>,
      )
      expect(screen.getByText("USD 1")).toBeVisible()
      expect(
        screen.getByText(
          state === "expired" ? "Expired" : "Reset · Last known value",
        ),
      ).toBeVisible()
      expect(screen.queryByRole("meter")).not.toBeInTheDocument()
    },
  )

  it("explains remaining-only plans without a row of missing auxiliary amounts", async () => {
    const i18n = await englishI18n()
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          snapshot={snapshot([entry("remaining-only", "Pro plan")])}
        />
      </I18nextProvider>,
    )
    expect(screen.getByText("USD 1")).toBeVisible()
    expect(screen.queryByText("N/A")).not.toBeInTheDocument()
    expect(
      screen.getByText("Only the remaining allowance is provided"),
    ).toBeVisible()
  })

  it("identifies same-named allowances by their period in the visible account row", async () => {
    const i18n = await englishI18n()
    render(
      <I18nextProvider i18n={i18n}>
        <FinancialBalanceDisplay
          allowances={snapshot([
            entry("short", "Pro plan", {
              window: {
                kind: BUDGET_WINDOW_KINDS.Unknown,
                period: BUDGET_PERIODS.FiveHours,
              },
            }),
            entry("weekly", "Pro plan", {
              window: {
                kind: BUDGET_WINDOW_KINDS.Unknown,
                period: BUDGET_PERIODS.Week,
              },
            }),
          ])}
          disabled={false}
          refreshing={false}
          onRefresh={() => {}}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(
        `Pro plan · ${i18n.t("keyManagement:financial.period.5h")}`,
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        `Pro plan · ${i18n.t("keyManagement:financial.period.week")}`,
      ),
    ).toBeVisible()
  })

  it("shows actual plan restrictions and expiry without listing missing scope metadata", async () => {
    const i18n = await englishI18n()
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          snapshot={snapshot([
            entry(
              "daily",
              "Daily plan",
              {
                scope: {
                  ...accountBalanceScope({
                    baseUrl: "https://fixture.example",
                    accountId: "account",
                  }),
                  groups: {
                    kind: SCOPE_SELECTION_KINDS.Restricted,
                    ids: ["premium"],
                  },
                },
                remaining: "3",
                window: {
                  kind: BUDGET_WINDOW_KINDS.Periodic,
                  period: BUDGET_PERIODS.Day,
                  resetsAt: 4102444800000,
                },
              },
              {
                validity: {
                  kind: BALANCE_VALIDITY_KINDS.Expires,
                  at: 4102531200000,
                },
              },
            ),
            entry("plain", "Plain plan"),
          ])}
        />
      </I18nextProvider>,
    )
    expect(screen.getByText("Groups: premium")).toBeVisible()
    expect(screen.getByText(/Expires/)).toBeVisible()
    expect(screen.getAllByText(/Resets:/)[0]).toBeVisible()
    expect(screen.queryAllByText(/unverified|fixture\/plans@1/i)).toHaveLength(
      0,
    )
    expect(screen.getAllByText(/Updated at/)).toHaveLength(2)
  })

  it("shows finite plan usage without deriving independently reported remaining credit", async () => {
    const i18n = await englishI18n()
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          snapshot={snapshot([
            entry("daily", "Daily plan", {
              limit: "20",
              used: "12",
              remaining: "3",
              enabled: true,
            }),
          ])}
        />
      </I18nextProvider>,
    )
    const meter = screen.getByRole("meter", { name: "Daily plan" })
    expect(meter).toHaveAttribute("aria-valuenow", "60")
    expect(meter.getAttribute("aria-valuetext")).toMatch(/USD\s*12 \/ USD\s*20/)
    expect(screen.getByText(/USD\s*3/)).toBeVisible()
  })

  afterEach(() => vi.restoreAllMocks())
  it("removes the usage meter when an expired plan is revisited", async () => {
    const i18n = await englishI18n()
    const clock = vi.spyOn(Date, "now").mockReturnValue(100)
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          snapshot={snapshot([
            entry(
              "daily",
              "Daily plan",
              { limit: "20", used: "12", enabled: true },
              { validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 200 } },
            ),
          ])}
        />
      </I18nextProvider>,
    )
    expect(screen.getByRole("meter", { name: "Daily plan" })).toBeVisible()
    clock.mockReturnValue(200)
    fireEvent.focus(window)
    expect(screen.queryByRole("meter")).not.toBeInTheDocument()
  })

  it.each([
    { limitState: BUDGET_LIMIT_STATES.Unlimited, remaining: undefined },
    { limit: undefined },
    { limit: "0" },
    { used: undefined },
    { used: "-1" },
  ])(
    "does not invent a percentage for an unbounded or non-comparable plan (%j)",
    async (overrides) => {
      const i18n = await englishI18n()
      render(
        <I18nextProvider i18n={i18n}>
          <AccountAllowanceDetails
            snapshot={snapshot([
              entry("daily", "Daily plan", {
                limit: "20",
                used: "12",
                remaining: "3",
                enabled: true,
                ...overrides,
              }),
            ])}
          />
        </I18nextProvider>,
      )
      expect(screen.getByRole("group", { name: "Daily plan" })).toBeVisible()
      expect(screen.queryByRole("meter")).not.toBeInTheDocument()
    },
  )

  it("bounds the visual fill for an overrun while keeping the actual used and remaining amounts", async () => {
    const i18n = await englishI18n()
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails
          snapshot={snapshot([
            entry("daily", "Daily plan", {
              limit: "20",
              used: "30",
              remaining: "-10",
              enabled: true,
            }),
          ])}
        />
      </I18nextProvider>,
    )
    const meter = screen.getByRole("meter", { name: "Daily plan" })
    expect(meter).toHaveAttribute("aria-valuenow", "100")
    expect(meter.getAttribute("aria-valuetext")).toMatch(/USD\s*30 \/ USD\s*20/)
    expect(screen.getByText(/-USD\s*10/)).toBeVisible()
  })
  it.each([
    "stale",
    "different source",
    "different clock",
    "unknown state",
    "expired",
    "reset",
    "disabled",
  ] as const)(
    "keeps the usage meter hidden for a plan with %s evidence",
    async (condition) => {
      const i18n = await englishI18n()
      const plan = entry("daily", "Daily plan", {
        limit: "20",
        used: "12",
        remaining: "3",
        enabled: true,
      })
      const budget = plan.constraint
      if (condition === "stale")
        budget.stateObservation = {
          status: OBSERVATION_STATUSES.Stale,
          source,
          observedAt: 100,
          reason: "refresh failed",
        }
      if (condition === "different source")
        budget.used = {
          status: OBSERVATION_STATUSES.Known,
          value: "12",
          observedAt: 100,
          source: { ...source, operation: "other-plan" },
        }
      if (condition === "different clock")
        budget.used = {
          status: OBSERVATION_STATUSES.Known,
          value: "12",
          observedAt: 200,
          source,
        }
      if (condition === "unknown state")
        budget.stateObservation = {
          status: OBSERVATION_STATUSES.Unknown,
          source,
          reason: "not reported",
        }
      if (condition === "expired")
        plan.validity = { kind: BALANCE_VALIDITY_KINDS.Expires, at: 1 }
      if (condition === "reset")
        budget.window = {
          kind: BUDGET_WINDOW_KINDS.Periodic,
          period: BUDGET_PERIODS.Day,
          resetsAt: 1,
        }
      if (condition === "disabled")
        budget.enabled = {
          status: OBSERVATION_STATUSES.Known,
          value: false,
          source,
          observedAt: 100,
        }
      render(
        <I18nextProvider i18n={i18n}>
          <AccountAllowanceDetails snapshot={snapshot([plan])} />
        </I18nextProvider>,
      )
      expect(screen.getByText(/USD\s*3/)).toBeVisible()
      expect(screen.queryByRole("meter")).not.toBeInTheDocument()
    },
  )
  it.each([0, 80])(
    "shows Novita cash balance %s separately from available credit and borrowing limit",
    async (cash) => {
      const user = userEvent.setup()
      const i18n = await createResourceTestI18n(
        { "zh-CN": { account: zhCN } },
        "zh-CN",
      )
      const available = balancePosition({
        id: "available",
        scope,
        value: "93",
        observedAt: 100,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        source,
        nature: BALANCE_NATURES.Mixed,
      })
      const cashPosition = {
        ...balancePosition({
          id: "cash",
          role: BALANCE_ROLES.Ledger,
          scope,
          value: String(cash),
          observedAt: 100,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          source,
          nature: BALANCE_NATURES.Prepaid,
        }),
        cashClassification: "reported-cash" as const,
      }
      const credit = balancePosition({
        id: "credit",
        role: BALANCE_ROLES.CreditLimit,
        scope,
        value: "20",
        observedAt: 100,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        source,
        nature: BALANCE_NATURES.Credit,
      })
      render(
        <I18nextProvider i18n={i18n}>
          <FinancialBalanceDisplay
            snapshot={accountBalanceSnapshot(
              scope,
              [available, cashPosition, credit],
              100,
              FINANCIAL_COVERAGE.Complete,
            )}
            disabled={false}
            refreshing={false}
            onRefresh={vi.fn()}
          />
        </I18nextProvider>,
      )
      await user.click(screen.getByRole("button", { name: "余额明细" }))
      const details = screen.getByRole("dialog", { name: "余额明细" })
      expect(details).toHaveTextContent("可用额度USD 93")
      expect(details).toHaveTextContent(`现金余额USD ${cash}`)
      expect(details).toHaveTextContent("授信上限USD 20")
      expect(details).not.toHaveTextContent("永久额度")
      expect(details).not.toHaveTextContent("余额历史和收入估算")
    },
  )

  it("preserves provider dates without inventing a timezone and localizes explicit expiry instants", async () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (
      this: Date,
      _locales,
      options,
    ) {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Los_Angeles",
        ...options,
      }).format(this)
    })
    const i18n = await englishI18n()
    const allowances = snapshot([
      entry(
        "timed",
        "Timed allowance",
        {},
        { reportedTiming: { expiresAt: "2099-07-01", resetsAt: "2099-08-01" } },
      ),
      entry(
        "subscription",
        "Subscription",
        {},
        {
          validity: {
            kind: BALANCE_VALIDITY_KINDS.Expires,
            at: Date.parse("2099-07-01T00:00:00Z"),
          },
        },
      ),
      entry(
        "grant",
        "Welcome grant",
        {},
        { reportedTiming: { expiresAt: "2099-09-01" } },
      ),
    ])
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails snapshot={allowances} />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(
        "Expires: 2099-07-01 · Time boundary or timezone unknown",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "Resets at: 2099-08-01 · Time boundary or timezone unknown",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "Expires: 2099-09-01 · Time boundary or timezone unknown",
      ),
    ).toBeVisible()
    expect(screen.getByText("Expires: 6/30/99, 5:00 PM")).toBeVisible()
  })

  it("keeps group scope, unlimited state, zero remaining and unavailable grant observations distinct", async () => {
    const i18n = await englishI18n()
    const allowances = snapshot([
      entry("group", "Group allowance", {
        limitState: BUDGET_LIMIT_STATES.Unlimited,
        remaining: undefined,
        scope: {
          ...scope,
          groups: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["premium"] },
        },
      }),
      entry("subscription", "Subscription", { remaining: "0" }),
      entry("timed", "Timed allowance", { remaining: "2" }),
      entry("grant", "Welcome grant"),
      entry("unavailable", "Grant details unavailable", {
        limitState: BUDGET_LIMIT_STATES.Unknown,
        remaining: undefined,
      }),
    ])
    render(
      <I18nextProvider i18n={i18n}>
        <AccountAllowanceDetails snapshot={allowances} />
      </I18nextProvider>,
    )
    expect(screen.getByText("Groups: premium")).toBeVisible()
    expect(
      within(
        screen.getByRole("group", { name: "Group allowance" }),
      ).getAllByText("Unlimited Quota"),
    ).toHaveLength(1)
    expect(
      within(screen.getByRole("group", { name: "Subscription" })).getByText(
        /USD\s*0/,
      ),
    ).toBeVisible()
    expect(
      within(screen.getByRole("group", { name: "Timed allowance" })).getByText(
        /USD\s*2/,
      ),
    ).toBeVisible()
    expect(screen.getByText("Welcome grant")).toBeVisible()
    expect(
      within(
        screen.getByRole("group", {
          name: "Grant details unavailable",
        }),
      ).getAllByText("N/A"),
    ).toHaveLength(1)
  })
})

it("keeps an allowance's provider window and reported timing visible", async () => {
  const i18n = await englishI18n()
  render(
    <I18nextProvider i18n={i18n}>
      <AccountAllowanceDetails
        snapshot={snapshot([
          entry(
            "window",
            "Daily plan",
            {
              limitState: BUDGET_LIMIT_STATES.Inherited,
              remaining: "8",
              window: {
                kind: BUDGET_WINDOW_KINDS.Periodic,
                period: BUDGET_PERIODS.Day,
                observation: {
                  start: Date.parse("2026-11-18T00:00:00Z"),
                  end: Date.parse("2026-11-18T12:00:00Z"),
                  timeZone: "UTC",
                },
              },
            },
            {
              reportedTiming: {
                startsAt: "2026-11-18",
                resetsAt: "2026-11-19",
              },
            },
          ),
        ])}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText(/UTC/)).toBeVisible()
  expect(screen.getByText(/2026-11-18/)).toBeVisible()
  expect(screen.getByText(/2026-11-19/)).toBeVisible()
  expect(screen.getByText(/USD\s8/)).toBeVisible()
})

it("keeps plan amounts visible while revealing technical observations only after developer unlock", async () => {
  const i18n = await englishI18n()
  const user = userEvent.setup()
  const content = (
    <I18nextProvider i18n={i18n}>
      <AccountAllowanceDetails
        snapshot={snapshot([
          entry("plan", "Monthly plan", {
            limit: "100",
            used: "30",
            remaining: "70",
          }),
        ])}
      />
    </I18nextProvider>
  )
  const { rerender } = render(content)
  expect(
    screen.queryByText("Technical details (debug)"),
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/fixture\/plans@1/)).not.toBeInTheDocument()
  toggleDevUnlocked()
  onTestFinished(() => {
    toggleDevUnlocked()
  })
  rerender(content)
  expect(screen.getByText(/fixture\/plans@1/)).not.toBeVisible()
  await user.click(screen.getByText("Technical details (debug)"))
  expect(screen.getByText(/fixture\/plans@1/)).toBeVisible()
  expect(screen.getByText(/USD\s*70/)).toBeVisible()
})
