import { within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { requestProductAnnouncementPopoverOpen } from "~/features/ProductAnnouncements/events"
import { useProductAnnouncements } from "~/features/ProductAnnouncements/hooks/useProductAnnouncements"
import { ProductAnnouncementBanner } from "~/features/ProductAnnouncements/ProductAnnouncementBanner"
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"
import { PRODUCT_ANNOUNCEMENT_TEST_IDS } from "~/features/ProductAnnouncements/testIds"
import { PRODUCT_ANALYTICS_EVENTS } from "~/services/productAnalytics/contracts"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}))

const { trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  trackProductAnalyticsEventMock: vi.fn(),
}))

const riskNotice = {
  id: "risk",
  revision: 1,
  severity: "warning",
  priority: 10,
  startsAt: 1,
  expiresAt: 2,
  title: "Risk notice",
  message: "Please review.",
  seen: false,
  dismissed: false,
} as const

const seenRiskNotice = {
  ...riskNotice,
  seen: true,
} as const

function createState(
  overrides: Partial<{
    notices: ProductAnnouncement[]
    activeNotices: ProductAnnouncement[]
    dismissedNotices: ProductAnnouncement[]
    primaryRiskNotice: ProductAnnouncement | null
  }> = {},
) {
  const notices = overrides.notices ?? [riskNotice]
  const activeNotices = overrides.activeNotices ?? [riskNotice]

  return {
    success: true,
    data: {
      view: {
        notices,
        activeNotices,
        dismissedNotices: overrides.dismissedNotices ?? [],
        primaryRiskNotice:
          overrides.primaryRiskNotice === undefined
            ? activeNotices[0] ?? null
            : overrides.primaryRiskNotice,
        unseenActiveCount: 0,
      },
    },
  }
}

function createEmptyState() {
  return createState({
    notices: [],
    activeNotices: [],
    primaryRiskNotice: null,
  })
}

function ProductAnnouncementBannerFromHook() {
  const { state, dismiss } = useProductAnnouncements()
  const primaryRiskNotice = state.view.primaryRiskNotice

  if (!primaryRiskNotice) {
    return null
  }

  return (
    <ProductAnnouncementBanner
      notice={primaryRiskNotice}
      additionalCount={0}
      onViewAll={() => requestProductAnnouncementPopoverOpen("options-header")}
      onDismiss={dismiss}
    />
  )
}

vi.mock("~/services/productAnnouncements/messaging", () => ({
  sendProductAnnouncementsMessage: (...args: unknown[]) =>
    sendMessageMock(...args),
}))

vi.mock("~/services/productAnalytics/dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/dispatch")
    >()

  return {
    ...actual,
    trackProductAnalyticsEvent: (...args: unknown[]) =>
      trackProductAnalyticsEventMock(...args),
  }
})

describe("ProductAnnouncementBanner", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue(createState())
    trackProductAnalyticsEventMock.mockReset()
  })

  it("renders the primary risk notice and exposes view-all and dismiss actions", async () => {
    const user = userEvent.setup()
    const onViewAll = vi.fn()
    const onDismiss = vi.fn()

    render(
      <ProductAnnouncementBanner
        notice={riskNotice}
        additionalCount={2}
        onViewAll={onViewAll}
        onDismiss={onDismiss}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(screen.getByText("Risk notice")).toBeInTheDocument()
    expect(screen.getByText("Please review.")).not.toHaveClass("line-clamp-2")
    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.viewAll",
      }),
    )
    expect(onViewAll).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.dismiss",
      }),
    )
    expect(onDismiss).toHaveBeenCalledWith("risk", 1)
  })

  it("tracks banner view-all and dismiss actions with safe notice metadata", async () => {
    const user = userEvent.setup()

    render(
      <ProductAnnouncementBanner
        notice={riskNotice}
        additionalCount={2}
        onViewAll={vi.fn()}
        onDismiss={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.viewAll",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.dismiss",
      }),
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        feature_id: "product_announcements",
        action_id: "open_product_announcements",
        surface_id: "options_product_announcements_banner",
        entrypoint: "options",
        result: "success",
        product_announcement_id: "risk",
        product_announcement_severity: "warning",
        product_announcement_action_kind: "open_list",
        product_announcement_active_count: 3,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "dismiss_product_announcement",
        product_announcement_id: "risk",
        product_announcement_severity: "warning",
        product_announcement_action_kind: "dismiss",
        product_announcement_active_count: 3,
      }),
    )

    const payloadText = JSON.stringify(
      trackProductAnalyticsEventMock.mock.calls,
    )
    expect(payloadText).not.toContain("Risk notice")
    expect(payloadText).not.toContain("Please review.")
  })

  it("opens the matching header popover from the banner view-all action and preserves trigger focus", async () => {
    const user = userEvent.setup()

    render(
      <>
        <ProductAnnouncementButton surface="options-header" />
        <ProductAnnouncementBanner
          notice={riskNotice}
          additionalCount={0}
          onViewAll={() =>
            requestProductAnnouncementPopoverOpen("options-header")
          }
          onDismiss={vi.fn()}
        />
      </>,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.viewAll",
      }),
    )

    const popover = await screen.findByTestId(
      PRODUCT_ANNOUNCEMENT_TEST_IDS.popover,
    )
    expect(within(popover).getByText("Risk notice")).toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(1)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_product_announcements",
        surface_id: "options_product_announcements_banner",
        product_announcement_action_kind: "open_list",
      }),
    )
    expect(
      trackProductAnalyticsEventMock.mock.calls.some(([, payload]) => {
        return (
          typeof payload === "object" &&
          payload !== null &&
          "surface_id" in payload &&
          payload.surface_id === "options_product_announcements_header"
        )
      }),
    ).toBe(false)
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids: ["risk"] },
      )
    })
  })

  it("does not open the header popover when the banner requests another surface", async () => {
    const user = userEvent.setup()

    render(
      <>
        <ProductAnnouncementButton surface="options-header" />
        <ProductAnnouncementBanner
          notice={riskNotice}
          additionalCount={0}
          onViewAll={() =>
            requestProductAnnouncementPopoverOpen("popup-header")
          }
          onDismiss={vi.fn()}
        />
      </>,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.viewAll",
      }),
    )

    expect(
      screen.queryByTestId(PRODUCT_ANNOUNCEMENT_TEST_IDS.popover),
    ).not.toBeInTheDocument()
  })

  it("refreshes the header popover state after the banner dismisses the risk notice", async () => {
    const user = userEvent.setup()
    let dismissed = false

    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.Dismiss) {
        dismissed = true
        return Promise.resolve({ success: true, data: undefined })
      }

      if (type === ProductAnnouncementsMessageTypes.GetState) {
        return Promise.resolve(
          dismissed
            ? createEmptyState()
            : createState({
                notices: [seenRiskNotice],
                activeNotices: [seenRiskNotice],
                primaryRiskNotice: seenRiskNotice,
              }),
        )
      }

      return Promise.resolve({ success: true, data: undefined })
    })

    render(
      <>
        <ProductAnnouncementButton surface="options-header" />
        <ProductAnnouncementBannerFromHook />
      </>,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.dismiss",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "productAnnouncements:actions.dismiss",
        }),
      ).not.toBeInTheDocument()
    })

    await user.click(trigger)

    const popover = await screen.findByTestId(
      PRODUCT_ANNOUNCEMENT_TEST_IDS.popover,
    )
    expect(within(popover).queryByText("Risk notice")).not.toBeInTheDocument()
  })

  it("uses explicit one and other summary keys for additional risk counts", () => {
    const renderBanner = (additionalCount: number) =>
      render(
        <ProductAnnouncementBanner
          notice={riskNotice}
          additionalCount={additionalCount}
          onViewAll={vi.fn()}
          onDismiss={vi.fn()}
        />,
        {
          withReleaseUpdateStatusProvider: false,
          withThemeProvider: false,
          withUserPreferencesProvider: false,
        },
      )

    const { unmount } = renderBanner(1)
    expect(
      screen.getByText("productAnnouncements:summary.additional_one"),
    ).toBeInTheDocument()

    unmount()

    renderBanner(2)
    expect(
      screen.getByText("productAnnouncements:summary.additional_other"),
    ).toBeInTheDocument()
  })

  it("renders localized labels for every severity", () => {
    const severities: ProductAnnouncement["severity"][] = [
      "critical",
      "warning",
      "info",
    ]

    for (const severity of severities) {
      const { unmount } = render(
        <ProductAnnouncementBanner
          notice={{ ...riskNotice, severity }}
          additionalCount={0}
          onViewAll={vi.fn()}
          onDismiss={vi.fn()}
        />,
        {
          withReleaseUpdateStatusProvider: false,
          withThemeProvider: false,
          withUserPreferencesProvider: false,
        },
      )

      expect(
        screen.getByText(`productAnnouncements:labels.${severity}`),
      ).toBeInTheDocument()

      unmount()
    }
  })
})
