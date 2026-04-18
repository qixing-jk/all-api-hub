import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ActionBar from "~/features/ManagedSiteModelSync/components/ActionBar"
import EmptyResults from "~/features/ManagedSiteModelSync/components/EmptyResults"
import FilterBar from "~/features/ManagedSiteModelSync/components/FilterBar"
import OverviewCard from "~/features/ManagedSiteModelSync/components/OverviewCard"
import ProgressCard from "~/features/ManagedSiteModelSync/components/ProgressCard"
import ResultsTable from "~/features/ManagedSiteModelSync/components/ResultsTable"
import StatisticsCard from "~/features/ManagedSiteModelSync/components/StatisticsCard"
import { testI18n } from "~~/tests/test-utils/i18n"

const { mockHasValidManagedSiteConfig, mockPushWithinOptionsPage } = vi.hoisted(
  () => ({
    mockHasValidManagedSiteConfig: vi.fn(),
    mockPushWithinOptionsPage: vi.fn(),
  }),
)

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(async () => ({})),
  },
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  hasValidManagedSiteConfig: mockHasValidManagedSiteConfig,
}))

vi.mock("~/utils/navigation", () => ({
  pushWithinOptionsPage: mockPushWithinOptionsPage,
}))

vi.mock("~/components/ManagedSiteChannelLinkButton", () => ({
  default: ({
    channelId,
    channelName,
    className,
  }: {
    channelId: number
    channelName: string
    className?: string
  }) => (
    <button className={className} type="button">
      {channelName}#{channelId}
    </button>
  ),
}))

function render(ui: ReactNode) {
  return rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("ManagedSiteModelSync components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasValidManagedSiteConfig.mockReturnValue(true)
  })

  it("renders overview, progress, and statistics states", () => {
    const { rerender } = render(
      <OverviewCard
        enabled
        intervalMs={2 * 60 * 60 * 1000}
        nextScheduledAt="2026-03-28T10:00:00.000Z"
        lastRunAt="2026-03-28T08:00:00.000Z"
      />,
    )

    expect(
      screen.getByText("managedSiteModelSync:execution.overview.enabled"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteModelSync:execution.overview.everyHours"),
    ).toBeInTheDocument()

    rerender(
      <I18nextProvider i18n={testI18n}>
        <OverviewCard
          enabled={false}
          intervalMs={30 * 60 * 1000}
          nextScheduledAt="not-a-date"
          lastRunAt={null}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText("managedSiteModelSync:execution.overview.disabled"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteModelSync:execution.overview.everyMinutes"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "managedSiteModelSync:execution.statistics.notScheduled",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteModelSync:execution.overview.never"),
    ).toBeInTheDocument()

    const { rerender: rerenderProgress } = render(
      <ProgressCard
        progress={{
          isRunning: true,
          completed: 2,
          total: 5,
          failed: 0,
          currentChannel: "Alpha",
        }}
      />,
    )

    expect(
      screen.getByText("managedSiteModelSync:execution.status.running"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/managedSiteModelSync:execution.progress.running/),
    ).toHaveTextContent("Alpha")

    rerenderProgress(
      <I18nextProvider i18n={testI18n}>
        <ProgressCard
          progress={{
            isRunning: false,
            completed: 0,
            total: 0,
            failed: 0,
          }}
        />
      </I18nextProvider>,
    )

    expect(
      screen.queryByText("managedSiteModelSync:execution.status.running"),
    ).not.toBeInTheDocument()

    render(
      <StatisticsCard
        statistics={{
          total: 4,
          successCount: 3,
          failureCount: 1,
          durationMs: 4200,
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_004_200,
        }}
      />,
    )

    expect(
      screen.getByText("managedSiteModelSync:execution.lastExecution"),
    ).toBeInTheDocument()
    expect(screen.getByText("4.2s")).toBeInTheDocument()
  })

  it("wires action and filter callbacks", () => {
    const onRunAll = vi.fn()
    const onRunSelected = vi.fn()
    const onRetryFailed = vi.fn()
    const onRefresh = vi.fn()
    const onStatusChange = vi.fn()
    const onKeywordChange = vi.fn()

    render(
      <>
        <ActionBar
          isRunning={false}
          selectedCount={2}
          failedCount={1}
          onRunAll={onRunAll}
          onRunSelected={onRunSelected}
          onRetryFailed={onRetryFailed}
          onRefresh={onRefresh}
        />
        <FilterBar
          status="all"
          statistics={{
            total: 3,
            successCount: 2,
            failureCount: 1,
            durationMs: 1000,
            startedAt: 0,
            endedAt: 1000,
          }}
          keyword="Alpha"
          onStatusChange={onStatusChange}
          onKeywordChange={onKeywordChange}
        />
      </>,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runAll",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.runSelected (2)",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.retryFailed",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.actions.refresh",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: /managedSiteModelSync:execution.filters.success/,
      }),
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "managedSiteModelSync:execution.filters.searchPlaceholder",
      ),
      { target: { value: "alpha" } },
    )

    expect(onRunAll).toHaveBeenCalledTimes(1)
    expect(onRunSelected).toHaveBeenCalledTimes(1)
    expect(onRetryFailed).toHaveBeenCalledTimes(1)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("success")
    expect(onKeywordChange).toHaveBeenCalledWith("alpha")

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(onKeywordChange).toHaveBeenCalledWith("")
  })

  it("renders results and empty states across branches", async () => {
    const onSelectAll = vi.fn()
    const onSelectItem = vi.fn()
    const onRunSingle = vi.fn()

    render(
      <ResultsTable
        items={[
          {
            channelId: 11,
            channelName: "Alpha",
            ok: false,
            message: "sync failed",
            httpStatus: 500,
            attempts: 2,
            finishedAt: 1_700_000_000_000,
          },
          {
            channelId: 12,
            channelName: "Beta",
            ok: true,
            attempts: 1,
            finishedAt: 0,
          },
        ]}
        selectedIds={new Set([11])}
        onSelectAll={onSelectAll}
        onSelectItem={onSelectItem}
        onRunSingle={onRunSingle}
        isRunning={false}
        runningChannelId={11}
      />,
    )

    fireEvent.click(screen.getAllByRole("checkbox")[0])
    fireEvent.click(screen.getAllByRole("checkbox")[1])
    fireEvent.click(
      screen.getAllByTitle(
        "managedSiteModelSync:execution.table.syncChannel",
      )[0],
    )

    expect(
      screen.getByText("managedSiteModelSync:execution.status.failed"),
    ).toBeInTheDocument()
    expect(screen.getByText("sync failed")).toBeInTheDocument()
    expect(screen.getByText("HTTP: 500")).toBeInTheDocument()
    expect(screen.getByText("Alpha#11")).toBeInTheDocument()
    expect(onSelectAll).toHaveBeenCalledWith(true)
    expect(onSelectItem).toHaveBeenCalledWith(11, false)
    expect(onRunSingle).toHaveBeenCalledWith(11)

    mockHasValidManagedSiteConfig.mockReturnValue(false)
    render(<EmptyResults hasHistory={false} />)

    await waitFor(() => {
      expect(
        screen.getByText(
          "managedSiteModelSync:execution.empty.configWarningDesc",
        ),
      ).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.empty.goToSettings",
      }),
    )
    expect(mockPushWithinOptionsPage).toHaveBeenCalled()

    mockHasValidManagedSiteConfig.mockReturnValue(true)
    render(<EmptyResults hasHistory />)
    expect(
      screen.getByText("managedSiteModelSync:execution.empty.noResults"),
    ).toBeInTheDocument()
  })
})
