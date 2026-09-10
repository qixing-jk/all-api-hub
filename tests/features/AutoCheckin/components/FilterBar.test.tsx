import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import FilterBar from "~/features/AutoCheckin/components/FilterBar"
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
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
  type CheckinResultStatus,
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
    timestamp: 5,
  },
  {
    accountId: "uncertain",
    accountName: "Uncertain",
    status: CHECKIN_RESULT_STATUS.UNCERTAIN,
    reconciliation: "unknown",
    timestamp: 4,
  },
  {
    accountId: "skipped",
    accountName: "Skipped",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
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
  const [selectedStatuses, setSelectedStatuses] = useState<
    CheckinResultStatus[]
  >([])

  return (
    <FilterBar
      accountResults={results}
      selectedStatuses={selectedStatuses}
      keyword=""
      onSelectedStatusesChange={setSelectedStatuses}
      onKeywordChange={vi.fn()}
    />
  )
}

describe("AutoCheckin FilterBar", () => {
  it("updates the attention preset label when deselecting a status and resets to all", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { autoCheckin: enAutoCheckin },
    })
    rtlRender(
      <I18nextProvider i18n={i18n}>
        <StatefulFilterBar />
      </I18nextProvider>,
    )
    const trigger = screen.getByRole("button", {
      name: /Filter by execution status/,
    })
    await user.click(trigger)
    await user.click(screen.getByRole("menuitem", { name: /Needs attention/ }))
    expect(trigger).toHaveAccessibleName(
      "Filter by execution status: Needs attention",
    )
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
    expect(screen.getByText("5 total")).toBeVisible()
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

    expect(
      screen.queryByRole("button", {
        name: /autoCheckin:execution\.filters\.failed \(1\)/,
      }),
    ).not.toBeInTheDocument()

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

  it("applies needs attention as a preset for three atomic statuses", async () => {
    const user = userEvent.setup()
    const onSelectedStatusesChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          selectedStatuses={[]}
          keyword=""
          onSelectedStatusesChange={onSelectedStatusesChange}
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

    expect(onSelectedStatusesChange).toHaveBeenCalledWith([
      CHECKIN_RESULT_STATUS.FAILED,
      CHECKIN_RESULT_STATUS.UNCERTAIN,
      CHECKIN_RESULT_STATUS.SKIPPED,
    ])
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
        filterCount: 1,
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
          selectedStatuses={[
            CHECKIN_RESULT_STATUS.FAILED,
            CHECKIN_RESULT_STATUS.SUCCESS,
          ]}
          keyword="private"
          onSelectedStatusesChange={vi.fn()}
          onKeywordChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText("Showing 2 of 5")).toBeVisible()
  })

  it("clears status and keyword filters together", async () => {
    const user = userEvent.setup()
    const onSelectedStatusesChange = vi.fn()
    const onKeywordChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          selectedStatuses={[CHECKIN_RESULT_STATUS.FAILED]}
          keyword="Private"
          onSelectedStatusesChange={onSelectedStatusesChange}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.filters.clearAll",
      }),
    )

    expect(onSelectedStatusesChange).toHaveBeenCalledWith([])
    expect(onKeywordChange).toHaveBeenCalledWith("")
  })

  it("clears the keyword without exposing it to analytics", () => {
    const onKeywordChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          selectedStatuses={[CHECKIN_RESULT_STATUS.FAILED]}
          keyword="private-keyword"
          onSelectedStatusesChange={vi.fn()}
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
