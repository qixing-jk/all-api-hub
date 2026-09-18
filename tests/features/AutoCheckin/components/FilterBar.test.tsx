import { render as rtlRender, screen } from "@testing-library/react"
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

const subtypeResults: CheckinAccountResult[] = [
  {
    accountId: "skipped-auth",
    accountName: "Skipped auth",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    timestamp: 10,
  },
  {
    accountId: "skipped-credentials",
    accountName: "Skipped credentials",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
    timestamp: 9,
  },
  {
    accountId: "skipped-account-disabled",
    accountName: "Skipped account disabled",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
    timestamp: 8,
  },
  {
    accountId: "skipped-auto-disabled",
    accountName: "Skipped auto disabled",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
    timestamp: 7,
  },
  {
    accountId: "skipped-detection-disabled",
    accountName: "Skipped detection disabled",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED,
    timestamp: 6,
  },
  {
    accountId: "skipped-already",
    accountName: "Skipped already",
    status: CHECKIN_RESULT_STATUS.SKIPPED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
    timestamp: 5,
  },
  {
    accountId: "failed-network",
    accountName: "Failed network",
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
    timestamp: 4,
  },
  {
    accountId: "failed-auth",
    accountName: "Failed auth",
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    timestamp: 3,
  },
  {
    accountId: "failed-unclassified",
    accountName: "Failed unclassified",
    status: CHECKIN_RESULT_STATUS.FAILED,
    timestamp: 2,
  },
  {
    accountId: "uncertain-timeout",
    accountName: "Uncertain timeout",
    status: CHECKIN_RESULT_STATUS.UNCERTAIN,
    reconciliation: "unknown",
    reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
    timestamp: 1,
  },
]

const reasonlessResults: CheckinAccountResult[] = [
  {
    accountId: "success",
    accountName: "Success",
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    timestamp: 3,
  },
  {
    accountId: "already-checked",
    accountName: "Already checked",
    status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    timestamp: 2,
  },
  {
    accountId: "failed-unclassified",
    accountName: "Failed unclassified",
    status: CHECKIN_RESULT_STATUS.FAILED,
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

function StatefulSubtypeFilterBar() {
  const [filter, setFilter] = useState<AutoCheckinResultFilter>(
    EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  )

  return (
    <FilterBar
      accountResults={subtypeResults}
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

async function renderSubtypeResults() {
  const i18n = await createResourceTestI18n({
    en: { autoCheckin: enAutoCheckin },
  })
  const user = userEvent.setup()

  rtlRender(
    <I18nextProvider i18n={i18n}>
      <StatefulSubtypeFilterBar />
    </I18nextProvider>,
  )

  return user
}

const statusTrigger = () =>
  screen.getByRole("button", { name: /^Filter by execution status: / })
const reasonTrigger = () =>
  screen.getByRole("button", { name: /^Filter by reason: / })

describe("AutoCheckin FilterBar", () => {
  afterEach(() => {
    trackProductAnalyticsActionCompletedMock.mockReset()
  })

  it("applies the needs-attention preset for actionable results and resets to all", async () => {
    const user = await renderWithEnglishResults()

    await user.click(statusTrigger())
    expect(
      screen.getByRole("menuitem", { name: /Needs attention.*3/ }),
    ).toBeVisible()
    await user.click(screen.getByRole("menuitem", { name: /Needs attention/ }))

    expect(statusTrigger()).toHaveAccessibleName(
      "Filter by execution status: Needs attention",
    )
    expect(screen.getByText("Showing 3 of 6")).toBeVisible()
    // The preset narrows actionable skips without hiding failures.
    expect(reasonTrigger()).toHaveAccessibleName(
      "Filter by reason: Needs your action",
    )

    await user.click(statusTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /^Failed 1$/ }),
    )
    expect(
      screen.getByRole("menuitemcheckbox", { name: /^Failed 1$/ }),
    ).toHaveAttribute("aria-checked", "false")
    await user.keyboard("{Escape}")
    expect(statusTrigger()).not.toHaveAccessibleName(
      "Filter by execution status: Needs attention",
    )

    await user.click(statusTrigger())
    await user.click(screen.getByRole("menuitem", { name: /^All\s*6$/ }))
    expect(statusTrigger()).toHaveAccessibleName(
      "Filter by execution status: All",
    )
    expect(screen.getByText("6 total")).toBeVisible()
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

  it("hides the reason control and its column when no result is classified", async () => {
    const i18n = await createResourceTestI18n({
      en: { autoCheckin: enAutoCheckin },
    })
    rtlRender(
      <I18nextProvider i18n={i18n}>
        <FilterBar
          accountResults={reasonlessResults}
          filter={EMPTY_AUTO_CHECKIN_RESULT_FILTER}
          keyword=""
          onFilterChange={vi.fn()}
          onKeywordChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    expect(
      screen.queryByRole("button", { name: /^Filter by reason: / }),
    ).not.toBeInTheDocument()
    expect(statusTrigger()).toBeVisible()
    expect(screen.getByText("3 total")).toBeVisible()
    // The toolbar collapses to search plus status instead of leaving an
    // empty column where the reason filter would be.
    expect(statusTrigger().parentElement).toHaveClass(
      "lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,auto)]",
    )
  })

  it("drops the reason control once the selected status has no reasons", async () => {
    const user = await renderSubtypeResults()

    expect(reasonTrigger()).toBeVisible()

    await user.click(statusTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: /^Checked in this run 0$/,
      }),
    )
    await user.keyboard("{Escape}")

    expect(
      screen.queryByRole("button", { name: /^Filter by reason: / }),
    ).not.toBeInTheDocument()
    expect(statusTrigger().parentElement).toHaveClass(
      "lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,auto)]",
    )
  })

  it("derives reason options from every reason-carrying status", async () => {
    const user = await renderSubtypeResults()

    // No status selection yet: the reason control covers failures, uncertain
    // results and skips, so the filter never hides behind a status first.
    expect(reasonTrigger()).toHaveAccessibleName(
      "Filter by reason: All reasons",
    )
    await user.click(reasonTrigger())

    for (const [label, count] of [
      ["Needs your action", 3],
      ["Will retry automatically", 2],
      ["Account disabled", 1],
      ["Disabled", 2],
      ["No action needed", 1],
    ] as const) {
      expect(
        screen.getByRole("menuitemcheckbox", {
          name: new RegExp(`^${label} ${count}$`),
        }),
      ).toBeVisible()
    }

    // Multi-reason categories list their precise reasons underneath.
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Auto check-in disabled 1$/,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Detection disabled 1$/,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Sign-in has expired or is required.*2$/,
      }),
    ).toBeVisible()
  })

  it("narrows results by their precise reason", async () => {
    const user = await renderSubtypeResults()

    await user.click(reasonTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /^Account disabled 1$/ }),
    )
    await user.keyboard("{Escape}")

    expect(reasonTrigger()).toHaveAccessibleName(
      "Filter by reason: Account disabled",
    )
    expect(statusTrigger()).toHaveAccessibleName(
      "Filter by execution status: All",
    )
    expect(screen.getByText("Showing 1 of 10")).toBeVisible()
  })

  it("narrows a single status by the reasons found in it", async () => {
    const user = await renderSubtypeResults()

    await user.click(statusTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /^Failed 3$/ }),
    )
    await user.keyboard("{Escape}")
    await user.click(reasonTrigger())

    // Only classifications that occur on failures are offered.
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Needs your action 1$/,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Will retry automatically 1$/,
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /^Account disabled/ }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: /^Will retry automatically 1$/,
      }),
    )
    await user.keyboard("{Escape}")

    expect(statusTrigger()).toHaveAccessibleName(
      "Filter by execution status: Failed",
    )
    expect(reasonTrigger()).toHaveAccessibleName(
      "Filter by reason: Will retry automatically",
    )
    expect(screen.getByText("Showing 1 of 10")).toBeVisible()
  })

  it("keeps a category and its precise reasons in sync", async () => {
    const user = await renderSubtypeResults()

    await user.click(reasonTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", {
        name: /^Saved credentials are missing.*1$/,
      }),
    )

    const wholeCategory = screen.getByRole("menuitemcheckbox", {
      name: /^Needs your action 3$/,
    })
    expect(wholeCategory).toHaveAttribute("aria-checked", "false")
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Saved credentials are missing.*1$/,
      }),
    ).toHaveAttribute("aria-checked", "true")

    await user.click(wholeCategory)
    expect(wholeCategory).toHaveAttribute("aria-checked", "true")
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: /^Saved credentials are missing.*1$/,
      }),
    ).toHaveAttribute("aria-checked", "false")
  })

  it("clears the reason selection without touching the status filter", async () => {
    const user = await renderSubtypeResults()

    await user.click(statusTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /^Not executed 6$/ }),
    )
    await user.keyboard("{Escape}")
    await user.click(reasonTrigger())
    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /^Account disabled 1$/ }),
    )
    await user.click(screen.getByRole("menuitem", { name: "Clear reasons" }))
    await user.keyboard("{Escape}")

    expect(reasonTrigger()).toHaveAccessibleName(
      "Filter by reason: All reasons",
    )
    expect(statusTrigger()).toHaveAccessibleName(
      "Filter by execution status: Not executed",
    )
    expect(screen.getByText("Showing 6 of 10")).toBeVisible()
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
      reason: {
        appliesTo: [CHECKIN_RESULT_STATUS.SKIPPED],
        categories: [AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED],
        reasons: [],
      },
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
            reason: { appliesTo: [], categories: [], reasons: [] },
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
            reason: { appliesTo: [], categories: [], reasons: [] },
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
      reason: { appliesTo: [], categories: [], reasons: [] },
    })
    expect(onKeywordChange).toHaveBeenCalledWith("")
  })

  it("clears the keyword without exposing it to analytics", async () => {
    const user = userEvent.setup()
    const onKeywordChange = vi.fn()
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={results}
          filter={{
            statuses: [CHECKIN_RESULT_STATUS.FAILED],
            reason: { appliesTo: [], categories: [], reasons: [] },
          }}
          keyword="private-keyword"
          onFilterChange={vi.fn()}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(onKeywordChange).toHaveBeenCalledWith("")
    expect(
      JSON.stringify(trackProductAnalyticsActionCompletedMock.mock.calls),
    ).not.toContain("private-keyword")
  })
})
