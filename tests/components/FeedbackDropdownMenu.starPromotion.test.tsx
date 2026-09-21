import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FeedbackDropdownMenu } from "~/components/FeedbackDropdownMenu"
import { render } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  markCompleted: vi.fn(),
  trackImpression: vi.fn(),
}))

vi.mock("~/features/StarPromotion/useStarPromotionActive", () => ({
  useStarPromotionActive: () => true,
  useStarPromotionPromptImpression: mocks.trackImpression,
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: { markCompleted: mocks.markCompleted },
}))

vi.mock("~/utils/browser", () => ({
  isExtensionPopup: () => false,
  isExtensionSidePanel: () => false,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  createTab: mocks.createTab,
}))

describe("FeedbackDropdownMenu star promotion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.markCompleted.mockResolvedValue(undefined)
    mocks.createTab.mockResolvedValue(undefined)
  })

  it("records the visible item and completes promotion when selected", async () => {
    const user = userEvent.setup()
    render(<FeedbackDropdownMenu language="en" />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(mocks.trackImpression).toHaveBeenCalledWith(true, {
      surfaceId: "feedback_menu_star_item",
      entrypoint: "options",
    })

    await user.click(
      screen.getByRole("button", { name: "ui:feedback.trigger" }),
    )
    fireEvent.click(await screen.findByText("ui:feedback.starOnGithub"))

    await waitFor(() => {
      expect(mocks.markCompleted).toHaveBeenCalledTimes(1)
      expect(mocks.createTab).toHaveBeenCalledTimes(1)
    })
  })
})
