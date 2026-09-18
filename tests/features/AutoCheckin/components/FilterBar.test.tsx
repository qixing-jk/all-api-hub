import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import FilterBar from "~/features/AutoCheckin/components/FilterBar"
import {
  EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  type AutoCheckinResultFilter,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { AUTO_CHECKIN_SKIP_CATEGORY } from "~/features/AutoCheckin/utils/skipCategories"
import enAutoCheckin from "~/locales/en/autoCheckin.json"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { createResourceTestI18n, testI18n } from "~~/tests/test-utils/i18n"

const { trackProductAnalyticsActionCompletedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
}))

const results: CheckinAccountResult[] = [
  {
    accountId: "failed",
    accountName: "Private Failed",
    status: CHECKIN_RESULT_STATUS.FAILED,
    timestamp: 6,
  },
  {
    accountId: "uncertain",
    accountName: "Uncertain",
    status: CHECKIN_RESULT_STATUS.UNCERTAIN,
    reconciliation: "unknown",
    timestamp: 5,
  },
  {
    accountId: "skipped-action",
    accountName: "Action needed",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    timestamp: 4,
  },
  {
    accountId: "skipped-waiting",
    accountName: "Waiting",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
    timestamp: 3,
  },
  {
    accountId: "success",
    accountName: "Private Success",
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    timestamp: 2,
  },
  {
    accountId: "already-checked",
    accountName: "Already checked",
    status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    timestamp: 1,
  },
]

function StatefulFilterBar() {
  const [filter, setFilter] = useState<AutoCheckinResultFilter>(
    EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  )

  return (
    <FilterBar
      accountResults={results}
      filter={filter}
      keyword=""
      onFilterChange={setFilter}
      onKeywordChange={vi.fn()}
    />
  )
}

async function renderWithEnglishResults() {
  const i18n = await createResourceTestI18n({
    en: { autoCheckin: enAutoCheckin },
  })
  const user = userEvent.setup()

  rtlRender(
    <I18nextProvider i18n={i18n}>
      <StatefulFilterBar />
    </I18nextProvider>,
  )

  return user
}

describe("AutoCheckin FilterBar", () => {
  it("applies the needs-attention preset for actionable results and resets to all", async () => {
    const user = await renderWithEnglishResults()
    const trigger = screen.getByRole("button", {
      name: /Filter by execution status/,
    })

    await user.click(trigger)
    expect(
      screen.getByRole("menuitem", { name: /Needs attention.*3/ }),
    ).toBeVisible()
    await user.click(screen.getByRole("menuitem", { name: /Needs attention/ }))

    expect(trigger).toHaveAccessibleName(
      "Filter by execution status: Needs attention",
    )
    expect(screen.getByText("Showing 3 of 6")).toBeVisible()

    await user.click(trigger)
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Failed/ }))
    expect(
      screen.getByRole("menuitemcheckbox", { name: /Failed/ }),
    ).toHaveAttribute("aria-checked", "false")
    await user.keyboard("{Escape}")
    expect(trigger).not.toHaveAccessibleName(
      "Filter by execution status: Needs attention",
    )

    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: /All/ }))
    expect(trigger).toHaveAccessibleName("Filter by execution status: All")
    expect(screen.getByText("6 total")).toBeVisible()
  })

  afterEach(() => {
    trackProductAnalyticsActionCompletedMock.mockReset()
  })

  it("uses one multi-select menu for the five result statuses", async () => {
    const user = userEvent.setup()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <StatefulFilterBar />
      </I18nextProvider>,
    )

    await user.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.statusLabel/,
      }),
    )

    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(5)
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /autoCheckin:execution\.filters\.failed.*1/,
      }),
    ).toBeVisible()
  })

  it("reveals skipped reason categories only while skipped stays selected", async () => {
    const user = await renderWithEnglishResults()

    await user.click(
      screen.getByRole("button", { name: /Filter by execution status/ }),
    )
    expect(screen.queryByText("Not executed reasons")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /Not executed/ }),
    )

    expect(screen.getByText("Not executed reasons")).toBeVisible()
    expect(
      screen.getByRole("menuitemcheckbox", { name: /Needs your action 1/ }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /Will retry automatically 1/,
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("menuitemcheckbox", {
        name: /No action needed/,
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /Not executed/ }),
    )
    expect(screen.queryByText("Not executed reasons")).not.toBeInTheDocument()
  })

  it("narrows skipped results by their reason category", async () => {
    const user = await renderWithEnglishResults()
    const trigger = screen.getByRole("button", {
      name: /Filter by execution status/,
    })

    await user.click(trigger)
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /Not executed/ }),
    )
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /Needs your action 1/ }),
    )
    await user.keyboard("{Escape}")

    expect(trigger).toHaveAccessibleName(
      "Filter by execution status: Not executed · Needs your action",
    )
    expect(screen.getByText("Showing 1 of 6")).toBeVisible()
  })

  it("keeps multiple atomic statuses selected", async () => {
    const user = userEvent.setup()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <StatefulFilterBar />
      </I18nextProvider>,
    )

    await user.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.statusLabel/,
      }),
    )
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: /autoCheckin:execution\.filters\.failed.*1/,
      }),
    )
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: /autoCheckin:execution\.filters\.uncertain.*1/,
      }),
    )

    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /autoCheckin:execution\.filters\.failed.*1/,
      }),
    ).toHaveAttribute("aria-checked", "true")
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /autoCheckin:execution\.filters\.uncertain.*1/,
      }),
    ).toHaveAttribute("aria-checked", "true")
  })

  it("applies needs attention as a semantic preset and tracks it once", async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          filter={EMPTY_AUTO_CHECKIN_RESULT_FILTER}
          keyword=""
          onFilterChange={onFilterChange}
          onKeywordChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    await user.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.statusLabel/,
      }),
    )
    await user.click(
      screen.getByRole("menuitem", {
        name: /autoCheckin:execution\.filters\.needsAttention.*3/,
      }),
    )

    expect(onFilterChange).toHaveBeenCalledWith({
      statuses: [
        CHECKIN_RESULT_STATUS.FAILED,
        CHECKIN_RESULT_STATUS.UNCERTAIN,
        CHECKIN_RESULT_STATUS.SKIPPED,
      ],
      skippedCategories: [AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED],
    })
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
        filterCount: 2,
        resultCount: 3,
      },
    })
  })

  it("counts results after both multi-status and keyword filters", async () => {
    const i18n = await createResourceTestI18n({
      en: { autoCheckin: enAutoCheckin },
    })
    rtlRender(
      <I18nextProvider i18n={i18n}>
        <FilterBar
          accountResults={results}
          filter={{
            statuses: [
              CHECKIN_RESULT_STATUS.FAILED,
              CHECKIN_RESULT_STATUS.SUCCESS,
            ],
            skippedCategories: [],
          }}
          keyword="private"
          onFilterChange={vi.fn()}
          onKeywordChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText("Showing 2 of 6")).toBeVisible()
  })

  it("clears status and keyword filters together", async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    const onKeywordChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          filter={{
            statuses: [CHECKIN_RESULT_STATUS.FAILED],
            skippedCategories: [],
          }}
          keyword="Private"
          onFilterChange={onFilterChange}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.filters.clearAll",
      }),
    )

    expect(onFilterChange).toHaveBeenCalledWith({
      statuses: [],
      skippedCategories: [],
    })
    expect(onKeywordChange).toHaveBeenCalledWith("")
  })

  it("clears the keyword without exposing it to analytics", () => {
    const onKeywordChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          filter={{
            statuses: [CHECKIN_RESULT_STATUS.FAILED],
            skippedCategories: [],
          }}
          keyword="private-keyword"
          onFilterChange={vi.fn()}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(onKeywordChange).toHaveBeenCalledWith("")
    expect(
      JSON.stringify(trackProductAnalyticsActionCompletedMock.mock.calls),
    ).not.toContain("private-keyword")
  })
})
