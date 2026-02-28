import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { echarts } from "~/components/charts/echarts"
import { ONE_API } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistory from "~/entrypoints/options/pages/BalanceHistory"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/services/history/dailyBalanceHistory/dayKeys"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { tagStorage } from "~/services/tags/tagStorage"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"

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

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: { getTagStore: vi.fn() },
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/browserApi", async () => {
  const actual = await vi.importActual<any>("~/utils/browserApi")
  return {
    ...actual,
    hasAlarmsAPI: vi.fn(() => true),
    sendRuntimeMessage: vi.fn(),
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

  const TREND_CONTROLS_SCOPE = "balanceHistory:trend.controls.scope"
  const TREND_SCOPE_ACCOUNTS = "balanceHistory:trend.scopes.accounts"
  const TREND_SCOPE_TOTAL = "balanceHistory:trend.scopes.total"
  const TREND_SCOPE_BUTTON_ACCOUNTS = `${TREND_CONTROLS_SCOPE}: ${TREND_SCOPE_ACCOUNTS}`
  const INCOMPLETE_SELECTION_TITLE =
    "balanceHistory:hints.incompleteSelection.title"

  const DEFAULT_RETENTION_DAYS = 30
  const DEFAULT_THEME_MODE = "light" as const

  type MockUserPreferencesContextValue = ReturnType<
    typeof useUserPreferencesContext
  >

  const createMockUserPreferencesContext = ({
    showTodayCashflow = true,
    enabled = false,
    endOfDayCaptureEnabled = false,
    retentionDays = DEFAULT_RETENTION_DAYS,
    currencyType = "USD",
  }: {
    showTodayCashflow?: boolean
    enabled?: boolean
    endOfDayCaptureEnabled?: boolean
    retentionDays?: number
    currencyType?: "USD" | "CNY"
  } = {}) =>
    ({
      preferences: {
        showTodayCashflow,
        balanceHistory: {
          enabled,
          endOfDayCapture: { enabled: endOfDayCaptureEnabled },
          retentionDays,
        },
      },
      currencyType,
      updateCurrencyType: vi.fn(async () => {}),
      themeMode: DEFAULT_THEME_MODE,
      updateThemeMode: vi.fn(async () => {}),
      loadPreferences: vi.fn(),
    }) as unknown as MockUserPreferencesContextValue

  beforeEach(() => {
    vi.clearAllMocks()
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

    const SITE_TYPE = ONE_API

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
          site_type: ONE_API,
          account_info: { username: "User A" },
        },
        {
          id: "a2",
          site_name: "Site B",
          site_url: "https://b.example.com",
          site_type: ONE_API,
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

  it("renders best-effort aggregated trend series for partial coverage in total view", async () => {
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
          site_type: ONE_API,
          account_info: { username: "User A" },
        },
        {
          id: "a2",
          site_name: "Site B",
          site_url: "https://b.example.com",
          site_type: ONE_API,
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

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", {
          name: TREND_SCOPE_BUTTON_ACCOUNTS,
        }),
      )
      await user.click(
        await screen.findByRole("menuitemradio", {
          name: TREND_SCOPE_TOTAL,
        }),
      )

      expect(
        await screen.findByText(INCOMPLETE_SELECTION_TITLE),
      ).toBeInTheDocument()

      await waitFor(() => {
        const initResults = vi.mocked(echarts.init).mock.results
        const options = initResults
          .map((result) => result.value)
          .flatMap((instance: any) =>
            instance.setOption.mock.calls.map((c: any) => c[0]),
          )

        const trendOptions = options.filter((option: any) =>
          option?.series?.some?.((series: any) => series?.type === "line"),
        )

        const trendOption = trendOptions.at(-1)
        expect(trendOption).toBeTruthy()
        expect(trendOption.series).toHaveLength(1)

        const [seriesTotal] = trendOption.series
        expect(seriesTotal.name).toBe(TREND_SCOPE_TOTAL)

        const numericValues = seriesTotal.data.filter(
          (value: unknown) => typeof value === "number",
        )
        expect(numericValues).toEqual([10])
      })
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  it("renders aggregated trend series when switched to total view", async () => {
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
          site_type: ONE_API,
          account_info: { username: "User A" },
        },
        {
          id: "a2",
          site_name: "Site B",
          site_url: "https://b.example.com",
          site_type: ONE_API,
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

      expect(await screen.findByText(PAGE_TITLE)).toBeInTheDocument()

      await waitFor(() => {
        expect(vi.mocked(echarts.init)).toHaveBeenCalled()
      })

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", {
          name: TREND_SCOPE_BUTTON_ACCOUNTS,
        }),
      )
      await user.click(
        await screen.findByRole("menuitemradio", {
          name: TREND_SCOPE_TOTAL,
        }),
      )

      await waitFor(() => {
        const initResults = vi.mocked(echarts.init).mock.results
        const options = initResults
          .map((result) => result.value)
          .flatMap((instance: any) =>
            instance.setOption.mock.calls.map((c: any) => c[0]),
          )

        const trendOptions = options.filter((option: any) =>
          option?.series?.some?.((series: any) => series?.type === "line"),
        )

        const trendOption = trendOptions.at(-1)
        expect(trendOption).toBeTruthy()
        expect(trendOption.series).toHaveLength(1)

        const [seriesTotal] = trendOption.series
        expect(seriesTotal.name).toBe(TREND_SCOPE_TOTAL)

        const numericValues = seriesTotal.data.filter(
          (value: unknown) => typeof value === "number",
        )
        expect(numericValues).toEqual([30])
      })
    } finally {
      dateNowSpy.mockRestore()
    }
  })
})
