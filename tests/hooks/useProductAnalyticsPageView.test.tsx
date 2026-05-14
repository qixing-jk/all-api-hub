import { StrictMode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useProductAnalyticsPageView } from "~/hooks/useProductAnalyticsPageView"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  type ProductAnalyticsPageId,
} from "~/services/productAnalytics/events"
import { act, render, renderHook, waitFor } from "~~/tests/test-utils/render"

const { analyticsNow, trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  analyticsNow: { value: 0 },
  trackProductAnalyticsEventMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()
  return {
    ...actual,
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }
})

describe("useProductAnalyticsPageView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    analyticsNow.value += 1000
    vi.spyOn(Date, "now").mockReturnValue(analyticsNow.value)
    trackProductAnalyticsEventMock.mockResolvedValue({ success: true })
  })

  it("tracks app_opened once and page_viewed for the initial page", async () => {
    renderHook(() =>
      useProductAnalyticsPageView({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        pageId: PRODUCT_ANALYTICS_PAGE_IDS.PopupAccounts,
      }),
    )

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(2)
    })
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_EVENTS.AppOpened,
      {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
      },
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_EVENTS.PageViewed,
      {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.PopupAccounts,
      },
    )
  })

  it("tracks only page_viewed when the page id changes after rerender", async () => {
    type HookProps = {
      pageId: ProductAnalyticsPageId
    }

    const { rerender } = renderHook<void, HookProps>(
      ({ pageId }: HookProps) =>
        useProductAnalyticsPageView({
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
          pageId,
        }),
      {
        initialProps: {
          pageId: PRODUCT_ANALYTICS_PAGE_IDS.PopupAccounts,
        } satisfies HookProps,
      },
    )

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(2)
    })

    rerender({
      pageId: PRODUCT_ANALYTICS_PAGE_IDS.PopupBookmarks,
    })

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(3)
    })
    expect(trackProductAnalyticsEventMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PageViewed,
      {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.PopupBookmarks,
      },
    )
    expect(
      trackProductAnalyticsEventMock.mock.calls.filter(
        ([eventName]) => eventName === PRODUCT_ANALYTICS_EVENTS.AppOpened,
      ),
    ).toHaveLength(1)
  })

  it("dedupes initial StrictMode remount app_opened and page_viewed effects", async () => {
    vi.stubEnv("MODE", "development")

    function StrictModeHarness() {
      useProductAnalyticsPageView({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        pageId: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      })

      return null
    }

    const firstRender = render(
      <StrictMode>
        <StrictModeHarness />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(2)
    })

    firstRender.unmount()

    render(
      <StrictMode>
        <StrictModeHarness />
      </StrictMode>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(2)
    expect(
      trackProductAnalyticsEventMock.mock.calls.filter(
        ([eventName]) => eventName === PRODUCT_ANALYTICS_EVENTS.AppOpened,
      ),
    ).toHaveLength(1)
    expect(
      trackProductAnalyticsEventMock.mock.calls.filter(
        ([eventName]) => eventName === PRODUCT_ANALYTICS_EVENTS.PageViewed,
      ),
    ).toHaveLength(1)
  })

  it("does not dedupe non-development remounts", async () => {
    vi.stubEnv("MODE", "production")

    function Harness() {
      useProductAnalyticsPageView({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        pageId: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      })

      return null
    }

    const firstRender = render(<Harness />)

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(2)
    })

    firstRender.unmount()
    render(<Harness />)

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(4)
    })
    expect(
      trackProductAnalyticsEventMock.mock.calls.filter(
        ([eventName]) => eventName === PRODUCT_ANALYTICS_EVENTS.AppOpened,
      ),
    ).toHaveLength(2)
    expect(
      trackProductAnalyticsEventMock.mock.calls.filter(
        ([eventName]) => eventName === PRODUCT_ANALYTICS_EVENTS.PageViewed,
      ),
    ).toHaveLength(2)
  })
})
