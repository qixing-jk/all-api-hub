import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import FilterBar, {
  FILTER_STATUS,
} from "~/features/AutoCheckin/components/FilterBar"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/events"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { testI18n } from "~~/tests/test-utils/i18n"

const { trackProductAnalyticsActionCompletedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
}))

describe("AutoCheckin FilterBar", () => {
  afterEach(() => {
    trackProductAnalyticsActionCompletedMock.mockReset()
  })

  it("clears the keyword search from the shared input clear button", () => {
    const onKeywordChange = vi.fn()

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={[
            {
              accountId: "account-1",
              accountName: "Alpha",
              status: CHECKIN_RESULT_STATUS.SUCCESS,
            } as any,
          ]}
          status={FILTER_STATUS.ALL}
          keyword="Alpha"
          onStatusChange={vi.fn()}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(onKeywordChange).toHaveBeenCalledWith("")
  })

  it("tracks status filter selection with controlled result-filter metadata", () => {
    const onStatusChange = vi.fn()

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={[
            {
              accountId: "account-1",
              accountName: "Alpha",
              status: CHECKIN_RESULT_STATUS.FAILED,
              timestamp: 1,
            } as any,
            {
              accountId: "account-2",
              accountName: "Beta",
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              timestamp: 2,
            } as any,
          ]}
          status={FILTER_STATUS.ALL}
          keyword=""
          onStatusChange={onStatusChange}
          onKeywordChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.failed/i,
      }),
    )

    expect(onStatusChange).toHaveBeenCalledWith(FILTER_STATUS.FAILED)
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
        resultCount: 1,
      },
    })
  })

  it("tracks keyword clearing without exposing the raw keyword", () => {
    const onKeywordChange = vi.fn()

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={[
            {
              accountId: "account-1",
              accountName: "Private Account",
              status: CHECKIN_RESULT_STATUS.FAILED,
              timestamp: 1,
            } as any,
          ]}
          status={FILTER_STATUS.FAILED}
          keyword="private-keyword"
          onStatusChange={vi.fn()}
          onKeywordChange={onKeywordChange}
        />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(onKeywordChange).toHaveBeenCalledWith("")
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.SearchFilter,
        filterCount: 1,
        resultCount: 1,
      },
    })
    expect(
      JSON.stringify(trackProductAnalyticsActionCompletedMock.mock.calls),
    ).not.toContain("private-keyword")
  })

  it("counts results after both pending status and keyword filters", () => {
    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={[
            {
              accountId: "account-1",
              accountName: "Alpha",
              status: CHECKIN_RESULT_STATUS.FAILED,
              rawMessage: "needs private login",
              timestamp: 1,
            } as any,
            {
              accountId: "account-2",
              accountName: "Beta",
              status: CHECKIN_RESULT_STATUS.FAILED,
              rawMessage: "different failure",
              timestamp: 2,
            } as any,
            {
              accountId: "account-3",
              accountName: "Private Success",
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              rawMessage: "ok",
              timestamp: 3,
            } as any,
          ]}
          status={FILTER_STATUS.ALL}
          keyword="private"
          onStatusChange={vi.fn()}
          onKeywordChange={vi.fn()}
        />
      </I18nextProvider>,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: /autoCheckin:execution\.filters\.failed/i,
      }),
    )

    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        insights: expect.objectContaining({
          mode: PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
          filterCount: 2,
          resultCount: 1,
        }),
      }),
    )
  })
})
