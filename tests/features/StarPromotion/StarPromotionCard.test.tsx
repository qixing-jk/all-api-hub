import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { StarPromotionCard } from "~/features/StarPromotion/StarPromotionCard"
import { STAR_PROMOTION_CARD_TEST_IDS } from "~/features/StarPromotion/StarPromotionCardView"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render } from "~~/tests/test-utils/render"

const {
  createTabMock,
  deferThresholdPromptMock,
  isThresholdPromptDueMock,
  markCompletedMock,
  unwatchMock,
  watchStateMock,
} = vi.hoisted(() => ({
  createTabMock: vi.fn(),
  deferThresholdPromptMock: vi.fn(),
  isThresholdPromptDueMock: vi.fn(),
  markCompletedMock: vi.fn(),
  unwatchMock: vi.fn(),
  watchStateMock: vi.fn(),
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    deferThresholdPrompt: deferThresholdPromptMock,
    isThresholdPromptDue: isThresholdPromptDueMock,
    markCompleted: markCompletedMock,
    watchState: watchStateMock,
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    createTab: createTabMock,
  }
})

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

describe("star promotion card", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isThresholdPromptDueMock.mockResolvedValue(true)
    markCompletedMock.mockResolvedValue(undefined)
    deferThresholdPromptMock.mockResolvedValue(undefined)
    createTabMock.mockResolvedValue(undefined)
    watchStateMock.mockReturnValue(unwatchMock)
  })

  it("renders nothing while the threshold is unmet", async () => {
    isThresholdPromptDueMock.mockResolvedValue(false)

    render(<StarPromotionCard />, RENDER_OPTIONS)

    await waitFor(() => {
      expect(isThresholdPromptDueMock).toHaveBeenCalled()
    })
    expect(screen.queryByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)).toBeNull()
  })

  it("floats the card at the bottom-right instead of inline", async () => {
    render(<StarPromotionCard />, RENDER_OPTIONS)

    const card = await screen.findByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)
    const container = card.parentElement

    // A persistent notification-style card must not take part in the page flow.
    expect(container).toHaveClass("fixed", "bottom-4")
    // Even margins on small screens; pinned bottom-right from sm up.
    expect(container).toHaveClass(
      "left-4",
      "right-4",
      "sm:left-auto",
      "sm:w-96",
    )
    // Kept clear of the mobile browser's safe area.
    expect(container).toHaveClass("pb-safe-bottom")
  })

  it("offers star, self-report and both dismissal affordances", async () => {
    render(<StarPromotionCard />, RENDER_OPTIONS)

    const card = await screen.findByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)

    expect(card).toBeInTheDocument()
    expect(
      screen.getByTestId(STAR_PROMOTION_CARD_TEST_IDS.star),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(STAR_PROMOTION_CARD_TEST_IDS.alreadyStarred),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(STAR_PROMOTION_CARD_TEST_IDS.later),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(STAR_PROMOTION_CARD_TEST_IDS.close),
    ).toBeInTheDocument()
  })

  it("completes the promotion and opens the repository when starring", async () => {
    render(<StarPromotionCard />, RENDER_OPTIONS)

    fireEvent.click(
      await screen.findByTestId(STAR_PROMOTION_CARD_TEST_IDS.star),
    )

    await waitFor(() => {
      expect(markCompletedMock).toHaveBeenCalledTimes(1)
      expect(createTabMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)).toBeNull()
  })

  it("defers on the close control without leaving the card up", async () => {
    render(<StarPromotionCard />, RENDER_OPTIONS)

    fireEvent.click(
      await screen.findByTestId(STAR_PROMOTION_CARD_TEST_IDS.close),
    )

    await waitFor(() => {
      expect(deferThresholdPromptMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)).toBeNull()
  })

  it("completes the promotion without opening a tab when already starred", async () => {
    const user = userEvent.setup()
    render(<StarPromotionCard />, RENDER_OPTIONS)

    await user.click(
      await screen.findByTestId(STAR_PROMOTION_CARD_TEST_IDS.alreadyStarred),
    )

    expect(markCompletedMock).toHaveBeenCalledTimes(1)
    expect(createTabMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)).toBeNull()
  })

  it("hides when another mounted surface completes the promotion", async () => {
    render(<StarPromotionCard />, RENDER_OPTIONS)
    expect(
      await screen.findByTestId(STAR_PROMOTION_CARD_TEST_IDS.card),
    ).toBeInTheDocument()

    act(() => {
      atIndex(watchStateMock.mock.calls, 0)[0]({ status: "completed" })
    })

    await waitFor(() => {
      expect(screen.queryByTestId(STAR_PROMOTION_CARD_TEST_IDS.card)).toBeNull()
    })
  })
})
