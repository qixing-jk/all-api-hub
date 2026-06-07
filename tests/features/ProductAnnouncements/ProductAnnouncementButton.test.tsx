import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { requestProductAnnouncementPopoverOpen } from "~/features/ProductAnnouncements/events"
import { useProductAnnouncements } from "~/features/ProductAnnouncements/hooks/useProductAnnouncements"
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"
import { PRODUCT_ANALYTICS_EVENTS } from "~/services/productAnalytics/events"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { render, renderHook, screen, waitFor } from "~~/tests/test-utils/render"

const { mediaQueryState, sendMessageMock, trackProductAnalyticsEventMock } =
  vi.hoisted(() => ({
    mediaQueryState: {
      isSmallScreen: false,
    },
    sendMessageMock: vi.fn(),
    trackProductAnalyticsEventMock: vi.fn(),
  }))

const riskNotice = {
  id: "risk",
  revision: 1,
  severity: "critical",
  priority: 100,
  startsAt: Date.parse("2026-06-06T00:00:00Z"),
  expiresAt: Date.parse("2026-06-20T00:00:00Z"),
  title: "Critical risk",
  message: "Update now.",
  seen: false,
  dismissed: false,
} as const

const warningNotice = {
  id: "warning",
  revision: 2,
  severity: "warning",
  priority: 90,
  startsAt: Date.parse("2026-06-06T00:00:00Z"),
  expiresAt: Date.parse("2026-06-20T00:00:00Z"),
  title: "Warning notice",
  message: "Check configuration.",
  cta: {
    label: "Secure notes",
    url: "https://github.com/qixing-jk/all-api-hub/releases",
  },
  seen: false,
  dismissed: false,
} as const

const unsafeCtaNotice = {
  ...warningNotice,
  id: "unsafe",
  title: "Unsafe CTA",
  cta: {
    label: "Unsafe notes",
    url: "http://example.com/insecure",
  },
} as const

const dismissedNotice = {
  ...warningNotice,
  id: "dismissed",
  title: "Dismissed notice",
  seen: true,
  dismissed: true,
} as const

function createState(
  overrides: Partial<{
    notices: unknown[]
    activeNotices: unknown[]
    dismissedNotices: unknown[]
    primaryRiskNotice: unknown
    activeRiskCount: number
    unseenActiveCount: number
  }> = {},
) {
  const notices = overrides.notices ?? [riskNotice]
  const activeNotices =
    overrides.activeNotices ??
    notices.filter(
      (notice) =>
        typeof notice === "object" &&
        notice !== null &&
        "dismissed" in notice &&
        !notice.dismissed,
    )
  const activeRiskNotices = activeNotices.filter(
    (notice) =>
      typeof notice === "object" &&
      notice !== null &&
      "dismissed" in notice &&
      !notice.dismissed &&
      "severity" in notice &&
      (notice.severity === "critical" || notice.severity === "warning"),
  )

  return {
    success: true,
    data: {
      view: {
        notices,
        activeNotices,
        dismissedNotices:
          overrides.dismissedNotices ??
          notices.filter(
            (notice) =>
              typeof notice === "object" &&
              notice !== null &&
              "dismissed" in notice &&
              notice.dismissed,
          ),
        primaryRiskNotice:
          overrides.primaryRiskNotice ??
          (activeRiskNotices.length > 0 ? activeRiskNotices[0] : null),
        activeRiskCount: overrides.activeRiskCount ?? activeRiskNotices.length,
        unseenActiveCount:
          overrides.unseenActiveCount ??
          activeNotices.filter(
            (notice) =>
              typeof notice === "object" &&
              notice !== null &&
              "seen" in notice &&
              !notice.seen,
          ).length,
      },
    },
  }
}

function renderButton() {
  return render(<ProductAnnouncementButton surface="options-header" />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })
}

vi.mock("~/services/productAnnouncements/messaging", () => ({
  sendProductAnnouncementsMessage: (...args: unknown[]) =>
    sendMessageMock(...args),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

  return {
    ...actual,
    trackProductAnalyticsEvent: (...args: unknown[]) =>
      trackProductAnalyticsEventMock(...args),
  }
})

vi.mock("~/hooks/useMediaQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/hooks/useMediaQuery")>()

  return {
    ...actual,
    useIsSmallScreen: () => mediaQueryState.isSmallScreen,
  }
})

describe("ProductAnnouncementButton", () => {
  beforeEach(() => {
    mediaQueryState.isSmallScreen = false
    sendMessageMock.mockReset()
    sendMessageMock.mockResolvedValue(createState({ unseenActiveCount: 1 }))
    trackProductAnalyticsEventMock.mockReset()
  })

  it("marks unseen notices seen when opened", async () => {
    const user = userEvent.setup()
    renderButton()

    expect(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.openWithRiskCount",
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("product-announcement-badge")).toHaveTextContent(
      "1",
    )

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.openWithRiskCount",
      }),
    )

    expect(await screen.findByText("Critical risk")).toBeInTheDocument()
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids: ["risk"] },
      )
    })
  })

  it("exposes active risk count in the announcement button name", async () => {
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice, warningNotice],
        activeNotices: [
          { ...riskNotice, seen: true },
          warningNotice,
          { ...dismissedNotice, severity: "warning", dismissed: true },
        ],
        activeRiskCount: 2,
        unseenActiveCount: 1,
      }),
    )

    renderButton()

    expect(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.openWithRiskCount",
      }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("product-announcement-badge")).toHaveTextContent(
      "2",
    )
  })

  it("uses the shared header utility button style", async () => {
    renderButton()

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.openWithRiskCount",
    })
    expect(trigger).toHaveClass("h-6", "w-6", "border")
    expect(trigger.querySelector("svg")).toHaveClass("h-4", "w-4")
  })

  it("keeps active risk count visible after opening marks notices seen", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.MarkSeen) {
        return Promise.resolve({ success: true, data: undefined })
      }

      return Promise.resolve(
        createState({
          notices: [riskNotice],
          activeNotices: [{ ...riskNotice, seen: false }],
          primaryRiskNotice: riskNotice,
          activeRiskCount: 1,
          unseenActiveCount: 1,
        }),
      )
    })

    renderButton()

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.openWithRiskCount",
    })
    await user.click(trigger)

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids: ["risk"] },
      )
    })
    expect(screen.getByTestId("product-announcement-badge")).toHaveTextContent(
      "1",
    )
  })

  it("uses activeNotices as the source for seen marking when available", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice, warningNotice],
        activeNotices: [warningNotice],
        unseenActiveCount: 1,
      }),
    )

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    await screen.findByText("Warning notice")
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids: ["warning"] },
      )
    })
  })

  it("does not clamp specific announcement entry title or message copy", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    expect(screen.getByText("Critical risk").closest("h3")).not.toHaveClass(
      "line-clamp-2",
    )
    expect(screen.getByText("Update now.")).not.toHaveClass("line-clamp-4")
  })

  it("does not truncate specific announcement entry CTA labels", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [warningNotice],
        activeNotices: [warningNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    expect(await screen.findByText("Secure notes")).not.toHaveClass("truncate")
  })

  it("marks unseen notices seen when they arrive after an already-open popover", async () => {
    const user = userEvent.setup()
    let resolveInitialState: (value: unknown) => void = () => {}
    const initialStatePromise = new Promise((resolve) => {
      resolveInitialState = resolve
    })

    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.GetState) {
        return initialStatePromise
      }

      return Promise.resolve({ success: true, data: undefined })
    })

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    resolveInitialState(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        unseenActiveCount: 1,
      }),
    )

    expect(await screen.findByText("Critical risk")).toBeInTheDocument()
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.MarkSeen,
        { ids: ["risk"] },
      )
    })
  })

  it("retries marking the same notice seen after a failed seen update", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.MarkSeen) {
        const markSeenCalls = sendMessageMock.mock.calls.filter(
          ([messageType]) =>
            messageType === ProductAnnouncementsMessageTypes.MarkSeen,
        )

        if (markSeenCalls.length === 1) {
          return Promise.resolve({ success: false, error: "temporary failure" })
        }

        return Promise.resolve({ success: true, data: undefined })
      }

      return Promise.resolve(
        createState({
          notices: [riskNotice],
          activeNotices: [riskNotice],
          unseenActiveCount: 1,
        }),
      )
    })

    renderButton()

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.openWithRiskCount",
    })
    await user.click(trigger)
    await waitFor(() => {
      expect(
        sendMessageMock.mock.calls.filter(
          ([type]) => type === ProductAnnouncementsMessageTypes.MarkSeen,
        ),
      ).toHaveLength(1)
    })

    await user.click(trigger)
    await user.click(trigger)

    await waitFor(() => {
      expect(
        sendMessageMock.mock.calls.filter(
          ([type]) => type === ProductAnnouncementsMessageTypes.MarkSeen,
        ),
      ).toHaveLength(2)
    })
  })

  it("dismisses a notice through a uniquely labelled dismiss button and reloads", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.GetState) {
        return Promise.resolve(
          createState({
            notices: [
              { ...riskNotice, seen: true },
              { ...warningNotice, seen: true },
            ],
            activeNotices: [
              { ...riskNotice, seen: true },
              { ...warningNotice, seen: true },
            ],
            unseenActiveCount: 0,
          }),
        )
      }

      return Promise.resolve({ success: true, data: undefined })
    })

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: /Critical risk/,
      }),
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      ProductAnnouncementsMessageTypes.Dismiss,
      { id: "risk", revision: 1 },
    )
    expect(
      sendMessageMock.mock.calls.filter(
        ([type]) => type === ProductAnnouncementsMessageTypes.GetState,
      ),
    ).toHaveLength(2)
  })

  it("switches filters with plain button semantics", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice, dismissedNotice],
        activeNotices: [riskNotice],
        dismissedNotices: [dismissedNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )
    expect(
      screen
        .getByRole("button", {
          name: "productAnnouncements:filters.active",
        })
        .querySelector("svg"),
    ).toHaveClass("h-3.5", "w-3.5")
    expect(
      screen
        .getByRole("button", {
          name: "productAnnouncements:filters.dismissed",
        })
        .querySelector("svg"),
    ).toHaveClass("h-3.5", "w-3.5")
    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:filters.dismissed",
      }),
    )

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(
      screen.getByTestId("product-announcement-popover"),
    ).toBeInTheDocument()
    expect(await screen.findByText("Dismissed notice")).toBeInTheDocument()
  })

  it("closes the announcement popover from an explicit close button", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })
    await user.click(trigger)

    expect(
      await screen.findByTestId("product-announcement-popover"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.close",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByTestId("product-announcement-popover"),
      ).not.toBeInTheDocument()
    })
    expect(trigger).toHaveFocus()
  })

  it("uses a modal sheet instead of an anchored popover on small screens", async () => {
    mediaQueryState.isSmallScreen = true
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })
    await user.click(trigger)

    expect(
      await screen.findByTestId("product-announcement-sheet"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("product-announcement-popover"),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "productAnnouncements:actions.close",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByTestId("product-announcement-sheet"),
      ).not.toBeInTheDocument()
    })
    expect(trigger).toHaveFocus()
  })

  it("uses a modal sheet for popup risk announcements", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        primaryRiskNotice: riskNotice,
        unseenActiveCount: 0,
      }),
    )

    render(<ProductAnnouncementButton surface="popup-header" onlyWhenRisk />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.openWithRiskCount",
      }),
    )

    expect(
      await screen.findByTestId("product-announcement-sheet"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("product-announcement-popover"),
    ).not.toBeInTheDocument()
  })

  it("restores a dismissed notice without switching away from the dismissed filter", async () => {
    const user = userEvent.setup()
    let restored = false
    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.Restore) {
        restored = true
        return Promise.resolve({ success: true, data: undefined })
      }

      if (type === ProductAnnouncementsMessageTypes.GetState) {
        return Promise.resolve(
          restored
            ? createState({
                notices: [{ ...dismissedNotice, dismissed: false, seen: true }],
                activeNotices: [
                  { ...dismissedNotice, dismissed: false, seen: true },
                ],
                dismissedNotices: [],
                activeRiskCount: 1,
                unseenActiveCount: 0,
              })
            : createState({
                notices: [{ ...dismissedNotice, seen: true }],
                activeNotices: [],
                dismissedNotices: [{ ...dismissedNotice, seen: true }],
                activeRiskCount: 0,
                unseenActiveCount: 0,
              }),
        )
      }

      return Promise.resolve({ success: true, data: undefined })
    })

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:filters.dismissed",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: /Dismissed notice/,
      }),
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      ProductAnnouncementsMessageTypes.Restore,
      { id: "dismissed" },
    )
    expect(
      sendMessageMock.mock.calls.filter(
        ([type]) => type === ProductAnnouncementsMessageTypes.GetState,
      ),
    ).toHaveLength(2)
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "productAnnouncements:filters.dismissed",
        }),
      ).toHaveAttribute("aria-pressed", "true")
    })
    expect(
      await screen.findByText("productAnnouncements:empty.dismissed"),
    ).toBeInTheDocument()
  })

  it("keeps the dismissed filter selected when restore fails", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.Restore) {
        return Promise.resolve({ success: false, error: "missing listener" })
      }

      if (type === ProductAnnouncementsMessageTypes.GetState) {
        return Promise.resolve(
          createState({
            notices: [{ ...dismissedNotice, seen: true }],
            activeNotices: [],
            dismissedNotices: [{ ...dismissedNotice, seen: true }],
            activeRiskCount: 0,
            unseenActiveCount: 0,
          }),
        )
      }

      return Promise.resolve({ success: true, data: undefined })
    })

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:filters.dismissed",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: /Dismissed notice/,
      }),
    )

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.Restore,
        { id: "dismissed" },
      )
    })
    expect(
      screen.getByRole("button", {
        name: "productAnnouncements:filters.dismissed",
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      sendMessageMock.mock.calls.filter(
        ([type]) => type === ProductAnnouncementsMessageTypes.GetState,
      ),
    ).toHaveLength(1)
  })

  it("tracks opening, dismissing, and CTA clicks with safe announcement metadata", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [warningNotice],
        activeNotices: [warningNotice],
        unseenActiveCount: 1,
      }),
    )

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.openWithRiskCount",
      }),
    )
    await user.click(await screen.findByRole("link", { name: /Secure notes/ }))
    await user.click(
      await screen.findByRole("button", {
        name: /Warning notice/,
      }),
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        feature_id: "product_announcements",
        action_id: "open_product_announcements",
        surface_id: "options_product_announcements_header",
        entrypoint: "options",
        result: "success",
        product_announcement_action_kind: "open_list",
        product_announcement_active_count: 1,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "open_product_announcement_cta",
        product_announcement_id: "warning",
        product_announcement_severity: "warning",
        product_announcement_action_kind: "open_cta",
        product_announcement_active_count: 1,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: "dismiss_product_announcement",
        product_announcement_id: "warning",
        product_announcement_severity: "warning",
        product_announcement_action_kind: "dismiss",
        product_announcement_active_count: 1,
      }),
    )

    const payloadText = JSON.stringify(
      trackProductAnalyticsEventMock.mock.calls,
    )
    expect(payloadText).not.toContain("Warning notice")
    expect(payloadText).not.toContain("Check configuration.")
    expect(payloadText).not.toContain("https://")
    expect(payloadText).not.toContain("Secure notes")
  })

  it("renders only HTTPS announcement CTA links", async () => {
    const user = userEvent.setup()
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [warningNotice, unsafeCtaNotice],
        activeNotices: [warningNotice, unsafeCtaNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    await user.click(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    )

    expect(
      await screen.findByRole("link", { name: /Secure notes/ }),
    ).toHaveAttribute(
      "href",
      "https://github.com/qixing-jk/all-api-hub/releases",
    )
    expect(screen.queryByRole("link", { name: /Unsafe notes/ })).toBeNull()
  })

  it("opens and focuses the trigger when the matching surface is requested", async () => {
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    const trigger = await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })

    act(() => {
      requestProductAnnouncementPopoverOpen("options-header")
    })

    expect(await screen.findByText("Critical risk")).toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("ignores open requests for a different surface", async () => {
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        unseenActiveCount: 0,
      }),
    )

    renderButton()

    await screen.findByRole("button", {
      name: "productAnnouncements:actions.open",
    })

    act(() => {
      requestProductAnnouncementPopoverOpen("popup-header")
    })

    expect(screen.queryByText("Critical risk")).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("product-announcement-popover"),
    ).not.toBeInTheDocument()
  })

  it("reserves a non-focusable popup slot until risk state is available", async () => {
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        primaryRiskNotice: null,
        unseenActiveCount: 0,
      }),
    )

    render(<ProductAnnouncementButton surface="popup-header" onlyWhenRisk />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.getByTestId("product-announcement-reserved-slot"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "productAnnouncements:actions.open",
      }),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.GetState,
        { locale: "en" },
      )
    })
  })

  it("uses the reserved popup slot when risk notices become visible", async () => {
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [riskNotice],
        activeNotices: [riskNotice],
        primaryRiskNotice: riskNotice,
        unseenActiveCount: 0,
      }),
    )

    render(<ProductAnnouncementButton surface="popup-header" onlyWhenRisk />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const slot = screen.getByTestId("product-announcement-reserved-slot")
    expect(
      await screen.findByRole("button", {
        name: "productAnnouncements:actions.openWithRiskCount",
      }),
    ).toBeInTheDocument()
    expect(slot).toContainElement(
      screen.getByTestId("product-announcement-button"),
    )
  })

  it("ignores stale announcement loads after a newer reload wins", async () => {
    let resolveSlowState: (value: unknown) => void = () => {}
    const slowStatePromise = new Promise((resolve) => {
      resolveSlowState = resolve
    })

    sendMessageMock.mockImplementationOnce(() => slowStatePromise)
    sendMessageMock.mockResolvedValue(
      createState({
        notices: [warningNotice],
        activeNotices: [warningNotice],
        unseenActiveCount: 1,
      }),
    )

    const { result } = renderHook(() => useProductAnnouncements(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await act(async () => {
      await result.current.reload()
    })
    await waitFor(() => {
      expect(result.current.state.view.notices[0]?.id).toBe("warning")
    })

    await act(async () => {
      resolveSlowState(
        createState({
          notices: [riskNotice],
          activeNotices: [riskNotice],
          unseenActiveCount: 1,
        }),
      )
      await slowStatePromise
    })

    await waitFor(() => {
      expect(result.current.state.view.notices[0]?.id).toBe("warning")
    })
  })

  it("does not reload after a pending dismiss resolves post-unmount", async () => {
    let resolveDismiss: (value: unknown) => void = () => {}
    const dismissPromise = new Promise((resolve) => {
      resolveDismiss = resolve
    })

    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.Dismiss) {
        return dismissPromise
      }

      return Promise.resolve(
        createState({
          notices: [riskNotice],
          activeNotices: [riskNotice],
          unseenActiveCount: 1,
        }),
      )
    })

    const { result, unmount } = renderHook(() => useProductAnnouncements(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.GetState,
        { locale: "en" },
      )
    })

    const dismissResult = result.current.dismiss("risk", 1)

    unmount()

    await act(async () => {
      resolveDismiss({ success: true, data: undefined })
      await dismissResult
    })

    expect(
      sendMessageMock.mock.calls.filter(
        ([type]) => type === ProductAnnouncementsMessageTypes.GetState,
      ),
    ).toHaveLength(1)
  })

  it("does not reload after a pending restore resolves post-unmount", async () => {
    let resolveRestore: (value: unknown) => void = () => {}
    const restorePromise = new Promise((resolve) => {
      resolveRestore = resolve
    })

    sendMessageMock.mockImplementation((type) => {
      if (type === ProductAnnouncementsMessageTypes.Restore) {
        return restorePromise
      }

      return Promise.resolve(
        createState({
          notices: [dismissedNotice],
          activeNotices: [],
          dismissedNotices: [dismissedNotice],
          unseenActiveCount: 0,
        }),
      )
    })

    const { result, unmount } = renderHook(() => useProductAnnouncements(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        ProductAnnouncementsMessageTypes.GetState,
        { locale: "en" },
      )
    })

    const restoreResult = result.current.restore("dismissed")

    unmount()

    await act(async () => {
      resolveRestore({ success: true, data: undefined })
      await restoreResult
    })

    expect(
      sendMessageMock.mock.calls.filter(
        ([type]) => type === ProductAnnouncementsMessageTypes.GetState,
      ),
    ).toHaveLength(1)
  })
})
