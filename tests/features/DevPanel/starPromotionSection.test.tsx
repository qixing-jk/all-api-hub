import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useStarPromotionDevSection } from "~/features/DevPanel/sections/starPromotionSection"
import {
  STAR_PROMOTION_INITIAL_THRESHOLD,
  type StarPromotionState,
} from "~/services/starPromotion/contracts"
import { render } from "~~/tests/test-utils/render"

const {
  addCheckinSuccessesMock,
  deferThresholdPromptMock,
  getStateMock,
  markCompletedMock,
  resetMock,
} = vi.hoisted(() => ({
  addCheckinSuccessesMock: vi.fn(),
  deferThresholdPromptMock: vi.fn(),
  getStateMock: vi.fn(),
  markCompletedMock: vi.fn(),
  resetMock: vi.fn(),
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    addCheckinSuccesses: addCheckinSuccessesMock,
    deferThresholdPrompt: deferThresholdPromptMock,
    getState: getStateMock,
    markCompleted: markCompletedMock,
    reset: resetMock,
  },
}))

const activeState: StarPromotionState = {
  status: "active",
  lifetimeCheckinSuccesses: 0,
  baselineCheckinSuccesses: 0,
  nextThreshold: 30,
  baselineAccountCount: 0,
  nextAccountThreshold: 5,
}

function SectionHarness() {
  const section = useStarPromotionDevSection(true)

  return (
    <div>
      {section.actions.map((action) => (
        <button key={action.id} type="button" onClick={() => void action.run()}>
          {action.label}
        </button>
      ))}
    </div>
  )
}

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

describe("star promotion dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStateMock.mockResolvedValue(activeState)
    resetMock.mockResolvedValue(undefined)
    addCheckinSuccessesMock.mockResolvedValue(undefined)
    deferThresholdPromptMock.mockResolvedValue(undefined)
    markCompletedMock.mockResolvedValue(undefined)
  })

  it("leaves the standalone preview page to sidebar navigation", () => {
    render(<SectionHarness />, RENDER_OPTIONS)
    expect(
      screen.queryByRole("button", { name: "Open star promotion preview" }),
    ).not.toBeInTheDocument()
  })

  it("resets the stored promotion state", async () => {
    render(<SectionHarness />, RENDER_OPTIONS)

    fireEvent.click(screen.getByRole("button", { name: "Dev: Reset state" }))

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1)
    })
  })

  it("seeds the check-in threshold on a clean slate", async () => {
    render(<SectionHarness />, RENDER_OPTIONS)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed check-in threshold" }),
    )

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledTimes(1)
      expect(addCheckinSuccessesMock).toHaveBeenCalledWith(
        STAR_PROMOTION_INITIAL_THRESHOLD,
      )
    })
  })

  it("simulates a deferral", async () => {
    render(<SectionHarness />, RENDER_OPTIONS)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Simulate deferral" }),
    )

    await waitFor(() => {
      expect(deferThresholdPromptMock).toHaveBeenCalledTimes(1)
    })
  })

  it("simulates completion", async () => {
    render(<SectionHarness />, RENDER_OPTIONS)

    fireEvent.click(screen.getByRole("button", { name: "Dev: Mark completed" }))

    await waitFor(() => {
      expect(markCompletedMock).toHaveBeenCalledTimes(1)
    })
  })
})
