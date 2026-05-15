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
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { testI18n } from "~~/tests/test-utils/i18n"

const { trackProductAnalyticsActionStartedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

describe("AutoCheckin FilterBar", () => {
  afterEach(() => {
    trackProductAnalyticsActionStartedMock.mockReset()
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

  it("tracks status filter selection with controlled action and surface metadata", () => {
    const onStatusChange = vi.fn()

    rtlRender(
      <I18nextProvider i18n={testI18n}>
        <FilterBar
          accountResults={[
            {
              accountId: "account-1",
              accountName: "Alpha",
              status: CHECKIN_RESULT_STATUS.FAILED,
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
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })
})
