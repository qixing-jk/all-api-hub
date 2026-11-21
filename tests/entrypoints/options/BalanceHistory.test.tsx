import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { echarts } from "~/components/charts/echarts"
import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistory from "~/entrypoints/options/pages/BalanceHistory"
import { BALANCE_HISTORY_TREND_CHART_TYPES } from "~/features/BalanceHistory/contracts"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import toast from "~/lib/notify"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { sendBalanceHistoryMessage } from "~/services/history/dailyBalanceHistory/messaging"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { tagStorage } from "~/services/tags/tagStorage"
import { AuthTypeEnum } from "~/types"
import {
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES,
  DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
} from "~/types/dailyBalanceHistory"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"
import { isDevUnlocked, toggleDevUnlocked } from "~/utils/core/devMode"
import { openSettingsTab } from "~/utils/navigation"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const getMetricDropdownButtonName = (
  section: "breakdown" | "trend",
  metric: string,
) =>
  new RegExp(
    `balanceHistory:${section}\\.title:\\s*${metric.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  )

function renderDesktopHistory() {
  const matchMedia = window.matchMedia
  window.matchMedia = (media) => {
    const result = matchMedia.call(window, media)
    return media === "(min-width: 1200px)"
      ? { ...result, matches: true }
      : result
  }
  onTestFinished(() => {
    window.matchMedia = matchMedia
  })
  return render(<BalanceHistory />)
}

const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/components/charts/echarts", async () => {
  return {
    echarts: {
      init: vi.fn(() => ({
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      })),
      use: vi.fn(),
    },
  }
})

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn(), getEnabledAccounts: vi.fn() },
}))

vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/services/history/dailyBalanceHistory/messaging", () => ({
  sendBalanceHistoryMessage: vi.fn(),
}))

vi.mock("~/services/protectionBypass/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/protectionBypass/client")>()
  return {
    ...actual,
    withProtectionBypassUserCommand: vi.fn(
      async (
        command: string,
        surface: string,
        work: (execution: unknown) => Promise<unknown>,
      ) => work({ version: 2, kind: "user_command", command, surface }),
    ),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
  trackProductAnalyticsActionStarted: trackProductAnalyticsActionStartedMock,
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: { getTagStore: vi.fn() },
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/browser/alarms", async () => {
  const actual = await vi.importActual<any>("~/utils/browser/alarms")
  return { ...actual, hasAlarmsAPI: vi.fn(() => true) }
})

vi.mock("~/utils/navigation", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation")
  return { ...actual, openSettingsTab: vi.fn() }
})
vi.mock("~/utils/navigation/optionsPage", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation/optionsPage")
  return { ...actual, pushWithinOptionsPage: vi.fn() }
})

describe("BalanceHistory options page", () => {
  const PAGE_TITLE = "balanceHistory:title"
  const EMPTY_TITLE = "balanceHistory:empty.title"
  const DISABLED_HINT_TITLE = "balanceHistory:hints.disabled.title"
  const CASHFLOW_WARNING_TITLE =
    "balanceHistory:warnings.cashflowDisabled.title"
  const START_DAY_LABEL = "balanceHistory:filters.startDay"
  const END_DAY_LABEL = "balanceHistory:filters.endDay"
  const QUICK_RANGE_7D_LABEL = "balanceHistory:filters.quickRanges.7d"
  const TAG_FILTER_LABEL = "balanceHistory:filters.tags"
  const FILTERS_BUTTON_LABEL = "balanceHistory:filters.title"

  const DEFAULT_RETENTION_DAYS = 30
  const DEFAULT_THEME_MODE = "light" as const

  type MockUserPreferencesContextValue = ReturnType<
    typeof useUserPreferencesContext
  >

  const createMockUserPreferencesContext = ({
    showTodayCashflow = true,
    enabled = false,
    endOfDayCaptureEnabled = false,
    estimatedTodayIncomeEnabled = false,
    retentionDays = DEFAULT_RETENTION_DAYS,
    currencyType = CURRENCIES.USD,
  }: {
    showTodayCashflow?: boolean
    enabled?: boolean
    endOfDayCaptureEnabled?: boolean
    estimatedTodayIncomeEnabled?: boolean
    retentionDays?: number
    currencyType?: "USD" | "CNY"
  } = {}) =>
    ({
      preferences: {
        showTodayCashflow,
        balanceHistory: {
          enabled,
          endOfDayCapture: { enabled: endOfDayCaptureEnabled },
          estimatedTodayIncome: { enabled: estimatedTodayIncomeEnabled },
          retentionDays,
        },
      },
      currencyType,
      updateCurrencyType: vi.fn(async () => {}),
      themeMode: DEFAULT_THEME_MODE,
      updateThemeMode: vi.fn(async () => {}),
      loadPreferences: vi.fn(),
    }) as unknown as MockUserPreferencesContextValue

  const createDeferred = <T,>() => {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve, reject }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([] as any)
    vi.mocked(tagStorage.getTagStore).mockResolvedValue({
      version: 1,
      tagsById: {},
    } as any)
    vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      referenceSnapshotsByAccountId: {},
    } as any)

    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createMockUserPreferencesContext({ enabled: true }),
    )
  })

  it("shows a hint to enable Balance History when capture is disabled", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createMockUserPreferencesContext({ enabled: false }),
    )

    render(<BalanceHistory />)

    expect(await screen.findByText(DISABLED_HINT_TITLE)).toBeInTheDocument()
    expect(screen.queryByText(TAG_FILTER_LABEL)).toBeNull()
    expect(screen.queryByText(EMPTY_TITLE)).toBeNull()
  })

  it("shows a retryable read error instead of an empty history state", async () => {
    vi.mocked(dailyBalanceHistoryStorage.getStore).mockRejectedValueOnce(
      new Error("unsupported_balance_history_version"),
    )
    render(<BalanceHistory />)
    expect(
      await screen.findByText("balanceHistory:messages.error.loadTitle"),
    ).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_TITLE)).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "common:actions.retry" }))
    expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument()
    expect(
      screen.queryByText("balanceHistory:messages.error.loadTitle"),
    ).not.toBeInTheDocument()
  })

  it("shows native Token history with source and gaps without a synthetic USD overview", async () => {
    if (!isDevUnlocked()) {
      toggleDevUnlocked()
      onTestFinished(() => {
        toggleDevUnlocked()
      })
    }
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "tokens",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "tokens",
          scope,
          asset: {
            kind: ASSET_KINDS.Quota,
            id: "fixture:token",
            label: "Token",
            displayLabel: "Token",
            displayScale: 1,
          },
          value: "4500",
          observedAt: now,
          source: {
            adapter: "fixture",
            operation: "console",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
      now,
      FINANCIAL_COVERAGE.Complete,
    )
    vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
      {
        id: "tokens",
        site_name: "Token Wallet",
        site_url: "https://fixture.invalid",
        site_type: SITE_TYPES.DAHL,
        account_info: {
          username: "user",
          nativeBalance: { amount: 4500, unit: "token" },
        },
      },
    ] as any)
    vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        tokens: [
          { balance, source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh },
        ],
      },
    })
    render(<BalanceHistory />)
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: /4,?500 Token/ }),
    )
    const records = within(screen.getByRole("dialog"))
    const sourceDetails = screen.getByText(/fixture\/console@1/)
    const scopeDetails = screen.getByText(/balanceHistory:native.scope:/)
    expect(sourceDetails).not.toBeVisible()
    expect(scopeDetails).not.toBeVisible()
    await user.click(records.getByText("account:financial.technicalDetails"))
    expect(sourceDetails).toBeVisible()
    expect(scopeDetails).toBeVisible()
    expect(
      screen.getAllByText("balanceHistory:native.restrictions"),
    ).toHaveLength(4)
    for (const restriction of screen.getAllByText(
      "balanceHistory:native.restrictions",
    ))
      expect(restriction).toBeVisible()
    await user.click(records.getByText("account:financial.technicalDetails"))
    expect(sourceDetails).not.toBeVisible()
    expect(records.getByRole("cell", { name: /4,?500 Token/ })).toBeVisible()
    expect(screen.queryByText(EMPTY_TITLE)).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: FILTERS_BUTTON_LABEL }))
    expect(
      await screen.findByRole("button", { name: "Token Wallet" }),
    ).toBeEnabled()
  })

  it.each(["account", "date"])(
    "restores the legacy overview when the %s filter excludes native history",
    async (filter) => {
      const now = Date.now()
      const earlier = now - 10 * 86_400_000
      const today = getDayKeyFromUnixSeconds(now / 1000)
      const scope = accountBalanceScope({
        baseUrl: "https://native.invalid",
        accountId: "native",
        auth: { authType: AuthTypeEnum.AccessToken },
      })
      const balance = accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "wallet",
            scope,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            value: "8",
            observedAt: earlier,
            source: {
              adapter: "fixture",
              operation: "account",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          }),
        ],
        earlier,
        FINANCIAL_COVERAGE.Complete,
      )
      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "native",
          site_name: "Native Only",
          site_url: "https://native.invalid",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "native" },
        },
        {
          id: "legacy",
          site_name: "Legacy Only",
          site_url: "https://legacy.invalid",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "legacy" },
        },
      ] as any)
      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {
          legacy: {
            [today]: {
              balanceUsd: 1,
              incomeUsd: 0,
              consumptionUsd: 0,
              capturedAt: now,
              source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            },
          },
        },
        financialSnapshotsByAccountId: {
          native: [
            { balance, source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh },
          ],
        },
      })
      render(<BalanceHistory />)
      expect(await screen.findByText("8 CNY")).toBeInTheDocument()
      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", { name: FILTERS_BUTTON_LABEL }),
      )
      if (filter === "account")
        await user.click(screen.getByRole("button", { name: "Legacy Only" }))
      else {
        fireEvent.change(screen.getByLabelText(START_DAY_LABEL), {
          target: { value: today },
        })
        fireEvent.blur(screen.getByLabelText(START_DAY_LABEL))
      }
      await user.keyboard("{Escape}")
      expect(
        await screen.findByText(
          "balanceHistory:overview.kpis.endBalance.label",
        ),
      ).toBeVisible()
      expect(
        screen.getByTestId(BALANCE_HISTORY_TEST_IDS.accountSummary),
      ).toBeVisible()
      expect(
        screen.queryByRole("columnheader", {
          name: "balanceHistory:native.amountsTitle",
        }),
      ).not.toBeInTheDocument()
    },
  )

  it.each(["deadline", "focus", "visibility"])(
    "updates expiry and reset on %s without moving the amount observation time",
    async (trigger) => {
      const now = new Date(2026, 10, 11, 12).getTime()
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
      vi.setSystemTime(now)
      try {
        const scope = accountBalanceScope({
          baseUrl: "https://timed.invalid",
          accountId: "timed",
          auth: { authType: AuthTypeEnum.AccessToken },
        })
        const balance = accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "plan",
              scope,
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              value: "9",
              observedAt: now,
              validity: {
                kind: BALANCE_VALIDITY_KINDS.Expires,
                at: now + 1000,
              },
              window: {
                start: now - 1000,
                end: now + 2000,
                resetsAt: now + 2000,
                timeZone: "UTC",
              },
              source: {
                adapter: "fixture",
                operation: "account",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
              },
            }),
          ],
          now,
          FINANCIAL_COVERAGE.Complete,
        )
        vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
          {
            id: "timed",
            site_name: "Timed Plan",
            site_url: "https://timed.invalid",
            site_type: SITE_TYPES.ONE_API,
            account_info: { username: "timed" },
          },
        ] as any)
        vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
          schemaVersion: 4,
          referenceSnapshotsByAccountId: {},
          financialSnapshotsByAccountId: {
            timed: [
              {
                balance,
                source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
              },
            ],
          },
        })
        await act(async () => {
          render(<BalanceHistory />)
        })
        fireEvent.click(screen.getByRole("button", { name: /9 CNY/ }))
        const records = within(screen.getByRole("dialog"))
        const originalRow = records
          .getByRole("cell", { name: "9 CNY" })
          .closest("tr")?.textContent
        expect(
          records.queryByRole("cell", {
            name: "balanceHistory:native.expired",
          }),
        ).not.toBeInTheDocument()
        expect(
          records.queryByRole("cell", { name: "balanceHistory:native.reset" }),
        ).not.toBeInTheDocument()
        await act(async () => {
          if (trigger === "deadline") await vi.advanceTimersByTimeAsync(2500)
          else {
            vi.setSystemTime(now + 2500)
            if (trigger === "focus") fireEvent.focus(window)
            else fireEvent(document, new Event("visibilitychange"))
          }
        })
        expect(
          records.getByRole("cell", { name: "balanceHistory:native.expired" }),
        ).toBeInTheDocument()
        expect(
          records.getByRole("cell", { name: "balanceHistory:native.reset" }),
        ).toBeInTheDocument()
        expect(
          records.getByRole("cell", { name: "9 CNY" }).closest("tr")
            ?.textContent,
        ).toBe(originalRow)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("keeps an account selectable when only an expiry event falls within the date filter", async () => {
    const now = Date.now()
    const scope = accountBalanceScope({
      baseUrl: "https://fixture.invalid",
      accountId: "expired",
      auth: { authType: AuthTypeEnum.AccessToken },
    })
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "plan",
          scope,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          value: "10",
          observedAt: now - 35 * 86_400_000,
          validity: {
            kind: BALANCE_VALIDITY_KINDS.Expires,
            at: now - 86_400_000,
          },
          source: {
            adapter: "fixture",
            operation: "account",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
      now - 35 * 86_400_000,
      FINANCIAL_COVERAGE.Complete,
    )
    vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
      {
        id: "expired",
        site_name: "Expired Plan",
        site_url: "https://fixture.invalid",
        site_type: SITE_TYPES.DAHL,
        account_info: { username: "user" },
      },
    ] as any)
    vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        expired: [
          { balance, source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh },
        ],
      },
    })
    render(<BalanceHistory />)
    expect(
      await screen.findByText("balanceHistory:native.expired"),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: FILTERS_BUTTON_LABEL }))
    expect(
      await screen.findByRole("button", { name: "Expired Plan" }),
    ).toBeEnabled()
  })

  it.each(["stored", "missing"])(
    "renders the empty state with %s capture preferences when no snapshots exist",
    async (preferenceState) => {
      const context = createMockUserPreferencesContext({ enabled: true })
      if (preferenceState === "missing") {
        delete context.preferences.balanceHistory
      }
      vi.mocked(useUserPreferencesContext).mockReturnValue(context)

      render(<BalanceHistory />)

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()
      expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument()
      expect(screen.queryByText(DISABLED_HINT_TITLE)).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: FILTERS_BUTTON_LABEL }),
      ).toBeInTheDocument()
    },
  )

  it("keeps filters in a closed sheet and restores the trigger after close and Escape", async () => {
    render(<BalanceHistory />)

    const trigger = await screen.findByRole("button", {
      name: FILTERS_BUTTON_LABEL,
    })
    expect(screen.queryByLabelText(START_DAY_LABEL)).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(trigger)
    expect(
      await screen.findByRole("dialog", { name: FILTERS_BUTTON_LABEL }),
    ).toBeInTheDocument()
    expect(await screen.findByLabelText(START_DAY_LABEL)).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    await waitFor(() => {
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    await user.click(trigger)
    expect(
      await screen.findByRole("dialog", { name: FILTERS_BUTTON_LABEL }),
    ).toBeInTheDocument()
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("preserves filter selection when the sheet is closed and reopened", async () => {
    const fixedNowMs = new Date(2026, 1, 7, 12, 0, 0).getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      render(<BalanceHistory />)

      const user = userEvent.setup()
      const trigger = await screen.findByRole("button", {
        name: FILTERS_BUTTON_LABEL,
      })
      await user.click(trigger)
      const startInput = await screen.findByLabelText(START_DAY_LABEL)
      const expectedStart = subtractDaysFromDayKey(
        getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000)),
        6,
      )
      await user.click(
        screen.getByRole("button", { name: QUICK_RANGE_7D_LABEL }),
      )
      await waitFor(() => expect(startInput).toHaveValue(expectedStart))
      await user.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await waitFor(() => expect(trigger).toHaveFocus())

      await user.click(trigger)
      expect(await screen.findByLabelText(START_DAY_LABEL)).toHaveValue(
        expectedStart,
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("shows a cashflow warning when showTodayCashflow is disabled and end-of-day capture is disabled", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createMockUserPreferencesContext({
        showTodayCashflow: false,
        enabled: true,
      }),
    )

    render(<BalanceHistory />)

    expect(await screen.findByText(CASHFLOW_WARNING_TITLE)).toBeInTheDocument()
  })

  it("filters account options by selected tags", async () => {
    const escapeRegExp = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    const SITE_TYPE = SITE_TYPES.ONE_API

    const ACCOUNT_ID_A = "a1"
    const ACCOUNT_ID_B = "a2"

    const SITE_A_NAME = "Site A"
    const SITE_B_NAME = "Site B"

    const SITE_A_URL = "https://a.example.com"
    const SITE_B_URL = "https://b.example.com"

    const USER_A_USERNAME = "User A"
    const USER_B_USERNAME = "User B"

    const ACCOUNT_OPTION_LABEL_A = SITE_A_NAME
    const ACCOUNT_OPTION_LABEL_B = SITE_B_NAME

    const TAG_ID_WORK = "t1"
    const TAG_ID_HOME = "t2"

    const TAG_NAME_WORK = "Work"
    const TAG_NAME_HOME = "Home"

    const TAG_WORK_ACCOUNT_COUNT = 1
    const TAG_CHIP_NAME_WORK = new RegExp(
      `^${escapeRegExp(TAG_NAME_WORK)}\\D*${TAG_WORK_ACCOUNT_COUNT}$`,
    )

    vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
      {
        id: ACCOUNT_ID_A,
        site_name: SITE_A_NAME,
        site_url: SITE_A_URL,
        site_type: SITE_TYPE,
        tagIds: [TAG_ID_WORK],
        account_info: { username: USER_A_USERNAME },
      },
      {
        id: ACCOUNT_ID_B,
        site_name: SITE_B_NAME,
        site_url: SITE_B_URL,
        site_type: SITE_TYPE,
        tagIds: [TAG_ID_HOME],
        account_info: { username: USER_B_USERNAME },
      },
    ] as any)

    vi.mocked(tagStorage.getTagStore).mockResolvedValue({
      version: 1,
      tagsById: {
        [TAG_ID_WORK]: { id: TAG_ID_WORK, name: TAG_NAME_WORK },
        [TAG_ID_HOME]: { id: TAG_ID_HOME, name: TAG_NAME_HOME },
      },
    } as any)

    render(<BalanceHistory />)

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: FILTERS_BUTTON_LABEL }),
    )

    expect(await screen.findByText(ACCOUNT_OPTION_LABEL_A)).toBeInTheDocument()
    expect(screen.getByText(ACCOUNT_OPTION_LABEL_B)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: TAG_CHIP_NAME_WORK }))

    await waitFor(() => {
      expect(screen.getByText(ACCOUNT_OPTION_LABEL_A)).toBeInTheDocument()
      expect(screen.queryByText(ACCOUNT_OPTION_LABEL_B)).toBeNull()
    })
  })

  it("shows an accessible loading indicator until the initial history is available", async () => {
    const store =
      createDeferred<
        Awaited<ReturnType<typeof dailyBalanceHistoryStorage.getStore>>
      >()
    vi.mocked(dailyBalanceHistoryStorage.getStore).mockReturnValueOnce(
      store.promise,
    )
    render(<BalanceHistory />)

    expect(
      await screen.findByRole("status", {
        name: "balanceHistory:messages.loading.loadingData",
      }),
    ).toBeVisible()
    expect(
      screen.queryByText("balanceHistory:messages.loading.loadingData"),
    ).not.toBeInTheDocument()
    store.resolve({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      referenceSnapshotsByAccountId: {},
    })
    await waitFor(() =>
      expect(
        screen.queryByRole("status", {
          name: "balanceHistory:messages.loading.loadingData",
        }),
      ).not.toBeInTheDocument(),
    )
  })

  it("updates date inputs when a quick range is selected", async () => {
    const QUICK_RANGE_7D_DAYS = 7
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      render(<BalanceHistory />)

      const nowUnixSeconds = Math.floor(fixedNowMs / 1000)
      const maxDayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)

      const user = userEvent.setup()
      await user.click(
        await screen.findByRole("button", { name: FILTERS_BUTTON_LABEL }),
      )

      const startInput = await screen.findByLabelText(START_DAY_LABEL)
      const endInput = await screen.findByLabelText(END_DAY_LABEL)

      await waitFor(() => {
        expect(endInput).toHaveValue(maxDayKey)
      })

      await user.click(
        screen.getByRole("button", { name: QUICK_RANGE_7D_LABEL }),
      )

      const expectedStart = subtractDaysFromDayKey(
        maxDayKey,
        QUICK_RANGE_7D_DAYS - 1,
      )
      await waitFor(() => {
        expect(startInput).toHaveValue(expectedStart)
      })

      const startCalendar = screen.getByRole("group", { name: START_DAY_LABEL })
      await user.click(
        within(startCalendar).getByRole("button", { name: /previous month/i }),
      )
      const earlierDay = subtractDaysFromDayKey(expectedStart, 2)
      const dayButton = startCalendar.querySelector<HTMLButtonElement>(
        `[role="gridcell"][data-day="${earlierDay}"] button`,
      )
      expect(dayButton).toBeEnabled()
      await user.click(dayButton!)
      expect(startInput).toHaveValue(earlierDay)
      expect(
        screen.getByRole("button", { name: QUICK_RANGE_7D_LABEL }),
      ).toHaveAttribute("aria-pressed", "false")

      await user.keyboard("{Escape}")
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      )
      await user.click(
        screen.getByRole("button", { name: "common:actions.reset" }),
      )
      const trigger = screen.getByRole("button", { name: FILTERS_BUTTON_LABEL })
      expect(trigger).toHaveFocus()
      expect(
        screen.queryByRole("button", { name: "common:actions.reset" }),
      ).not.toBeInTheDocument()
      await user.click(trigger)
      expect(await screen.findByLabelText(START_DAY_LABEL)).toHaveValue(
        subtractDaysFromDayKey(maxDayKey, 29),
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("keeps filters available from an empty range so the user can restore data", async () => {
    const fixedNowMs = new Date(2026, 1, 7, 12, 0, 0).getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const firstDayKey = "2026-02-01"
      const lastDayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))
      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
      ] as any)
      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [firstDayKey]: {
              balanceUsd: 8,
              incomeUsd: 1,
              consumptionUsd: 1,
              capturedAt: 0,
              source: "refresh",
            },
            [lastDayKey]: {
              balanceUsd: 10,
              incomeUsd: 1,
              consumptionUsd: 1,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)

      render(<BalanceHistory />)
      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      const user = userEvent.setup()
      const filtersButton = await screen.findByRole("button", {
        name: FILTERS_BUTTON_LABEL,
      })
      await user.click(filtersButton)
      fireEvent.change(await screen.findByLabelText(START_DAY_LABEL), {
        target: { value: "2026-02-02" },
      })
      fireEvent.blur(screen.getByLabelText(START_DAY_LABEL))
      fireEvent.change(screen.getByLabelText(END_DAY_LABEL), {
        target: { value: "2026-02-06" },
      })
      fireEvent.blur(screen.getByLabelText(END_DAY_LABEL))

      expect(
        await screen.findByText("balanceHistory:emptyRange.title"),
      ).toBeInTheDocument()
      await user.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await waitFor(() => expect(filtersButton).toHaveFocus())
      expect(filtersButton).toBeInTheDocument()

      vi.mocked(echarts.init).mockClear()
      await user.click(filtersButton)
      await user.click(
        screen.getByRole("button", { name: QUICK_RANGE_7D_LABEL }),
      )
      expect(
        screen.queryByText("balanceHistory:emptyRange.title"),
      ).not.toBeInTheDocument()
      await waitFor(() => expect(vi.mocked(echarts.init)).toHaveBeenCalled())
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("renders non-empty per-account trend series for multi-account partial coverage", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const nowUnixSeconds = Math.floor(fixedNowMs / 1000)
      const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)

      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
        {
          id: "a2",
          site_name: "Site B",
          site_url: "https://b.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User B" },
        },
      ] as any)

      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 1,
              consumptionUsd: 2,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {},
        },
      } as any)

      render(<BalanceHistory />)

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      await waitFor(() => {
        expect(vi.mocked(echarts.init)).toHaveBeenCalled()
      })

      const initResults = vi.mocked(echarts.init).mock.results
      const options = initResults
        .map((result) => result.value)
        .flatMap((instance: any) =>
          instance.setOption.mock.calls.map((c: any) => c[0]),
        )

      const trendOption = options.find((option: any) =>
        option?.series?.some?.(
          (series: any) =>
            series?.type === BALANCE_HISTORY_TREND_CHART_TYPES.Line,
        ),
      )

      expect(trendOption).toBeTruthy()
      expect(trendOption.series).toHaveLength(1)

      const [seriesA] = trendOption.series
      expect(seriesA.name).toBe("Site A")
      expect(seriesA.data.some((value: any) => typeof value === "number")).toBe(
        true,
      )

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", {
          name: "balanceHistory:trend.chartTypes.bar",
        }),
      )
      expect(
        screen.getByText("balanceHistory:trend.subtitle", { exact: true }),
      ).toBeVisible()
      await user.click(
        screen.getByRole("button", {
          name: /balanceHistory:trend.controls.scope/,
        }),
      )
      await user.click(
        screen.getByRole("menuitemradio", {
          name: "balanceHistory:trend.scopes.total",
        }),
      )
      expect(
        screen.getByText("balanceHistory:trend.subtitleTotal", { exact: true }),
      ).toBeVisible()
      expect(
        screen.getByText("balanceHistory:hints.incompleteSelection.title"),
      ).toBeVisible()
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it.each([
    {
      metric: "income",
      today_income: 3,
      today_quota_consumption: null,
      expectedValue: 3,
    },
    {
      metric: "outcome",
      today_income: null,
      today_quota_consumption: 4,
      expectedValue: 4,
    },
    {
      metric: "net",
      today_income: 3,
      today_quota_consumption: 1,
      expectedValue: 2,
    },
  ] as const)(
    "renders a per-account $metric trend when only that metric is available",
    async ({
      metric,
      today_income,
      today_quota_consumption,
      expectedValue,
    }) => {
      const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
      const fixedNowMs = FIXED_NOW.getTime()
      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

      try {
        const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

        vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
          {
            id: "a1",
            site_name: "Site A",
            site_url: "https://a.example.invalid",
            site_type: SITE_TYPES.ONE_API,
            account_info: { username: "User A" },
          },
        ] as any)
        vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
          schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
          referenceSnapshotsByAccountId: {
            a1: {
              [todayKey]: {
                balanceUsd: 10,
                incomeUsd: today_income,
                consumptionUsd: today_quota_consumption,
                capturedAt: 0,
                source: "refresh",
              },
            },
          },
        } as any)

        render(<BalanceHistory />)
        expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

        const user = userEvent.setup()
        await user.click(
          screen.getByRole("button", {
            name: getMetricDropdownButtonName(
              "trend",
              "balanceHistory:metrics.balance",
            ),
          }),
        )
        await user.click(
          await screen.findByRole("menuitemradio", {
            name: `balanceHistory:metrics.${metric}`,
          }),
        )

        await waitFor(() => {
          const options = vi
            .mocked(echarts.init)
            .mock.results.map((result) => result.value)
            .flatMap((instance: any) =>
              instance.setOption.mock.calls.map((call: any) => call[0]),
            )

          const metricOption = options.find(
            (option: any) =>
              typeof option?.yAxis?.name === "string" &&
              option.yAxis.name.startsWith(`balanceHistory:metrics.${metric}`),
          )
          const accountMetricSeries = metricOption?.series?.find?.(
            (series: any) =>
              series?.type === BALANCE_HISTORY_TREND_CHART_TYPES.Line &&
              series?.name === "Site A",
          )

          expect(accountMetricSeries?.data).toContain(expectedValue)
        })
      } finally {
        dateNowSpy.mockRestore()
      }
    },
  )

  it("uses shared duplicate-name labels in account selectors and trend series", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const nowUnixSeconds = Math.floor(fixedNowMs / 1000)
      const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)

      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Shared Site",
          site_url: "https://one.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "alice" },
        },
        {
          id: "a2",
          site_name: "Shared Site",
          site_url: "https://two.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "bob" },
        },
      ] as any)

      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 1,
              consumptionUsd: 2,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            [todayKey]: {
              balanceUsd: 20,
              incomeUsd: 3,
              consumptionUsd: 4,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)

      render(<BalanceHistory />)

      expect(
        (await screen.findAllByText("Shared Site · alice")).length,
      ).toBeGreaterThan(0)
      expect(
        (await screen.findAllByText("Shared Site · bob")).length,
      ).toBeGreaterThan(0)

      await waitFor(() => {
        expect(vi.mocked(echarts.init)).toHaveBeenCalled()
      })

      const initResults = vi.mocked(echarts.init).mock.results
      const options = initResults
        .map((result) => result.value)
        .flatMap((instance: any) =>
          instance.setOption.mock.calls.map((c: any) => c[0]),
        )

      const trendOption = options.find((option: any) =>
        option?.series?.some?.(
          (series: any) => series?.name === "Shared Site · alice",
        ),
      )

      expect(trendOption).toBeTruthy()
      expect(trendOption.series.map((series: any) => series.name)).toEqual(
        expect.arrayContaining(["Shared Site · alice", "Shared Site · bob"]),
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("refreshes the selected accounts and reloads history after a successful runtime refresh", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
        {
          id: "a2",
          site_name: "Site B",
          site_url: "https://b.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User B" },
        },
      ] as any)

      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 2,
              consumptionUsd: 1,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            [todayKey]: {
              balanceUsd: 20,
              incomeUsd: 4,
              consumptionUsd: 3,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)
      vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
        success: true,
        data: { success: 1, failed: 0, refreshedCount: 1 },
      } as any)

      render(<BalanceHistory />)

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(
        await screen.findByRole("button", { name: FILTERS_BUTTON_LABEL }),
      )
      await user.click(screen.getByRole("button", { name: "Site A" }))
      await user.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      )
      await user.click(
        screen.getByRole("button", {
          name: "balanceHistory:actions.refreshNow",
        }),
      )

      await waitFor(() => {
        expect(vi.mocked(sendBalanceHistoryMessage)).toHaveBeenCalledWith(
          BalanceHistoryMessageTypes.RefreshNow,
          {
            accountIds: ["a1"],
            protectionBypassExecution: expect.objectContaining({
              version: 2,
              kind: "user_command",
              command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
              surface: PROTECTION_BYPASS_SURFACES.Options,
            }),
          },
        )
      })

      expect(
        vi.mocked(dailyBalanceHistoryStorage.getStore).mock.calls.length,
      ).toBe(2)
      expect(vi.mocked(toast.loading)).toHaveBeenCalledWith(
        "balanceHistory:messages.loading.refreshing",
      )
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "balanceHistory:messages.success.refreshCompleted",
        { id: "toast-id" },
      )
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshBalanceHistorySnapshots,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("keeps the current balance history content visible while a refresh reload is pending", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))
      const deferredStore = createDeferred<any>()

      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
      ] as any)

      vi.mocked(dailyBalanceHistoryStorage.getStore)
        .mockResolvedValueOnce({
          schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
          referenceSnapshotsByAccountId: {
            a1: {
              [todayKey]: {
                balanceUsd: 10,
                incomeUsd: 2,
                consumptionUsd: 1,
                capturedAt: 0,
                source: "refresh",
              },
            },
          },
        } as any)
        .mockReturnValueOnce(deferredStore.promise)

      vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
        success: true,
        data: { success: 1, failed: 0, refreshedCount: 1 },
      } as any)

      render(<BalanceHistory />)

      expect((await screen.findAllByText("Site A")).length).toBeGreaterThan(0)
      const getLatestTrendNumericValues = () => {
        const options = vi
          .mocked(echarts.init)
          .mock.results.map((result) => result.value)
          .flatMap((instance: any) =>
            instance.setOption.mock.calls.map((c: any) => c[0]),
          )
        const trendOption = options
          .filter((option: any) =>
            option?.series?.some?.(
              (series: any) =>
                series?.type === BALANCE_HISTORY_TREND_CHART_TYPES.Line,
            ),
          )
          .at(-1)
        return trendOption?.series?.[0]?.data?.filter(
          (value: unknown) => typeof value === "number",
        )
      }

      await waitFor(() => {
        expect(getLatestTrendNumericValues()).toEqual([10])
      })

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", {
          name: "balanceHistory:actions.refreshNow",
        }),
      )

      await waitFor(() => {
        expect(
          vi.mocked(dailyBalanceHistoryStorage.getStore),
        ).toHaveBeenCalledTimes(2)
      })

      expect(getLatestTrendNumericValues()).toEqual([10])
      expect(
        screen.queryByText("balanceHistory:messages.loading.loadingData"),
      ).not.toBeInTheDocument()

      deferredStore.resolve({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 12,
              incomeUsd: 3,
              consumptionUsd: 1,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      })

      await waitFor(() => {
        expect(getLatestTrendNumericValues()).toEqual([12])
      })
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("shows a fallback runtime error when refresh fails without a server message", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
      ] as any)

      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: null,
              consumptionUsd: null,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)
      vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
        success: false,
      } as any)

      render(<BalanceHistory />)

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", {
          name: "balanceHistory:actions.refreshNow",
        }),
      )

      await waitFor(() => {
        expect(vi.mocked(sendBalanceHistoryMessage)).toHaveBeenCalledWith(
          BalanceHistoryMessageTypes.RefreshNow,
          {
            protectionBypassExecution: expect.objectContaining({
              version: 2,
              kind: "user_command",
              command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
              surface: PROTECTION_BYPASS_SURFACES.Options,
            }),
          },
        )
      })

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "balanceHistory:messages.error.refreshFailed",
        { id: "toast-id" },
      )
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshBalanceHistorySnapshots,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("prunes balance history and reloads the page after a successful runtime request", async () => {
    vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
      success: true,
    } as any)

    render(<BalanceHistory />)

    expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:actions.prune",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(sendBalanceHistoryMessage)).toHaveBeenCalledWith(
        BalanceHistoryMessageTypes.Prune,
      )
    })

    expect(
      vi.mocked(dailyBalanceHistoryStorage.getStore).mock.calls.length,
    ).toBe(2)
    expect(vi.mocked(toast.loading)).toHaveBeenCalledWith(
      "balanceHistory:messages.loading.pruning",
    )
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "balanceHistory:messages.success.pruneCompleted",
      { id: "toast-id" },
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.PruneBalanceHistorySnapshots,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("shows a fallback runtime error when prune fails without a server message", async () => {
    vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
      success: false,
    } as any)

    render(<BalanceHistory />)

    expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:actions.prune",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(sendBalanceHistoryMessage)).toHaveBeenCalledWith(
        BalanceHistoryMessageTypes.Prune,
      )
    })

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "balanceHistory:messages.error.pruneFailed",
      { id: "toast-id" },
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.PruneBalanceHistorySnapshots,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("opens Balance History settings from the disabled hint CTA", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createMockUserPreferencesContext({ enabled: false }),
    )

    render(<BalanceHistory />)

    expect(await screen.findByText(DISABLED_HINT_TITLE)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:hints.disabled.actions.openSettings",
      }),
    )

    expect(vi.mocked(pushWithinOptionsPage)).toHaveBeenCalledWith("#basic", {
      tab: "balanceHistory",
      anchor: "balance-history",
    })
  })

  it("opens Balance History settings from the title shortcut", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createMockUserPreferencesContext({ enabled: false }),
    )

    render(<BalanceHistory />)

    expect(await screen.findByText(DISABLED_HINT_TITLE)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", {
        name: "common:labels.settings",
      }),
    )

    expect(vi.mocked(openSettingsTab)).toHaveBeenCalledWith("balanceHistory", {
      anchor: "balance-history",
      preserveHistory: true,
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenBalanceHistorySettings,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("forces histogram mode for negative net breakdown values", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
        {
          id: "a2",
          site_name: "Site B",
          site_url: "https://b.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User B" },
        },
      ] as any)

      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 1,
              consumptionUsd: 4,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 3,
              consumptionUsd: 1,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)

      renderDesktopHistory()

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      const user = userEvent.setup()

      await user.click(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.balance",
          ),
        }),
      )
      await user.click(
        await screen.findByRole("menuitemradio", {
          name: "balanceHistory:metrics.outcome",
        }),
      )
      expect(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.outcome",
          ),
        }),
      ).toBeInTheDocument()

      await user.click(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.outcome",
          ),
        }),
      )
      await user.click(
        await screen.findByRole("menuitemradio", {
          name: "balanceHistory:metrics.net",
        }),
      )

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: getMetricDropdownButtonName(
              "breakdown",
              "balanceHistory:metrics.net",
            ),
          }),
        ).toBeInTheDocument()
      })

      expect(
        screen.getByText(
          "balanceHistory:breakdown.hints.pieDisabledForNegative",
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: "balanceHistory:breakdown.chartTypes.pie",
        }),
      ).toBeDisabled()
      await user.click(
        screen.getByRole("button", {
          name: "balanceHistory:breakdown.chartTypes.bars",
        }),
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("updates currency and manual date controls", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)
    const updateCurrencyType = vi.fn(async () => {})

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))
      vi.mocked(useUserPreferencesContext).mockReturnValue({
        ...createMockUserPreferencesContext({
          enabled: true,
          currencyType: CURRENCIES.USD,
        }),
        updateCurrencyType,
      } as any)
      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
      ] as any)
      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 1,
              consumptionUsd: 2,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)

      renderDesktopHistory()

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()
      const accountSummary = await screen.findByTestId(
        BALANCE_HISTORY_TEST_IDS.accountSummary,
      )
      expect(
        await within(accountSummary).findByText("Site A"),
      ).toBeInTheDocument()
      expect(
        await within(accountSummary).findByText("$10.00"),
      ).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(
        await screen.findByRole("button", { name: FILTERS_BUTTON_LABEL }),
      )
      await user.click(
        screen.getByRole("button", { name: "settings:display.usd" }),
      )
      await user.click(
        screen.getByRole("button", { name: "settings:display.cny" }),
      )

      fireEvent.change(screen.getByLabelText(START_DAY_LABEL), {
        target: { value: "2026-02-01" },
      })
      fireEvent.blur(screen.getByLabelText(START_DAY_LABEL))
      fireEvent.change(screen.getByLabelText(END_DAY_LABEL), {
        target: { value: "2026-02-07" },
      })
      fireEvent.blur(screen.getByLabelText(END_DAY_LABEL))
      fireEvent.change(
        screen.getByLabelText("balanceHistory:breakdown.controls.reference"),
        { target: { value: "2026-02-07" } },
      )

      expect(updateCurrencyType).toHaveBeenCalledTimes(1)
      expect(updateCurrencyType).toHaveBeenCalledWith("CNY")
      expect(screen.getByLabelText(START_DAY_LABEL)).toHaveValue("2026-02-01")
      expect(screen.getByLabelText(END_DAY_LABEL)).toHaveValue("2026-02-07")
      expect(
        await within(accountSummary).findByText("Site A"),
      ).toBeInTheDocument()
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("does not expose selected estimated income metrics after the preference is disabled", async () => {
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(useUserPreferencesContext).mockReturnValue(
        createMockUserPreferencesContext({
          enabled: true,
          estimatedTodayIncomeEnabled: true,
        }),
      )
      vi.mocked(accountQueries.getEnabledAccounts).mockResolvedValue([
        {
          id: "a1",
          site_name: "Site A",
          site_url: "https://a.example.com",
          site_type: SITE_TYPES.ONE_API,
          account_info: { username: "User A" },
        },
      ] as any)
      vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
        schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
        referenceSnapshotsByAccountId: {
          a1: {
            [subtractDaysFromDayKey(todayKey, 1)]: {
              balanceUsd: 12,
              incomeUsd: null,
              consumptionUsd: null,
              capturedAt: fixedNowMs - 86_400_000,
              source: "refresh",
            },
            [todayKey]: {
              balanceUsd: 10,
              incomeUsd: 1,
              consumptionUsd: 4,
              capturedAt: fixedNowMs,
              source: "refresh",
            },
          },
        },
      } as any)

      const { rerender } = renderDesktopHistory()

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()
      const accountSummary = await screen.findByTestId(
        BALANCE_HISTORY_TEST_IDS.accountSummary,
      )
      expect(
        await within(accountSummary).findByText("$2.00"),
      ).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.balance",
          ),
        }),
      )
      await user.click(
        await screen.findByRole("menuitemradio", {
          name: "balanceHistory:metrics.estimatedIncome",
        }),
      )
      await user.click(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "trend",
            "balanceHistory:metrics.balance",
          ),
        }),
      )
      await user.click(
        await screen.findByRole("menuitemradio", {
          name: "balanceHistory:metrics.estimatedIncome",
        }),
      )

      expect(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.estimatedIncome",
          ),
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "trend",
            "balanceHistory:metrics.estimatedIncome",
          ),
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText("balanceHistory:breakdown.controls.reference"),
      ).not.toBeInTheDocument()

      vi.mocked(useUserPreferencesContext).mockReturnValue(
        createMockUserPreferencesContext({
          enabled: true,
          estimatedTodayIncomeEnabled: false,
        }),
      )

      rerender(<BalanceHistory />)

      expect(
        within(accountSummary).queryByText("$2.00"),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.estimatedIncome",
          ),
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: getMetricDropdownButtonName(
            "trend",
            "balanceHistory:metrics.estimatedIncome",
          ),
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.income",
          ),
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "trend",
            "balanceHistory:metrics.income",
          ),
        }),
      ).toBeInTheDocument()

      await user.click(
        screen.getByRole("button", {
          name: getMetricDropdownButtonName(
            "breakdown",
            "balanceHistory:metrics.income",
          ),
        }),
      )
      expect(
        screen.queryByRole("menuitemradio", {
          name: "balanceHistory:metrics.estimatedIncome",
        }),
      ).not.toBeInTheDocument()
    } finally {
      dateNowSpy.mockRestore()
    }
  })
})
