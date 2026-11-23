import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, onTestFinished, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { DedupeAccountCard } from "~/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard"
import enAccount from "~/locales/en/account.json"
import enBalanceHistory from "~/locales/en/balanceHistory.json"
import enUi from "~/locales/en/ui.json"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { normalizeSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { SiteAccount } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { toggleDevUnlocked } from "~/utils/core/devMode"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"
import { act, render, screen, within } from "~~/tests/test-utils/render"

const t = ((key: string) => key) as TFunction

const renderCard = (
  siteType: AccountSiteType,
  overrides: Partial<SiteAccount> = {},
) => {
  const account = buildSiteAccount({
    site_type: siteType,
    account_info: {
      ...buildSiteAccount().account_info,
      today_quota_consumption: 987654321,
      today_requests_count: 876543210,
      today_prompt_tokens: 765432109,
      today_completion_tokens: 654321098,
      todayStatsAvailability: undefined,
    },
    ...overrides,
  })

  renderAccountCard(account)
}

const renderAccountCard = (account: SiteAccount) => {
  render(
    <DedupeAccountCard
      account={account}
      group={{
        groupId: "group-1",
        keepAccountId: account.id,
        recommendedKeepAccountId: account.id,
        hasManualOverride: false,
        reason: "same_origin_user",
      }}
      accountLabelById={new Map([[account.id, "Account"]])}
      pinnedAccountIds={[]}
      detailsOpenByAccountId={{ [account.id]: true }}
      isWorking={false}
      t={t}
      onKeepChange={vi.fn()}
      onToggleDetails={vi.fn()}
    />,
  )
}

describe("DedupeAccountCard today statistics", () => {
  it.each([false, true])(
    "keeps raw account identifiers in collapsed developer details (%s)",
    async (developerMode) => {
      window.localStorage.removeItem("aah_dev_features_unlocked")
      if (developerMode) toggleDevUnlocked()
      onTestFinished(() =>
        window.localStorage.removeItem("aah_dev_features_unlocked"),
      )
      const account = buildSiteAccount({
        id: "internal-account",
        site_type: SITE_TYPES.NEW_API,
      })
      renderAccountCard(account)
      await screen.findByText("account:financial.details")
      if (!developerMode) {
        expect(screen.queryByText("internal-account")).not.toBeInTheDocument()
        expect(
          screen.queryByText(SITE_TYPES.NEW_API, { exact: true }),
        ).not.toBeInTheDocument()
      } else {
        expect(screen.getByText("internal-account")).not.toBeVisible()
        const details = screen.getByText("internal-account").closest("details")!
        await userEvent
          .setup()
          .click(
            within(details).getByText("account:financial.technicalDetails"),
          )
        expect(screen.getByText("internal-account")).toBeVisible()
        expect(
          screen.getByText(SITE_TYPES.NEW_API, { exact: true }),
        ).toBeVisible()
      }
    },
  )

  it("keeps the selected manual balance visibly qualified in duplicate details", async () => {
    renderAccountCard(buildSiteAccount({ manualBalanceUsd: "9" }))
    const details = (
      await screen.findByText("account:financial.details")
    ).closest("dt")!.parentElement!
    expect(details).toHaveTextContent(/USD\s*9/)
    expect(details).toHaveTextContent("account:financial.manual")
  })

  it.each(
    (["expired", "reset"] as const).flatMap((state) => [
      { state, deadlineOffset: -1000 },
      { state, deadlineOffset: 1000 },
    ]),
  )(
    "keeps native $state validity visible across deadline $deadlineOffset",
    async ({ state, deadlineOffset }) => {
      const i18n = await createResourceTestI18n({
        en: { account: enAccount, balanceHistory: enBalanceHistory, ui: enUi },
      })
      vi.useFakeTimers()
      onTestFinished(() => {
        vi.useRealTimers()
      })
      const now = Date.parse("2026-11-20T00:00:00Z")
      vi.setSystemTime(now)
      const observedAt = now - 3600_000
      const deadline = now + deadlineOffset
      const account = buildSiteAccount({ id: "one", last_sync_time: now })
      const scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
      const position = balancePosition({
        id: "credit",
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value: "80",
        observedAt,
        source: {
          kind: EVIDENCE_KINDS.Reported,
          adapter: "fixture",
          operation: "balance",
          contractVersion: "1",
        },
        ...(state === "expired"
          ? { validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: deadline } }
          : {}),
        window: {
          start: now - 86400_000,
          end: now + 86400_000,
          timeZone: "UTC",
          ...(state === "reset" ? { resetsAt: deadline } : {}),
        },
      })
      account.account_info.balance = accountBalanceSnapshot(
        scope,
        [position],
        now,
        FINANCIAL_COVERAGE.Complete,
      )
      render(
        <I18nextProvider i18n={i18n}>
          <DedupeAccountCard
            account={account}
            group={{
              groupId: "group-1",
              keepAccountId: account.id,
              recommendedKeepAccountId: account.id,
              hasManualOverride: false,
              reason: "same_origin_user",
            }}
            accountLabelById={new Map([[account.id, "Account"]])}
            pinnedAccountIds={[]}
            detailsOpenByAccountId={{ [account.id]: true }}
            isWorking={false}
            t={i18n.getFixedT("en")}
            onKeepChange={vi.fn()}
            onToggleDetails={vi.fn()}
          />
        </I18nextProvider>,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      const details = screen
        .getByText(enAccount.financial.details)
        .closest("dt")!.parentElement!
      const stateLabel =
        state === "expired"
          ? enBalanceHistory.native.expired
          : `${enBalanceHistory.native.reset} · ${enAccount.financial.lastKnown}`
      if (deadlineOffset > 0) {
        expect(within(details).queryByText(stateLabel)).not.toBeInTheDocument()
        await act(async () => {
          await vi.advanceTimersByTimeAsync(deadlineOffset)
        })
      }
      expect(within(details).getByText(stateLabel)).toBeVisible()
      expect(details).toHaveTextContent(enAccount.financial.window)
      expect(details).toHaveTextContent("UTC")
      if (state === "reset")
        expect(details).toHaveTextContent(enAccount.financial.lastKnown)
      expect(
        within(details).getByTitle(new Date(observedAt).toLocaleString("en")),
      ).toHaveAttribute("datetime", new Date(observedAt).toISOString())
      expect(position.amount).toMatchObject({
        status: OBSERVATION_STATUSES.Known,
        observedAt,
      })
    },
  )

  it.each([
    { quota: 1_625_000, amount: /USD\s*3\.25/ },
    { quota: 0, amount: /USD\s*0(?:\D|$)/ },
    { quota: -125_000, amount: /-USD\s*0\.25/ },
  ])(
    "keeps saved release consumption $quota readable with its reference metadata",
    async ({ quota, amount }) => {
      renderCard(SITE_TYPES.NEW_API, {
        last_sync_time: 0,
        account_info: {
          ...buildSiteAccount().account_info,
          today_quota_consumption: quota,
          today_income: 625_000,
        },
      })
      const summary = (
        await screen.findByText(
          "ui:dialog.dedupeAccounts.details.todayConsumption",
        )
      ).closest("dt")!.parentElement!
      expect(summary).toHaveTextContent(amount)
      expect(summary).toHaveTextContent("account:financial.legacy")
      expect(summary).toHaveTextContent("account:financial.lastKnown")
      const details = screen
        .getByText("account:financial.usagePeriod")
        .closest("dt")!.parentElement!
      expect(details).toHaveTextContent(amount)
      expect(details).toHaveTextContent(/USD\s*1\.25/)
      expect(details).toHaveTextContent("account:financial.timingUnknown")
    },
  )
  it("keeps a release reference's recorded clock without labeling a fresh observation last-known", async () => {
    const observedAt = Date.now()
    renderCard(SITE_TYPES.NEW_API, {
      last_sync_time: observedAt,
      account_info: {
        ...buildSiteAccount().account_info,
        today_quota_consumption: 1_625_000,
      },
    })
    const summary = (
      await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )
    ).closest("dt")!.parentElement!
    expect(summary).toHaveTextContent(/USD\s*3\.25/)
    expect(summary).not.toHaveTextContent("account:financial.lastKnown")
    const details = screen
      .getByText("account:financial.usagePeriod")
      .closest("dt")!.parentElement!
    expect(
      within(details).getAllByTitle(new Date(observedAt).toLocaleString("en")),
    ).toHaveLength(2)
  })
  it("keeps absent release consumption and income unavailable instead of fabricating zero references", async () => {
    const account = buildSiteAccount({ site_type: SITE_TYPES.NEW_API })
    delete (account.account_info as Partial<typeof account.account_info>)
      .today_quota_consumption
    delete (account.account_info as Partial<typeof account.account_info>)
      .today_income
    renderAccountCard(account)
    const summary = (
      await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )
    ).closest("dt")!.parentElement!
    expect(summary).toHaveTextContent(
      "account:todayMetricAvailability.pendingRefresh",
    )
    expect(summary).not.toHaveTextContent(/USD/)
    expect(
      screen.queryByText("account:financial.usagePeriod"),
    ).not.toBeInTheDocument()
  })
  it("shows a retained balance's own clock and income-only financial details", async () => {
    const at = new Date("2026-01-02T03:04:05Z").getTime()
    const scope = accountBalanceScope({
      baseUrl: "https://wallet.example",
      accountId: "one",
    })
    const source = {
      adapter: "fixture",
      operation: "wallet",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const position = balancePosition({
      id: "wallet",
      scope,
      source,
      observedAt: at,
      value: "7",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    })
    if (position.amount.status !== OBSERVATION_STATUSES.Known)
      throw new Error("Fixture amount must be known")
    position.amount = {
      ...position.amount,
      status: OBSERVATION_STATUSES.Stale,
      reason: "request-failed",
    }
    renderCard(SITE_TYPES.NEW_API, {
      id: "one",
      last_sync_time: at + 9999999,
      account_info: {
        ...buildSiteAccount().account_info,
        balance: accountBalanceSnapshot(
          scope,
          [position],
          at + 9999999,
          FINANCIAL_COVERAGE.Partial,
        ),
        reportedIncome: [
          {
            scope,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            amount: {
              status: OBSERVATION_STATUSES.Known,
              source,
              observedAt: at,
              value: "13.1234567",
            },
            window: { start: at - 1000, end: at, timeZone: "UTC" },
            coverage: FINANCIAL_COVERAGE.Complete,
            classification: INCOME_CLASSIFICATIONS.Grant,
          },
        ],
      },
    })
    const details = (
      await screen.findByText("account:financial.details")
    ).closest("dt")!.parentElement!
    expect(details).toHaveTextContent(new Date(at).toLocaleString())
    const income = screen.getByRole("group", {
      name: /13\.12/,
    })
    await userEvent.setup().click(
      within(income).getByRole("button", {
        name: testI18n.t("keyManagement:actions.details"),
      }),
    )
    expect(screen.getByText(/13.1234567/)).toBeVisible()
  })
  it("shows native balances and settled amounts with their units and intervals", async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const scope = {
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "one" },
      authority: "https://wallet.example",
      models: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      projects: { kind: SCOPE_SELECTION_KINDS.All },
    } as const
    const source = {
      adapter: "fixture",
      operation: "wallet",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const position = balancePosition({
      id: "wallet",
      scope,
      source,
      observedAt: Date.now(),
      value: "9007199254740993",
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "fixture:token",
        label: "Token",
        displayLabel: "Token",
        displayScale: 1,
      },
    })
    renderCard(SITE_TYPES.NEW_API, {
      id: "one",
      account_info: {
        ...buildSiteAccount().account_info,
        quota: 999999,
        balance: accountBalanceSnapshot(
          scope,
          [position],
          Date.now(),
          FINANCIAL_COVERAGE.Complete,
        ),
        settledConsumption: [
          {
            scope,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            amount: {
              status: OBSERVATION_STATUSES.Known,
              value: "1.23456789",
              observedAt: Date.now(),
              source,
            },
            window: {
              start: start.getTime(),
              end: start.getTime() + 1000,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
            coverage: FINANCIAL_COVERAGE.Complete,
          },
        ],
      },
    })
    const balance = (
      await screen.findByText("account:financial.details")
    ).closest("dt")!.parentElement
    expect(balance).toHaveTextContent("9,007,199,254,740,993 Token")
    expect(balance).not.toHaveTextContent("999999")
    const consumption = screen
      .getByText("ui:dialog.dedupeAccounts.details.todayConsumption")
      .closest("dt")!.parentElement
    expect(consumption).toHaveTextContent(/CNY\s*1.23456789/)
    expect(consumption).not.toHaveTextContent("account:financial.legacy")
    expect(consumption).toHaveTextContent(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
  })
  it("renders an ordinary record's user id in a secret-free credential group", async () => {
    const account = buildSiteAccount({
      id: "local-account-id",
      site_type: SITE_TYPES.NEW_API,
      account_info: {
        ...buildSiteAccount().account_info,
        id: "upstream-user-id",
        access_token: "credential-secret",
      },
    })

    render(
      <DedupeAccountCard
        account={account}
        group={{
          groupId: "group-credential",
          keepAccountId: account.id,
          recommendedKeepAccountId: account.id,
          hasManualOverride: false,
          reason: "same_credential",
        }}
        accountLabelById={new Map([[account.id, "Ordinary account"]])}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{ [account.id]: true }}
        isWorking={false}
        t={t}
        onKeepChange={vi.fn()}
        onToggleDetails={vi.fn()}
      />,
    )

    await screen.findByText("Ordinary account")
    expect(screen.getByText("upstream-user-id")).toBeInTheDocument()
    expect(
      screen.getByText("ui:dialog.dedupeAccounts.details.userId"),
    ).toBeInTheDocument()
    expect(screen.queryByText("credential-secret")).not.toBeInTheDocument()
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.AIHUBMIX])(
    "does not render legacy compatibility values for %s",
    async (siteType) => {
      renderCard(siteType)
      await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )

      expect(screen.queryByText("987654321")).not.toBeInTheDocument()
      expect(screen.queryByText("876543210")).not.toBeInTheDocument()
      expect(screen.queryByText("765432109")).not.toBeInTheDocument()
      expect(screen.queryByText("654321098")).not.toBeInTheDocument()
      expect(
        screen.getAllByText("common:labels.notAvailable").length,
      ).toBeGreaterThanOrEqual(3)
    },
  )

  it.each(["absent", "zero"] as const)(
    "renders the %s legacy consumption counter after reload normalization",
    async (counter) => {
      const stored = buildSiteAccount({
        account_info: {
          ...buildSiteAccount().account_info,
          today_quota_consumption: 0,
          settledConsumption: undefined,
          todayStatsAvailability: {
            consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          },
        },
      })
      if (counter === "absent") {
        Reflect.deleteProperty(stored.account_info, "today_quota_consumption")
      }
      const account = normalizeSiteAccount(stored)
      render(
        <DedupeAccountCard
          account={account}
          group={{
            groupId: "group-1",
            keepAccountId: account.id,
            recommendedKeepAccountId: account.id,
            hasManualOverride: false,
            reason: "same_origin_user",
          }}
          accountLabelById={new Map([[account.id, "Account"]])}
          pinnedAccountIds={[]}
          detailsOpenByAccountId={{ [account.id]: true }}
          isWorking={false}
          t={t}
          onKeepChange={vi.fn()}
          onToggleDetails={vi.fn()}
        />,
      )
      const label = await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )
      expect(label.closest("dt")?.nextElementSibling).toHaveTextContent(
        counter === "zero" ? "0" : "—",
      )
      if (counter === "absent") {
        expect(label.closest("dt")?.nextElementSibling).not.toHaveTextContent(
          "0",
        )
      }
    },
  )

  it.each(["complete", "partial"] as const)(
    "renders today's tokens, requests and %s consumption",
    async (coverage) => {
      const native = true
      const id = "dedupe-account"
      const account = buildSiteAccount({
        id,
        account_info: {
          ...buildSiteAccount().account_info,
          today_quota_consumption: native ? 0 : 987654321,
          settledConsumption: native
            ? [
                buildFinancialPeriodFact({
                  accountId: id,
                  value: "0.123456789123456789",
                  coverage: coverage === "partial" ? "partial" : "complete",
                }),
              ]
            : undefined,
          today_requests_count: 876543210,
          today_prompt_tokens: 765432109,
          today_completion_tokens: 654321098,
          todayStatsAvailability: {
            consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          },
        },
      })

      render(
        <DedupeAccountCard
          account={account}
          group={{
            groupId: "group-1",
            keepAccountId: account.id,
            recommendedKeepAccountId: account.id,
            hasManualOverride: false,
            reason: "same_origin_user",
          }}
          accountLabelById={new Map([[account.id, "Account"]])}
          pinnedAccountIds={[]}
          detailsOpenByAccountId={{ [account.id]: true }}
          isWorking={false}
          t={t}
          onKeepChange={vi.fn()}
          onToggleDetails={vi.fn()}
        />,
      )

      const consumptionLabel = await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )
      expect(
        consumptionLabel.closest("dt")?.nextElementSibling,
      ).toHaveTextContent(native ? "0.123456789123456789" : "987654321")
      if (coverage === "partial") {
        expect(
          consumptionLabel.closest("dt")?.nextElementSibling,
        ).toHaveTextContent("account:todayMetricAvailability.partial")
      } else {
        expect(
          consumptionLabel.closest("dt")?.nextElementSibling,
        ).not.toHaveTextContent("account:todayMetricAvailability.partial")
      }
      expect(screen.getByText("876543210")).toBeInTheDocument()
      const tokensDetail = screen.getByText(
        "ui:dialog.dedupeAccounts.details.todayTokens",
      ).parentElement
      expect(tokensDetail).toHaveTextContent("765432109")
      expect(tokensDetail).toHaveTextContent("654321098")
    },
  )

  it("renders complete request and token counts without treating legacy quota as money", async () => {
    const account = buildSiteAccount({
      account_info: {
        ...buildSiteAccount().account_info,
        today_quota_consumption: 987654321,
        today_requests_count: 876543210,
        today_prompt_tokens: 765432109,
        today_completion_tokens: 654321098,
        todayStatsAvailability: {
          consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        },
      },
    })

    render(
      <DedupeAccountCard
        account={account}
        group={{
          groupId: "group-1",
          keepAccountId: account.id,
          recommendedKeepAccountId: account.id,
          hasManualOverride: false,
          reason: "same_origin_user",
        }}
        accountLabelById={new Map([[account.id, "Account"]])}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{ [account.id]: true }}
        isWorking={false}
        t={t}
        onKeepChange={vi.fn()}
        onToggleDetails={vi.fn()}
      />,
    )

    await screen.findByText("ui:dialog.dedupeAccounts.details.todayConsumption")

    expect(screen.queryByText("987654321")).not.toBeInTheDocument()
    expect(screen.getByText("876543210")).toBeInTheDocument()
    const tokensDetail = screen.getByText(
      "ui:dialog.dedupeAccounts.details.todayTokens",
    ).parentElement
    expect(tokensDetail).toHaveTextContent("765432109")
    expect(tokensDetail).toHaveTextContent("654321098")
  })

  it("keeps the summed token value when token coverage is partial", async () => {
    const account = buildSiteAccount({
      account_info: {
        ...buildSiteAccount().account_info,
        today_prompt_tokens: 765432109,
        today_completion_tokens: 654321098,
        todayStatsAvailability: {
          consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          tokens: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
          },
          income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        },
      },
    })

    render(
      <DedupeAccountCard
        account={account}
        group={{
          groupId: "group-1",
          keepAccountId: account.id,
          recommendedKeepAccountId: account.id,
          hasManualOverride: false,
          reason: "same_origin_user",
        }}
        accountLabelById={new Map([[account.id, "Account"]])}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{ [account.id]: true }}
        isWorking={false}
        t={t}
        onKeepChange={vi.fn()}
        onToggleDetails={vi.fn()}
      />,
    )

    const tokenValue = await screen.findByText(/1419753207/)
    expect(tokenValue).toHaveTextContent("1419753207")
    expect(tokenValue).toHaveTextContent(
      "account:todayMetricAvailability.partial",
    )
  })

  it("shows pending refresh for missing legacy consumption and unavailable counters", async () => {
    const account = buildSiteAccount({
      account_info: {
        ...buildSiteAccount().account_info,
        today_quota_consumption: 987654321,
        today_requests_count: 876543210,
        today_prompt_tokens: 765432109,
        today_completion_tokens: 654321098,
        todayStatsAvailability: {
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
          },
          requests: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
          },
          tokens: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
          },
          income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        },
      },
    })
    delete (account.account_info as Partial<typeof account.account_info>)
      .today_quota_consumption

    render(
      <DedupeAccountCard
        account={account}
        group={{
          groupId: "group-1",
          keepAccountId: account.id,
          recommendedKeepAccountId: account.id,
          hasManualOverride: false,
          reason: "same_origin_user",
        }}
        accountLabelById={new Map([[account.id, "Account"]])}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{ [account.id]: true }}
        isWorking={false}
        t={t}
        onKeepChange={vi.fn()}
        onToggleDetails={vi.fn()}
      />,
    )

    for (const label of [
      "ui:dialog.dedupeAccounts.details.todayConsumption",
      "ui:dialog.dedupeAccounts.details.todayRequests",
      "ui:dialog.dedupeAccounts.details.todayTokens",
    ]) {
      const detail = (await screen.findByText(label)).closest("dt")!
        .parentElement as HTMLElement
      const pendingValue = within(detail).getByLabelText(
        "account:todayMetricAvailability.pendingRefreshHelp",
      )
      expect(pendingValue).toHaveTextContent(
        "account:todayMetricAvailability.pendingRefresh",
      )
      expect(pendingValue).not.toHaveTextContent("—")
    }

    expect(
      screen.queryByText(/987654321|876543210|765432109|654321098/),
    ).toBeNull()
  })

  it("keeps non-legacy unavailable metrics as an accessible dash", async () => {
    const account = buildSiteAccount({
      account_info: {
        ...buildSiteAccount().account_info,
        today_quota_consumption: 987654321,
        legacyFinancial: {
          schemaVersion: 1,
          capturedAt: Date.now(),
          cashflow: {},
        },
        todayStatsAvailability: {
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
          requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        },
      },
    })

    render(
      <DedupeAccountCard
        account={account}
        group={{
          groupId: "group-1",
          keepAccountId: account.id,
          recommendedKeepAccountId: account.id,
          hasManualOverride: false,
          reason: "same_origin_user",
        }}
        accountLabelById={new Map([[account.id, "Account"]])}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{ [account.id]: true }}
        isWorking={false}
        t={t}
        onKeepChange={vi.fn()}
        onToggleDetails={vi.fn()}
      />,
    )

    const consumptionDetail = (
      await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )
    ).closest("dt")!.parentElement as HTMLElement
    expect(
      within(consumptionDetail).getByLabelText(
        "account:todayMetricAvailability.unavailable",
      ),
    ).toHaveTextContent("—")
    expect(within(consumptionDetail).queryByText("987654321")).toBeNull()
  })
})
