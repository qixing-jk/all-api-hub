import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { FeedbackDropdownMenu } from "~/components/FeedbackDropdownMenu"
import { render } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  isPopup: false,
  active: true,
  markCompleted: vi.fn(),
  deferThresholdPrompt: vi.fn(),
  trackImpression: vi.fn(),
}))

vi.mock("~/features/StarPromotion/useStarPromotionActive", () => ({
  useStarPromotionActive: () => mocks.active,
  useStarPromotionPromptImpression: mocks.trackImpression,
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    markCompleted: mocks.markCompleted,
    deferThresholdPrompt: mocks.deferThresholdPrompt,
  },
}))

vi.mock("~/utils/browser", () => ({
  isExtensionPopup: () => mocks.isPopup,
  isExtensionSidePanel: () => false,
}))

vi.mock("~/utils/browser/tabs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tabs")>()),
  createTab: mocks.createTab,
}))

describe("FeedbackDropdownMenu star promotion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isPopup = false
    mocks.active = true
    mocks.markCompleted.mockResolvedValue(undefined)
    mocks.createTab.mockResolvedValue(undefined)
  })

  it("records the visible item and defers promotion after opening GitHub", async () => {
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
      expect(mocks.markCompleted).not.toHaveBeenCalled()
      expect(mocks.deferThresholdPrompt).toHaveBeenCalledTimes(1)
      expect(mocks.createTab).toHaveBeenCalledTimes(1)
    })
  })

  it("restores the menu invitation after completion is revoked", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<FeedbackDropdownMenu language="en" />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.trigger" }),
    )
    fireEvent.click(await screen.findByText("ui:feedback.starOnGithub"))
    await waitFor(() => expect(mocks.deferThresholdPrompt).toHaveBeenCalled())
    mocks.active = false
    rerender(<FeedbackDropdownMenu language="en" />)
    mocks.active = true
    rerender(<FeedbackDropdownMenu language="en" />)
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.trigger" }),
    )
    expect(await screen.findByText("ui:feedback.starOnGithub")).toBeVisible()
  })

  it("keeps the invitation available when opening GitHub fails", async () => {
    mocks.createTab.mockRejectedValueOnce(new Error("tab failed"))
    const user = userEvent.setup()
    render(<FeedbackDropdownMenu language="en" />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.trigger" }),
    )
    fireEvent.click(await screen.findByText("ui:feedback.starOnGithub"))
    await waitFor(() => expect(mocks.createTab).toHaveBeenCalled())
    await user.click(
      screen.getByRole("button", { name: "ui:feedback.trigger" }),
    )
    expect(await screen.findByText("ui:feedback.starOnGithub")).toBeVisible()
  })

  it("attributes impressions to the popup entrypoint", () => {
    mocks.isPopup = true

    render(<FeedbackDropdownMenu language="en" />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(mocks.trackImpression).toHaveBeenCalledWith(true, {
      surfaceId: "feedback_menu_star_item",
      entrypoint: "popup",
    })
  })
})
