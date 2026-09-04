import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_TOUR_SOURCES,
  PRODUCT_TOUR_VERSIONS,
} from "~/features/ProductTour/constants"
import {
  ProductTourProvider,
  useProductTour,
} from "~/features/ProductTour/ProductTourContext"
import { ProductTourInvitation } from "~/features/ProductTour/ProductTourInvitation"
import { ProductTourReplayCard } from "~/features/ProductTour/ProductTourReplayCard"
import {
  PRODUCT_TOUR_OUTCOMES,
  PRODUCT_TOUR_VARIANTS,
} from "~/services/featureGuidance/featureGuidanceState"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  dismiss: vi.fn(),
  expandSidebar: vi.fn(),
  isMobile: false,
  mobileSidebarOpenChange: vi.fn(),
  guidanceState: { productTour: {} } as {
    productTour: {
      expanded?: {
        handledVersion: number
        outcome: "completed" | "dismissed"
        handledAt: number
      }
      compact?: {
        handledVersion: number
        outcome: "completed" | "dismissed"
        handledAt: number
      }
    }
  },
  toastError: vi.fn(),
  track: vi.fn(),
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    state: mocks.guidanceState,
    completeProductTour: mocks.complete,
    dismissProductTour: mocks.dismiss,
  }),
}))

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsMobile: () => mocks.isMobile,
  useMediaQuery: () => false,
}))

vi.mock("~/services/productAnalytics/dispatch", () => ({
  trackProductAnalyticsEvent: (...args: unknown[]) => mocks.track(...args),
}))

vi.mock("react-hot-toast", () => ({
  default: { error: mocks.toastError },
}))

vi.mock("react-joyride", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-joyride")>()

  return {
    ...actual,
    Joyride: (props: ComponentProps<typeof actual.Joyride>) =>
      props.run ? (
        <div data-testid="mock-joyride">
          <button
            type="button"
            onClick={() =>
              props.onEvent?.(
                {
                  type: actual.EVENTS.TOOLTIP,
                  index: 1,
                  status: actual.STATUS.RUNNING,
                } as never,
                {} as never,
              )
            }
          >
            view step
          </button>
          <button
            type="button"
            onClick={() =>
              props.onEvent?.(
                {
                  type: actual.EVENTS.TOUR_END,
                  index: 6,
                  status: actual.STATUS.FINISHED,
                } as never,
                {} as never,
              )
            }
          >
            finish tour
          </button>
          <button
            type="button"
            onClick={() =>
              props.onEvent?.(
                {
                  type: actual.EVENTS.TOUR_END,
                  index: 1,
                  status: actual.STATUS.SKIPPED,
                } as never,
                {} as never,
              )
            }
          >
            skip tour
          </button>
          <button
            type="button"
            onClick={() => void props.steps[1]?.before?.({} as never)}
          >
            prepare navigation
          </button>
          <button
            type="button"
            onClick={() => void props.steps[2]?.before?.({} as never)}
          >
            prepare content
          </button>
        </div>
      ) : null,
  }
})

function StartProbe() {
  const { startTour } = useProductTour()
  return (
    <button
      type="button"
      onClick={() => startTour(PRODUCT_TOUR_SOURCES.Overview)}
    >
      start probe
    </button>
  )
}

function renderTour(
  children: React.ReactNode,
  isSidebarCollapsed = false,
  isMobileSidebarOpen = false,
) {
  return render(
    <ProductTourProvider
      isSidebarCollapsed={isSidebarCollapsed}
      onExpandSidebar={mocks.expandSidebar}
      isMobileSidebarOpen={isMobileSidebarOpen}
      onMobileSidebarOpenChange={mocks.mobileSidebarOpenChange}
    >
      {children}
    </ProductTourProvider>,
    {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    },
  )
}

describe("ProductTourProvider", () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.complete.mockReset().mockResolvedValue(undefined)
    mocks.dismiss.mockReset().mockResolvedValue(undefined)
    mocks.expandSidebar.mockReset()
    mocks.mobileSidebarOpenChange.mockReset()
    mocks.track.mockReset()
    mocks.toastError.mockReset()
    mocks.isMobile = false
    mocks.guidanceState.productTour = {}
  })

  it("expands the desktop sidebar, tracks step views, and persists completion", async () => {
    const user = userEvent.setup()
    renderTour(<StartProbe />, true)
    const startButton = screen.getByRole("button", { name: "start probe" })
    startButton.focus()

    await user.click(startButton)

    expect(mocks.expandSidebar).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("mock-joyride")).toBeInTheDocument()
    expect(mocks.track).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      expect.objectContaining({
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunProductTour,
      }),
    )

    await user.click(screen.getByRole("button", { name: "view step" }))
    expect(mocks.track).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.ViewProductTourStep,
        item_count: 2,
      }),
    )

    await user.click(screen.getByRole("button", { name: "finish tour" }))

    await waitFor(() => {
      expect(mocks.complete).toHaveBeenCalledWith(
        PRODUCT_TOUR_VARIANTS.Expanded,
        PRODUCT_TOUR_VERSIONS.expanded,
      )
    })
    expect(mocks.track).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunProductTour,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        item_count: 1,
      }),
    )
    await waitFor(() => expect(startButton).toHaveFocus())
  })

  it("persists a skipped tour and keeps manual replay available", async () => {
    const user = userEvent.setup()
    renderTour(<ProductTourReplayCard />)

    await user.click(
      screen.getByRole("button", { name: "productTour:actions.replay" }),
    )
    await user.click(screen.getByRole("button", { name: "skip tour" }))

    await waitFor(() => {
      expect(mocks.dismiss).toHaveBeenCalledWith(
        PRODUCT_TOUR_VARIANTS.Expanded,
        PRODUCT_TOUR_VERSIONS.expanded,
      )
    })
    expect(mocks.track).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunProductTour,
        result: PRODUCT_ANALYTICS_RESULTS.Skipped,
      }),
    )
    expect(
      screen.getByRole("button", { name: "productTour:actions.replay" }),
    ).toBeEnabled()
  })

  it("prepares each compact surface and restores the initial drawer state on exit", async () => {
    const user = userEvent.setup()
    mocks.isMobile = true
    renderTour(<StartProbe />)

    await user.click(screen.getByRole("button", { name: "start probe" }))
    await user.click(screen.getByRole("button", { name: "prepare navigation" }))
    await waitFor(() => {
      expect(mocks.mobileSidebarOpenChange).toHaveBeenLastCalledWith(true)
    })

    await user.click(screen.getByRole("button", { name: "prepare content" }))
    await waitFor(() => {
      expect(mocks.mobileSidebarOpenChange).toHaveBeenLastCalledWith(false)
    })

    await user.click(screen.getByRole("button", { name: "prepare navigation" }))
    await user.click(screen.getByRole("button", { name: "skip tour" }))

    expect(mocks.mobileSidebarOpenChange).toHaveBeenLastCalledWith(false)
  })

  it("defers only the automatic invitation for the current session", async () => {
    const user = userEvent.setup()
    renderTour(
      <>
        <ProductTourInvitation />
        <ProductTourReplayCard />
      </>,
    )

    await user.click(
      screen.getByRole("button", { name: "productTour:actions.later" }),
    )

    expect(
      screen.queryByText("productTour:invitation.title"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "productTour:actions.replay" }),
    ).toBeEnabled()
    expect(mocks.dismiss).not.toHaveBeenCalled()
    expect(mocks.track).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      expect.objectContaining({
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.DeferProductTour,
        result: PRODUCT_ANALYTICS_RESULTS.Skipped,
      }),
    )
  })

  it("keeps the tour closed and reports a useful error when progress storage throws", async () => {
    const user = userEvent.setup()
    mocks.complete.mockRejectedValueOnce(new Error("storage unavailable"))
    renderTour(<StartProbe />)

    await user.click(screen.getByRole("button", { name: "start probe" }))
    await user.click(screen.getByRole("button", { name: "finish tour" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "productTour:errors.saveProgress",
      )
    })
    expect(screen.queryByTestId("mock-joyride")).not.toBeInTheDocument()
  })

  it("does not offer a tour version that was already completed", () => {
    mocks.guidanceState.productTour = {
      expanded: {
        handledVersion: PRODUCT_TOUR_VERSIONS.expanded,
        outcome: PRODUCT_TOUR_OUTCOMES.Completed,
        handledAt: 1,
      },
    }

    renderTour(<ProductTourInvitation />)

    expect(
      screen.queryByText("productTour:invitation.title"),
    ).not.toBeInTheDocument()
  })
})
