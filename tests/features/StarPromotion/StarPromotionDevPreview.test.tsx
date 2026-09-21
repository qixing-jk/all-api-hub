import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { STAR_PROMOTION_CARD_TEST_IDS } from "~/features/StarPromotion/StarPromotionCardView"
import {
  STAR_PROMOTION_DEV_PREVIEW_TEST_IDS,
  default as StarPromotionDevPreview,
} from "~/features/StarPromotion/StarPromotionDevPreview"
import { render } from "~~/tests/test-utils/render"

const { getStateMock, isThresholdPromptDueMock, resetMock } = vi.hoisted(
  () => ({
    getStateMock: vi.fn(),
    isThresholdPromptDueMock: vi.fn(),
    resetMock: vi.fn(),
  }),
)

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    getState: getStateMock,
    isThresholdPromptDue: isThresholdPromptDueMock,
    reset: resetMock,
  },
}))

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

/** Returns the rendered scenario container so assertions stay scoped to it. */
function getScenario(scenarioId: string) {
  return screen.getByTestId(
    STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.scenario(scenarioId),
  )
}

/** Reads the visibility badge text for one scenario. */
function getScenarioVerdict(scenarioId: string) {
  const scenario = getScenario(scenarioId)
  return within(scenario).getByText(/card (visible|hidden)/).textContent
}

/**
 * Renders the page and waits for the mounted live-state read to settle, so no
 * state update escapes the test (React logs an act() warning otherwise).
 */
async function renderPreview() {
  render(<StarPromotionDevPreview />, RENDER_OPTIONS)
  const currentState = screen.getByTestId(
    STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.currentState,
  )
  await waitFor(() => {
    expect(within(currentState).getByText(/status:/)).toBeInTheDocument()
  })
}
describe("star promotion dev preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStateMock.mockResolvedValue({
      status: "active",
      lifetimeCheckinSuccesses: 0,
      baselineCheckinSuccesses: 0,
      nextThreshold: 30,
      baselineAccountCount: 0,
      nextAccountThreshold: 5,
    })
    isThresholdPromptDueMock.mockResolvedValue(false)
  })

  it("renders the fixture matrix", async () => {
    await renderPreview()

    expect(
      screen.getByTestId(STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.page),
    ).toBeInTheDocument()
  })

  it("marks below-threshold fixtures as hidden and the rest as visible", async () => {
    await renderPreview()

    expect(getScenarioVerdict("fresh-install")).toBe("card hidden")
    expect(getScenarioVerdict("checkin-threshold")).toBe("card visible")
    expect(getScenarioVerdict("account-threshold")).toBe("card visible")
    expect(getScenarioVerdict("existing-user-baseline")).toBe("card hidden")
    expect(getScenarioVerdict("existing-user-new-accounts")).toBe(
      "card visible",
    )
    expect(getScenarioVerdict("completed")).toBe("card hidden")
  })

  it("shows the deferral cooldown suppressing an otherwise qualifying state", async () => {
    await renderPreview()

    expect(getScenarioVerdict("deferred-cooldown-active")).toBe("card hidden")
  })

  it("keeps the card hidden after the cooldown until value is earned again", async () => {
    await renderPreview()

    expect(getScenarioVerdict("deferred-cooldown-expired")).toBe("card hidden")
    expect(getScenarioVerdict("deferred-then-earned")).toBe("card visible")
  })

  it("renders the real card only for visible fixtures", async () => {
    await renderPreview()

    const visibleScenario = getScenario("checkin-threshold")
    expect(
      within(visibleScenario).getByTestId(STAR_PROMOTION_CARD_TEST_IDS.card),
    ).toBeInTheDocument()

    const hiddenScenario = getScenario("fresh-install")
    expect(
      within(hiddenScenario).queryByTestId(STAR_PROMOTION_CARD_TEST_IDS.card),
    ).toBeNull()
    expect(
      within(hiddenScenario).getByText("No card is rendered in this state."),
    ).toBeInTheDocument()
  })

  it("exposes all three card actions on a visible fixture", async () => {
    await renderPreview()

    const scenario = getScenario("account-threshold")
    expect(
      within(scenario).getByTestId(STAR_PROMOTION_CARD_TEST_IDS.star),
    ).toBeInTheDocument()
    expect(
      within(scenario).getByTestId(STAR_PROMOTION_CARD_TEST_IDS.alreadyStarred),
    ).toBeInTheDocument()
    expect(
      within(scenario).getByTestId(STAR_PROMOTION_CARD_TEST_IDS.later),
    ).toBeInTheDocument()
    expect(
      within(scenario).getByTestId(STAR_PROMOTION_CARD_TEST_IDS.close),
    ).toBeInTheDocument()
  })

  it("records fixture actions without mutating stored state", async () => {
    const user = userEvent.setup()
    await renderPreview()

    const scenario = getScenario("account-threshold")
    await user.click(
      within(scenario).getByTestId(STAR_PROMOTION_CARD_TEST_IDS.star),
    )

    expect(screen.getByText(/account-threshold:star/)).toBeVisible()
    expect(resetMock).not.toHaveBeenCalled()
  })

  it("resets the stored state from the current-device card", async () => {
    const user = userEvent.setup()
    await renderPreview()

    await user.click(
      screen.getByRole("button", {
        name: "Reset stored star promotion state",
      }),
    )

    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it("reads the live promotion state into the current-state card", async () => {
    await renderPreview()

    const currentState = screen.getByTestId(
      STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.currentState,
    )

    // Scope to the current-state card: the fixture diagnostics render the same
    // "status:" text, and the read settles asynchronously.
    await waitFor(() => {
      expect(
        within(currentState).getByText(/status: active/),
      ).toBeInTheDocument()
    })
    expect(getStateMock).toHaveBeenCalled()
    expect(isThresholdPromptDueMock).toHaveBeenCalled()
  })

  it("reports a completed live state as suppressed", async () => {
    getStateMock.mockResolvedValue({
      status: "completed",
      lifetimeCheckinSuccesses: 500,
      baselineCheckinSuccesses: 0,
      nextThreshold: 30,
      baselineAccountCount: 0,
      nextAccountThreshold: 5,
    })
    isThresholdPromptDueMock.mockResolvedValue(false)

    await renderPreview()

    const currentState = screen.getByTestId(
      STAR_PROMOTION_DEV_PREVIEW_TEST_IDS.currentState,
    )
    expect(
      await within(currentState).findByText("card would stay hidden"),
    ).toBeInTheDocument()
  })
})
