import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import FilterBar from "~/features/ManagedSiteModelSync/results/FilterBar"
import ResultsTable from "~/features/ManagedSiteModelSync/results/ResultsTable"
import ProgressCard from "~/features/ManagedSiteModelSync/status/ProgressCard"
import StatisticsCard from "~/features/ManagedSiteModelSync/status/StatisticsCard"
import { filterExecutionItems } from "~/features/ManagedSiteModelSync/workspace/modelSyncWorkspace"
import type { ExecutionHistoryItemResult } from "~/types/managedSiteModelSync"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"
import { render, screen, within } from "~~/tests/test-utils/render"

const skipped: ExecutionHistoryItemResult = {
  resourceRef: modelResourceRef(3),
  channelName: "Excluded channel",
  ok: false,
  skipReason: "excluded",
  attempts: 0,
  finishedAt: 100,
}
const items = [
  {
    ...skipped,
    resourceRef: modelResourceRef(1),
    channelName: "Successful channel",
    skipReason: undefined,
    ok: true,
  },
  {
    ...skipped,
    resourceRef: modelResourceRef(2),
    channelName: "Failed channel",
    skipReason: undefined,
  },
  skipped,
]
const statistics = {
  total: 2,
  successCount: 1,
  failureCount: 1,
  skippedCount: 1,
  durationMs: 100,
  startedAt: 1,
  endedAt: 101,
}

describe("visible model-sync skips", () => {
  it("keeps skipped results in all and skipped filters, outside success and failure", () => {
    expect(filterExecutionItems(items, "all", "")).toHaveLength(3)
    expect(
      filterExecutionItems(items, "failed", "").map((item) => item.channelName),
    ).toEqual(["Failed channel"])
    expect(
      filterExecutionItems(items, "success", "").map(
        (item) => item.channelName,
      ),
    ).toEqual(["Successful channel"])
    expect(filterExecutionItems(items, "skipped", "")).toEqual([skipped])
    expect(filterExecutionItems(items, "skipped", "Excluded")).toEqual([
      skipped,
    ])
  })

  it("shows a skip reason and allows a deliberate single-channel sync", async () => {
    const user = userEvent.setup()
    const onRunSingle = vi.fn()
    render(
      <ResultsTable
        items={[skipped]}
        selectedKeys={new Set()}
        onSelectAll={vi.fn()}
        onSelectItem={vi.fn()}
        onRunSingle={onRunSingle}
        isRunning={false}
      />,
    )
    expect(
      await screen.findByText("managedSiteModelSync:execution.status.skipped"),
    ).toBeVisible()
    expect(
      screen.getByText(
        "managedSiteModelSync:execution.exclusions.skippedReason",
      ),
    ).toBeVisible()
    expect(
      screen.queryByText("managedSiteModelSync:execution.status.failed"),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteModelSync:execution.table.syncChannel",
      }),
    )
    expect(onRunSingle).toHaveBeenCalledWith(skipped.resourceRef)
  })

  it("shows a separate skipped count and filter including all recorded rows", async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    render(
      <>
        <StatisticsCard statistics={statistics} />
        <FilterBar
          statistics={statistics}
          status="all"
          keyword=""
          onStatusChange={onStatusChange}
          onKeywordChange={vi.fn()}
        />
      </>,
    )
    const label = await screen.findByText(
      "managedSiteModelSync:execution.statistics.skipped",
    )
    expect(within(label.parentElement!).getByText("1")).toBeVisible()
    expect(
      within(
        screen.getByRole("button", {
          name: /managedSiteModelSync:execution.filters.all/,
        }),
      ).getByText("3"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: /managedSiteModelSync:execution.filters.skipped/,
      }),
    )
    expect(onStatusChange).toHaveBeenCalledWith("skipped")
  })

  it("keeps the skipped count visible during execution", async () => {
    render(
      <ProgressCard
        progress={{
          isRunning: true,
          total: 2,
          completed: 0,
          failed: 0,
          skippedCount: 1,
        }}
      />,
    )
    expect(
      await screen.findByText(
        "managedSiteModelSync:execution.progress.skipped",
      ),
    ).toBeVisible()
  })
})
