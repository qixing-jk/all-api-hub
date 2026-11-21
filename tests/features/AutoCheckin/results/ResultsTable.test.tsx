import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, onTestFinished, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import ResultsTable from "~/features/AutoCheckin/results/ResultsTable"
import accountLocale from "~/locales/en/account.json"
import autoCheckinLocale from "~/locales/en/autoCheckin.json"
import balanceHistoryLocale from "~/locales/en/balanceHistory.json"
import type { ConfirmedAward } from "~/services/amounts/awards"
import { observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { EMRANK_TOKEN_ASSET } from "~/services/apiService/emrank/constants"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { toggleDevUnlocked } from "~/utils/core/devMode"
import { openTargetedOptionsPage } from "~/utils/navigation/optionsPage"
import {
  buildCheckInConfig,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

vi.mock("~/utils/navigation/optionsPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation/optionsPage")>()),
  openTargetedOptionsPage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("~/components/AccountLinkButton", () => ({
  default: ({ accountName }: { accountName: string }) => (
    <button type="button">{accountName}</button>
  ),
}))

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()
  const toAnalyticsActionAttribute = (analyticsAction: unknown) => {
    if (!analyticsAction) return undefined
    if (typeof analyticsAction === "object") {
      const action = analyticsAction as {
        featureId?: string
        actionId?: string
        surfaceId?: string
        entrypoint?: string
      }
      return `${action.featureId}:${action.actionId}:${action.surfaceId}:${action.entrypoint}`
    }

    if (
      analyticsAction ===
      PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinManualSignIn
    ) {
      return `${PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}:${analyticsAction}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`
    }

    return `${PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}:${analyticsAction}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`
  }

  return {
    ...actual,
    Button: ({
      analyticsAction,
      children,
      leftIcon,
      rightIcon,
      loading: _loading,
      ...props
    }: any) => (
      <button
        type="button"
        data-analytics-action={toAnalyticsActionAttribute(analyticsAction)}
        {...props}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    ),
    Card: ({ children }: any) => <div>{children}</div>,
  }
})

const failedResult: CheckinAccountResult = {
  accountId: "account-private-id",
  accountName: "Private Account",
  status: CHECKIN_RESULT_STATUS.FAILED,
  messageKey: "autoCheckin:providerFallback.checkinFailed",
  timestamp: Date.UTC(2026, 4, 13, 1, 0, 0),
}

const confirmedAward = (
  overrides: Partial<ConfirmedAward> = {},
): ConfirmedAward => ({
  id: "daily",
  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  amount: {
    status: OBSERVATION_STATUSES.Known,
    value: "2",
    observedAt: 1000,
    source: {
      adapter: "test-site",
      operation: "/claim",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
      inputs: ["grant"],
    },
  },
  scope: {
    subject: {
      kind: FINANCIAL_SUBJECT_KINDS.Account,
      accountId: failedResult.accountId,
    },
    authority: "https://award.example",
    walletId: "welfare",
    models: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["model-a"] },
    keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
  },
  validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
  target: AWARD_TARGETS.Wallet,
  fulfillment: AWARD_FULFILLMENT.Credited,
  ...overrides,
})

describe("AutoCheckin ResultsTable", () => {
  it.each([
    { currency: undefined, expected: "+CNY 7" },
    { currency: CURRENCIES.USD, expected: "+$1.00" },
  ])(
    "shows a yuan award as $expected in the selected display mode",
    async ({ currency, expected }) => {
      const native = confirmedAward({
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        amount: observeAmount("7", confirmedAward().amount.source, 1000),
      })
      render(
        <ResultsTable
          results={[{ ...failedResult, awards: [native] }]}
          currencyType={currency}
          accountInfoById={{
            [failedResult.accountId]: buildDisplaySiteData({
              id: failedResult.accountId,
              exchangeRate: 7,
            }),
          }}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      expect(await screen.findByText(expected)).toBeVisible()
    },
  )
  it("reveals exact native amount, source, restrictions and expiry without implying redemption", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: {
        account: accountLocale,
        autoCheckin: autoCheckinLocale,
        balanceHistory: balanceHistoryLocale,
      },
    })
    const precise = "0.1234567890123456789012345"
    render(
      <I18nextProvider i18n={i18n}>
        <ResultsTable
          results={[
            {
              ...failedResult,
              awards: [
                confirmedAward({
                  amount: {
                    status: OBSERVATION_STATUSES.Known,
                    value: precise,
                    observedAt: 1000,
                    source: {
                      adapter: "test-site",
                      operation: "/claim",
                      contractVersion: "1",
                      kind: EVIDENCE_KINDS.Reported,
                      inputs: ["grant"],
                    },
                  },
                  validity: {
                    kind: BALANCE_VALIDITY_KINDS.Expires,
                    at: Date.UTC(2026, 10, 12),
                  },
                  fulfillment: AWARD_FULFILLMENT.PendingRedemption,
                }),
              ],
            },
          ]}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.click(
      await screen.findByText(i18n.t("autoCheckin:execution.awards.details")),
    )
    expect(screen.getByText(`${precise} USD`)).toBeVisible()
    expect(screen.queryByText(/test-site\/\/claim@1/)).not.toBeInTheDocument()
    expect(screen.getByText(i18n.t("account:financial.reported"))).toBeVisible()
    expect(screen.getAllByText(/model-a/)[0]).toBeVisible()
    expect(
      screen.queryByText(/https:\/\/award.example/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(new RegExp(i18n.t("account:financial.scopeUnknown"))),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Expires:/)).toBeVisible()
    expect(
      screen.getByText(
        i18n.t("autoCheckin:execution.awards.pendingRedemption"),
      ),
    ).toBeVisible()
  })
  it.each([false, true])(
    "keeps unknown metadata and redemption references in collapsed developer details (unlocked=%s)",
    async (unlocked) => {
      if (unlocked) {
        toggleDevUnlocked()
        onTestFinished(() => {
          toggleDevUnlocked()
        })
      }
      const user = userEvent.setup()
      const i18n = await createResourceTestI18n({
        en: {
          account: accountLocale,
          autoCheckin: autoCheckinLocale,
          balanceHistory: balanceHistoryLocale,
        },
      })
      render(
        <I18nextProvider i18n={i18n}>
          <ResultsTable
            results={[
              {
                ...failedResult,
                awards: [
                  confirmedAward({
                    exchangedFrom: { namespace: "campaign", id: "raw-event" },
                    fulfillment: AWARD_FULFILLMENT.Redeemed,
                  }),
                ],
              },
            ]}
          />
        </I18nextProvider>,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      await user.click(
        await screen.findByText(i18n.t("autoCheckin:execution.awards.details")),
      )
      expect(screen.getAllByText(/model-a/)[0]).toBeVisible()
      expect(
        screen.getByText(i18n.t("autoCheckin:execution.awards.redeemed")),
      ).toBeVisible()
      if (unlocked) {
        expect(screen.getByText(/https:\/\/award.example/)).not.toBeVisible()
        expect(screen.getByText(/campaign\/raw-event/)).not.toBeVisible()
        await user.click(
          screen.getByText(i18n.t("account:financial.technicalDetails")),
        )
        expect(screen.getByText(/https:\/\/award.example/)).toBeVisible()
        expect(screen.getByText(/campaign\/raw-event/)).toBeVisible()
        expect(
          screen.getByText(i18n.t("account:financial.validityUnknown")),
        ).toBeVisible()
        expect(
          screen.getAllByText(
            new RegExp(i18n.t("account:financial.scopeUnknown")),
          ).length,
        ).toBeGreaterThan(0)
      } else {
        expect(
          screen.queryByText(
            /https:\/\/award.example|campaign\/raw-event|Usage scope unverified/,
          ),
        ).not.toBeInTheDocument()
        expect(
          screen.queryByText(i18n.t("account:financial.validityUnknown")),
        ).not.toBeInTheDocument()
      }
    },
  )

  it("retains a reported no-expiry award without unknown scope placeholders", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            ...failedResult,
            awards: [
              confirmedAward({
                validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
              }),
            ],
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.click(
      await screen.findByText("autoCheckin:execution.awards.details"),
    )
    expect(
      screen.getByText("autoCheckin:execution.awards.noExpiry"),
    ).toBeVisible()
    expect(
      screen.queryByText("account:financial.validityUnknown"),
    ).not.toBeInTheDocument()
  })
  it("keeps multiple original-asset grants visible after a later campaign fails", async () => {
    render(
      <ResultsTable
        results={[
          {
            ...failedResult,
            awards: [
              confirmedAward(),
              confirmedAward({
                id: "points",
                asset: {
                  kind: ASSET_KINDS.Quota,
                  id: "site:welfare",
                  label: "credits",
                  displayScale: 1,
                  displayLabel: "credits",
                },
                amount: {
                  ...confirmedAward().amount,
                  status: OBSERVATION_STATUSES.Known,
                  value: "42",
                  observedAt: 1000,
                },
                fulfillment: AWARD_FULFILLMENT.PendingRedemption,
              }),
            ],
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(await screen.findByText("+USD 2")).toBeVisible()
    expect(screen.getByText("+42 credits")).toBeVisible()
    expect(
      screen.getByText("autoCheckin:execution.status.failed"),
    ).toBeVisible()
    expect(
      screen.getByText("autoCheckin:execution.awards.pendingRedemption"),
    ).toBeVisible()
  })
  it.each([undefined, AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn])(
    "guides a credential-blocked account using current selection over historical %s",
    async (methodId) => {
      const account = buildDisplaySiteData({
        id: failedResult.accountId,
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://xingya.site",
        authType: AuthTypeEnum.Cookie,
        checkIn: buildCheckInConfig({
          selection: {
            mode: "manual",
            methodId: AUTO_CHECKIN_METHOD_IDS.XingyaDailyCheckIn,
          },
          methodKnowledge: {
            methods: {
              [AUTO_CHECKIN_METHOD_IDS.XingyaDailyCheckIn]: {
                detection: {
                  outcome: "matched",
                  evidence: {
                    source: "probe",
                    observedAt: failedResult.timestamp,
                  },
                },
              },
            },
          },
        }),
      })
      render(
        <ResultsTable
          results={[
            {
              accountId: account.id,
              accountName: failedResult.accountName,
              timestamp: failedResult.timestamp,
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
              methodId,
            },
          ]}
          accountInfoById={{ [account.id]: account }}
        />,
      )
      await userEvent.setup().click(
        await screen.findByRole("button", {
          name: "accountDialog:login.configure",
        }),
      )
      expect(openTargetedOptionsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          inPageSearchParams: expect.objectContaining({
            accountId: account.id,
            focusSection: "account-login",
          }),
        }),
      )
    },
  )

  it.each([
    [
      AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn,
      AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_REQUIRED,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.XingyaDailyCheckIn,
      AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
    ],
    [
      AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    ],
  ])(
    "takes a blocked %s account to its login configuration even with Access Token auth",
    async (methodId, reasonCode) => {
      const account = buildDisplaySiteData({
        id: failedResult.accountId,
        siteType: SITE_TYPES.NEW_API,
        baseUrl:
          methodId === AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn
            ? "https://agentrouter.org"
            : "https://xingya.site",
        authType: AuthTypeEnum.AccessToken,
        checkIn: buildCheckInConfig({
          selection: { mode: "manual", methodId },
          methodKnowledge: {
            methods: {
              [methodId]: {
                detection: {
                  outcome: "matched",
                  evidence: {
                    source: "probe",
                    observedAt: failedResult.timestamp,
                  },
                },
              },
            },
          },
        }),
      })
      const user = userEvent.setup()
      render(
        <ResultsTable
          results={[{ ...failedResult, methodId, reasonCode }]}
          accountInfoById={{ [account.id]: account }}
        />,
      )
      await user.click(
        await screen.findByRole("button", {
          name: "accountDialog:login.configure",
        }),
      )
      const { openTargetedOptionsPage } =
        await import("~/utils/navigation/optionsPage")
      expect(openTargetedOptionsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          inPageSearchParams: expect.objectContaining({
            accountId: account.id,
            focusSection: "account-login",
          }),
        }),
      )
    },
  )

  it.each([CHECKIN_RESULT_STATUS.FAILED, CHECKIN_RESULT_STATUS.SKIPPED])(
    "guides an authentication rejection to the current account's login settings (%s)",
    async (status) => {
      const account = buildDisplaySiteData({
        id: failedResult.accountId,
        siteType: SITE_TYPES.ANYROUTER,
        authType: AuthTypeEnum.Cookie,
      })
      const user = userEvent.setup()
      const result: CheckinAccountResult =
        status === CHECKIN_RESULT_STATUS.FAILED
          ? {
              ...failedResult,
              status: CHECKIN_RESULT_STATUS.FAILED,
              reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
            }
          : {
              accountId: account.id,
              accountName: failedResult.accountName,
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
              timestamp: failedResult.timestamp,
            }
      render(
        <ResultsTable
          results={[result]}
          accountInfoById={{ [account.id]: account }}
        />,
      )
      await screen.findByText(failedResult.accountName)
      await user.click(
        screen.getByRole("button", {
          name: "accountDialog:login.configureRecovery",
        }),
      )
      expect(openTargetedOptionsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          inPageSearchParams: {
            action: "edit",
            accountId: account.id,
            focusSection: "account-login",
          },
        }),
      )
    },
  )

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.ANYROUTER])(
    "does not use a verification-required result as login recovery guidance (%s)",
    async (siteType) => {
      const account = buildDisplaySiteData({
        id: failedResult.accountId,
        siteType,
        authType: AuthTypeEnum.Cookie,
      })
      render(
        <ResultsTable
          results={[
            {
              ...failedResult,
              reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
            },
          ]}
          accountInfoById={{ [account.id]: account }}
        />,
      )
      await screen.findByText(failedResult.accountName)
      expect(
        screen.queryByRole("button", {
          name: "accountDialog:login.configureRecovery",
        }),
      ).not.toBeInTheDocument()
    },
  )

  it("offers an independent already-checked result filter", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "checked-now",
            accountName: "Checked Now",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 2,
          },
          {
            accountId: "already-checked",
            accountName: "Already Checked",
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await user.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.statusLabel/,
      }),
    )
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: /autoCheckin:execution\.filters\.alreadyChecked.*1/,
      }),
    )
    await user.keyboard("{Escape}")

    expect(
      screen.getByRole("button", { name: "Already Checked" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Checked Now" }),
    ).not.toBeInTheDocument()
  })

  it("sorts results from the account column header", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "beta",
            accountName: "Beta Account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 2,
          },
          {
            accountId: "alpha",
            accountName: "Alpha Account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Beta Account",
    )

    const accountSort = screen.getByRole("button", {
      name: "autoCheckin:execution.table.accountName",
    })
    await user.click(accountSort)

    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "Alpha Account",
    )
    expect(accountSort.closest("th")).toHaveAttribute("aria-sort", "ascending")
  })

  it("paginates long result lists so later accounts stay reachable", () => {
    const results = Array.from({ length: 26 }, (_, index) => ({
      accountId: `account-${index + 1}`,
      accountName: `Account ${index + 1}`,
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      timestamp: 1,
    }))

    render(<ResultsTable results={results} />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.getByRole("button", { name: "Account 1" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Account 26" }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.pagination.next",
      }),
    )

    expect(screen.getByRole("button", { name: "Account 26" })).toBeVisible()
    expect(
      screen.getByText("autoCheckin:execution.pagination.summary"),
    ).toBeVisible()
  })

  it("hides pagination when every result fits on the current page", () => {
    const results = Array.from({ length: 15 }, (_, index) => ({
      accountId: `account-${index + 1}`,
      accountName: `Account ${index + 1}`,
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      timestamp: 1,
    }))

    render(<ResultsTable results={results} />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.queryByRole("combobox", {
        name: "autoCheckin:execution.pagination.rowsPerPage",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("autoCheckin:execution.pagination.summary"),
    ).not.toBeInTheDocument()
  })

  it.each([
    CHECKIN_RESULT_STATUS.SUCCESS,
    CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ])("shows a native reward without a cash exchange rate on %s", (status) => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "native",
            accountName: "Native award",
            status,
            timestamp: 1,
            reward: { amount: 2_000_000, asset: EMRANK_TOKEN_ASSET },
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )
    expect(screen.getByText("+2 M Token")).toBeVisible()
    expect(screen.queryByText(/¥|\$/)).not.toBeInTheDocument()
  })

  it("preserves a legacy quota reward without implying a current currency value", () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "legacy",
            accountName: "Legacy account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            reward: { quota: 500_000 },
            timestamp: 1,
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(screen.getByText("+500,000 quota")).toBeVisible()
    expect(screen.getByText("account:financial.olderRecord")).toBeVisible()
    expect(
      screen.getByText("autoCheckin:execution.awards.fulfillmentUnknown"),
    ).toBeVisible()
    expect(screen.queryByText(/¥|\$/)).not.toBeInTheDocument()
  })

  it("lets users inspect an older successful reward without asking them to refresh immutable history", async () => {
    const i18n = await createResourceTestI18n({
      en: {
        account: accountLocale,
        autoCheckin: autoCheckinLocale,
        balanceHistory: balanceHistoryLocale,
      },
    })
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={i18n}>
        <ResultsTable
          results={[
            {
              accountId: "old-result",
              accountName: "Older successful account",
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              reward: { quota: 500_000 },
              timestamp: Date.parse("2026-11-17T03:00:00Z"),
            },
          ]}
        />
      </I18nextProvider>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(screen.getByText("+500,000 quota")).toBeVisible()
    expect(screen.getByText("Recorded by an older version")).toBeVisible()
    expect(
      screen.queryByText("Older record; refresh to confirm"),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByText(autoCheckinLocale.execution.awards.details),
    )
    expect(screen.getByText("500000 quota")).toBeVisible()
    expect(screen.queryByText(/refresh to confirm/i)).not.toBeInTheDocument()
  })

  it("shows a saved monetary reward at the selected account's yuan rate", () => {
    render(
      <ResultsTable
        currencyType="CNY"
        accountInfoById={{
          legacy: buildDisplaySiteData({ id: "legacy", exchangeRate: 6.5 }),
        }}
        results={[
          {
            accountId: "legacy",
            accountName: "Legacy account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            reward: { quota: 500_000 },
            timestamp: 1,
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(screen.getByText("+¥6.50")).toBeVisible()
    expect(screen.getByText("account:financial.olderRecord")).toBeVisible()
  })

  it.each([
    CHECKIN_RESULT_STATUS.FAILED,
    CHECKIN_RESULT_STATUS.SKIPPED,
    CHECKIN_RESULT_STATUS.UNCERTAIN,
    CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ])(
    "preserves legacy award evidence alongside a %s execution result",
    (status) => {
      const result = {
        accountId: "legacy",
        accountName: "Legacy account",
        status,
        reward: { quota: 500_000 },
        timestamp: 1,
      } as CheckinAccountResult
      render(<ResultsTable results={[result]} />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      expect(screen.getByText("+500,000 quota")).toBeVisible()
      expect(screen.getByText("account:financial.olderRecord")).toBeVisible()
    },
  )

  it("distinguishes a confirmed zero award from an unknown award amount", () => {
    render(
      <ResultsTable
        results={[
          {
            ...failedResult,
            awards: [
              confirmedAward({
                id: "zero",
                amount: {
                  ...confirmedAward().amount,
                  status: OBSERVATION_STATUSES.Known,
                  value: "0",
                  observedAt: 1000,
                },
              }),
              confirmedAward({
                id: "missing",
                amount: {
                  status: OBSERVATION_STATUSES.Unknown,
                  reason: "missing-field",
                  source: confirmedAward().amount.source,
                },
              }),
            ],
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(screen.getByText("+USD 0")).toBeVisible()
    expect(
      screen.getByText("autoCheckin:execution.awards.amountUnknown"),
    ).toBeVisible()
  })

  it("does not resurrect a legacy reward after canonical awards explicitly replace it", () => {
    render(
      <ResultsTable
        results={[
          {
            ...failedResult,
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            retryable: undefined,
            reconciliation: undefined,
            awards: [],
            reward: { quota: 500_000 },
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(
      screen.queryByRole("list", {
        name: "autoCheckin:execution.awards.title",
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/quota/)).not.toBeInTheDocument()
  })

  it("prioritizes failed, uncertain, and not-executed results", () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "success",
            accountName: "Success Account",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 5,
          },
          {
            accountId: "already-checked",
            accountName: "Already Checked Account",
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            timestamp: 4,
          },
          {
            accountId: "skipped",
            accountName: "Skipped Account",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            timestamp: 3,
          },
          {
            accountId: "uncertain",
            accountName: "Uncertain Account",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 2,
          },
          {
            accountId: "failed",
            accountName: "Failed Account",
            status: CHECKIN_RESULT_STATUS.FAILED,
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const rows = within(screen.getByRole("table")).getAllByRole("row")
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Failed Account"),
      expect.stringContaining("Uncertain Account"),
      expect.stringContaining("Skipped Account"),
      expect.stringContaining("Success Account"),
      expect.stringContaining("Already Checked Account"),
    ])
  })

  it("changes page size and clamps the current page when results shrink", () => {
    const createResults = (length: number) =>
      Array.from({ length }, (_, index) => ({
        accountId: `account-${index + 1}`,
        accountName: `Account ${index + 1}`,
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        timestamp: 1,
      }))
    const view = render(<ResultsTable results={createResults(26)} />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("combobox", {
        name: "autoCheckin:execution.pagination.rowsPerPage",
      }),
    )
    const pageSizeOptions = screen
      .getAllByRole("option")
      .map((option) => option.textContent)
    expect(pageSizeOptions).toEqual(expect.arrayContaining(["10", "25"]))
    fireEvent.click(screen.getByRole("option", { name: "10" }))

    expect(screen.getByRole("button", { name: "Account 10" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Account 11" }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.pagination.next",
      }),
    )
    expect(screen.getByRole("button", { name: "Account 11" })).toBeVisible()

    view.rerender(<ResultsTable results={createResults(5)} />)

    expect(screen.getByRole("button", { name: "Account 1" })).toBeVisible()
    expect(
      screen.queryByText("autoCheckin:execution.pagination.summary"),
    ).not.toBeInTheDocument()
  })

  it("shows a localized structured reason when a skipped row has no message key", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "skipped-account",
            accountName: "Skipped Account",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: "status_unavailable",
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByText("autoCheckin:skipReasons.status_unavailable"),
    ).toBeVisible()
  })

  it("shows an explicit uncertain outcome and pending-confirmation guidance", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "uncertain-account",
            accountName: "Uncertain Account",
            methodId: "new-api:daily-checkin",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 1,
          },
        ]}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByText("autoCheckin:execution.status.uncertain"),
    ).toBeVisible()
    expect(
      screen.getByText("autoCheckin:skipReasons.status_unavailable"),
    ).toBeVisible()
  })

  it("offers a retry when status discovery was temporarily unavailable", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "status-unavailable",
            accountName: "Status Unavailable",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: "status_unavailable",
            timestamp: 1,
          },
        ]}
        onRetryAccount={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).toBeVisible()
  })

  it.each([
    {
      name: "a retryable cause the provider refused to flag",
      result: {
        accountId: "session-busy",
        accountName: "Session Busy",
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "session_busy",
        retryable: false,
        timestamp: 1,
      },
      offersRetry: true,
    },
    {
      name: "a dead-end cause",
      result: {
        accountId: "auth-required",
        accountName: "Auth Required",
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "authentication_required",
        retryable: true,
        timestamp: 1,
      },
      offersRetry: false,
    },
  ] satisfies Array<{
    name: string
    result: CheckinAccountResult
    offersRetry: boolean
  }>)(
    "matches the automatic retry decision for $name",
    async ({ result, offersRetry }) => {
      render(<ResultsTable results={[result]} onRetryAccount={vi.fn()} />, {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      })

      await screen.findByRole("button", { name: "common:actions.more" })
      const retryButton = screen.queryByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      })

      if (offersRetry) {
        expect(retryButton).toBeVisible()
      } else {
        expect(retryButton).not.toBeInTheDocument()
      }
    },
  )

  it("offers status verification for uncertain results that can read status", async () => {
    const user = userEvent.setup()
    const onVerifyAccountStatus = vi.fn()
    render(
      <ResultsTable
        results={[
          {
            accountId: "uncertain-account",
            accountName: "Uncertain Account",
            methodId: "new-api:daily-checkin",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 1,
          },
        ]}
        onRetryAccount={vi.fn()}
        onVerifyAccountStatus={onVerifyAccountStatus}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.more" }),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).toBeVisible()
    await user.click(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.verifyStatus",
      }),
    )
    expect(onVerifyAccountStatus).toHaveBeenCalledWith("uncertain-account")
  })

  it("exposes verification in the row menu and shows its pending state", async () => {
    const user = userEvent.setup()
    const onVerifyAccountStatus = vi.fn()
    render(
      <ResultsTable
        results={[
          {
            accountId: "uncertain-account",
            accountName: "Uncertain Account",
            methodId: "new-api:daily-checkin",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 1,
          },
        ]}
        onVerifyAccountStatus={onVerifyAccountStatus}
        verifyingAccountId="uncertain-account"
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      await screen.findByRole("button", {
        name: "common:status.refreshing",
      }),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "common:status.refreshing",
      }),
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("invokes verification from the row menu", async () => {
    const user = userEvent.setup()
    const onVerifyAccountStatus = vi.fn()
    render(
      <ResultsTable
        results={[
          {
            accountId: "uncertain-account",
            accountName: "Uncertain Account",
            methodId: "new-api:daily-checkin",
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reconciliation: "unknown",
            timestamp: 1,
          },
        ]}
        onVerifyAccountStatus={onVerifyAccountStatus}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.more" }),
    )
    await user.click(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.verifyStatus",
      }),
    )
    expect(onVerifyAccountStatus).toHaveBeenCalledWith("uncertain-account")
  })

  it("does not attach automatic analytics metadata to explicit-tracked row actions", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[failedResult]}
        onRetryAccount={vi.fn()}
        onOpenManualSignIn={vi.fn()}
        onDisableAccount={vi.fn()}
        onDeleteAccount={vi.fn()}
        onOpenAccountSite={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.retryAccount",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.openManual",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("menuitem", {
        name: "account:actions.disableAccount",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("menuitem", {
        name: "account:actions.delete",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("menuitem", {
        name: "autoCheckin:execution.actions.openSite",
      }),
    ).not.toHaveAttribute("data-analytics-action")
  })
})
