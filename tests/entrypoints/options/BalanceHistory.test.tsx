import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ONE_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import BalanceHistory from "~/entrypoints/options/pages/BalanceHistory"
import balanceHistoryEn from "~/locales/en/balanceHistory.json"
import commonEn from "~/locales/en/common.json"
import { accountStorage } from "~/services/accountStorage"
import { tagStorage } from "~/services/accountTags/tagStorage"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/services/dailyBalanceHistory/dayKeys"
import { dailyBalanceHistoryStorage } from "~/services/dailyBalanceHistory/storage"
import { testI18n } from "~/tests/test-utils/i18n"
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

vi.mock("~/services/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn() },
}))

vi.mock("~/services/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/services/accountTags/tagStorage", () => ({
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
  const PAGE_TITLE = balanceHistoryEn.title
  const EMPTY_TITLE = balanceHistoryEn.empty.title
  const DISABLED_HINT_TITLE = balanceHistoryEn.hints.disabled.title
  const CASHFLOW_WARNING_TITLE =
    balanceHistoryEn.warnings.cashflowDisabled.title
  const START_DAY_LABEL = balanceHistoryEn.filters.startDay
  const END_DAY_LABEL = balanceHistoryEn.filters.endDay
  const QUICK_RANGE_7D_LABEL = balanceHistoryEn.filters.quickRanges["7d"]
  const TAG_FILTER_LABEL = balanceHistoryEn.filters.tags

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
  }: {
    showTodayCashflow?: boolean
    enabled?: boolean
    endOfDayCaptureEnabled?: boolean
    retentionDays?: number
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
      themeMode: DEFAULT_THEME_MODE,
      updateThemeMode: vi.fn(async () => {}),
      loadPreferences: vi.fn(),
    }) as unknown as MockUserPreferencesContextValue

  testI18n.addResourceBundle(
    "en",
    "balanceHistory",
    balanceHistoryEn,
    true,
    true,
  )
  testI18n.addResourceBundle("en", "common", commonEn, true, true)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
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

    const ACCOUNT_OPTION_LABEL_A = `${SITE_A_NAME} (${USER_A_USERNAME})`
    const ACCOUNT_OPTION_LABEL_B = `${SITE_B_NAME} (${USER_B_USERNAME})`

    const TAG_ID_WORK = "t1"
    const TAG_ID_HOME = "t2"

    const TAG_NAME_WORK = "Work"
    const TAG_NAME_HOME = "Home"

    const TAG_WORK_ACCOUNT_COUNT = 1
    const TAG_CHIP_NAME_WORK = new RegExp(
      `^${escapeRegExp(TAG_NAME_WORK)}\\D*${TAG_WORK_ACCOUNT_COUNT}$`,
    )

    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
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
})
