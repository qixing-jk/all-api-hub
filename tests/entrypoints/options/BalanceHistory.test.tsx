import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { echarts } from "~/components/charts/echarts"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistory from "~/entrypoints/options/pages/BalanceHistory"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/services/history/dailyBalanceHistory/dayKeys"
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
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { tagStorage } from "~/services/tags/tagStorage"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"
import { openSettingsTab, pushWithinOptionsPage } from "~/utils/navigation"
import {
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

const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn(), getEnabledAccounts: vi.fn() },
}))

vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/services/history/dailyBalanceHistory/messaging", () => ({
  sendBalanceHistoryMessage: vi.fn(),
}))

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

vi.mock("~/utils/browser/browserApi", async () => {
  const actual = await vi.importActual<any>("~/utils/browser/browserApi")
  return {
    ...actual,
    hasAlarmsAPI: vi.fn(() => true),
  }
})

vi.mock("~/utils/navigation", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation")
  return {
    ...actual,
    openSettingsTab: vi.fn(),
    pushWithinOptionsPage: vi.fn(),
  }
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
    currencyType = "USD",
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
    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([] as any)
    vi.mocked(tagStorage.getTagStore).mockResolvedValue({
      version: 1,
      tagsById: {},
    } as any)
    vi.mocked(dailyBalanceHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {},
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

  it("renders the empty state when no snapshots exist", async () => {
    render(<BalanceHistory />)

    expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()
    expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument()
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

    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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

    expect(await screen.findByText(ACCOUNT_OPTION_LABEL_A)).toBeInTheDocument()
    expect(screen.getByText(ACCOUNT_OPTION_LABEL_B)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: TAG_CHIP_NAME_WORK }))

    await waitFor(() => {
      expect(screen.getByText(ACCOUNT_OPTION_LABEL_A)).toBeInTheDocument()
      expect(screen.queryByText(ACCOUNT_OPTION_LABEL_B)).toBeNull()
    })
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

      const startInput = await screen.findByLabelText(START_DAY_LABEL)
      const endInput = await screen.findByLabelText(END_DAY_LABEL)

      await waitFor(() => {
        expect(endInput).toHaveValue(maxDayKey)
      })

      const user = userEvent.setup()
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
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("renders non-empty per-account trend series for multi-account partial coverage", async () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const nowUnixSeconds = Math.floor(fixedNowMs / 1000)
      const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)

      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
              today_income: 1 * factor,
              today_quota_consumption: 2 * factor,
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
        option?.series?.some?.((series: any) => series?.type === "line"),
      )

      expect(trendOption).toBeTruthy()
      expect(trendOption.series).toHaveLength(1)

      const [seriesA] = trendOption.series
      expect(seriesA.name).toBe("Site A")
      expect(seriesA.data.some((value: any) => typeof value === "number")).toBe(
        true,
      )
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
  ] as const)(
    "renders a per-account $metric trend when only that metric is available",
    async ({
      metric,
      today_income,
      today_quota_consumption,
      expectedValue,
    }) => {
      const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
      const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
      const fixedNowMs = FIXED_NOW.getTime()
      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

      try {
        const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

        vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
          snapshotsByAccountId: {
            a1: {
              [todayKey]: {
                quota: 10 * factor,
                today_income:
                  today_income === null ? null : today_income * factor,
                today_quota_consumption:
                  today_quota_consumption === null
                    ? null
                    : today_quota_consumption * factor,
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

          expect(
            options.some((option: any) =>
              option?.series?.some?.(
                (series: any) =>
                  series?.type === "line" &&
                  series.data?.some?.(
                    (value: unknown) => value === expectedValue,
                  ),
              ),
            ),
          ).toBe(true)
        })
      } finally {
        dateNowSpy.mockRestore()
      }
    },
  )

  it("uses shared duplicate-name labels in account selectors and trend series", async () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const nowUnixSeconds = Math.floor(fixedNowMs / 1000)
      const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)

      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
              today_income: 1 * factor,
              today_quota_consumption: 2 * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            [todayKey]: {
              quota: 20 * factor,
              today_income: 3 * factor,
              today_quota_consumption: 4 * factor,
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
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
              today_income: 2 * factor,
              today_quota_consumption: 1 * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
          a2: {
            [todayKey]: {
              quota: 20 * factor,
              today_income: 4 * factor,
              today_quota_consumption: 3 * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)
      vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
        success: true,
      } as any)

      render(<BalanceHistory />)

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: "Site A" }))
      await user.click(
        screen.getByRole("button", {
          name: "balanceHistory:actions.refreshNow",
        }),
      )

      await waitFor(() => {
        expect(vi.mocked(sendBalanceHistoryMessage)).toHaveBeenCalledWith(
          BalanceHistoryMessageTypes.RefreshNow,
          { accountIds: ["a1"] },
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
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))
      const deferredStore = createDeferred<any>()

      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
          snapshotsByAccountId: {
            a1: {
              [todayKey]: {
                quota: 10 * factor,
                today_income: 2 * factor,
                today_quota_consumption: 1 * factor,
                capturedAt: 0,
                source: "refresh",
              },
            },
          },
        } as any)
        .mockReturnValueOnce(deferredStore.promise)

      vi.mocked(sendBalanceHistoryMessage).mockResolvedValue({
        success: true,
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
            option?.series?.some?.((series: any) => series?.type === "line"),
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 12 * factor,
              today_income: 3 * factor,
              today_quota_consumption: 1 * factor,
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
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
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
          undefined,
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
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))

      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
              today_income: 1 * factor,
              today_quota_consumption: 4 * factor,
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
          name: "balanceHistory:breakdown.chartTypes.histogram",
        }),
      )
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("updates currency and manual date controls", async () => {
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const FIXED_NOW = new Date(2026, 1, 7, 12, 0, 0)
    const fixedNowMs = FIXED_NOW.getTime()
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(fixedNowMs)
    const updateCurrencyType = vi.fn(async () => {})

    try {
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(fixedNowMs / 1000))
      vi.mocked(useUserPreferencesContext).mockReturnValue({
        ...createMockUserPreferencesContext({
          enabled: true,
          currencyType: "USD",
        }),
        updateCurrencyType,
      } as any)
      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
              today_income: 1 * factor,
              today_quota_consumption: 2 * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)

      render(<BalanceHistory />)

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
        screen.getByRole("button", { name: "settings:display.usd" }),
      )
      await user.click(
        screen.getByRole("button", { name: "settings:display.cny" }),
      )

      fireEvent.change(screen.getByLabelText(START_DAY_LABEL), {
        target: { value: "2026-02-01" },
      })
      fireEvent.change(screen.getByLabelText(END_DAY_LABEL), {
        target: { value: "2026-02-07" },
      })
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
    const factor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
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
      vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
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
        snapshotsByAccountId: {
          a1: {
            [todayKey]: {
              quota: 10 * factor,
              today_income: 1 * factor,
              today_quota_consumption: 4 * factor,
              capturedAt: 0,
              source: "refresh",
            },
          },
        },
      } as any)

      const { rerender } = render(<BalanceHistory />)

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
