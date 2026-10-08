import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import PopupInterruptionHintBanner from "~/components/PopupInterruptionHintBanner"
import { POPUP_CRITICAL_FLOWS } from "~/services/popupInterruptionHint"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  clearHint: vi.fn(),
  getHint: vi.fn(),
  openSidePanel: vi.fn(),
  openOptions: vi.fn(),
  closePopup: vi.fn(),
  updatePreference: vi.fn(),
  supported: true,
  inPopup: true,
}))
vi.mock("~/services/popupInterruptionHint", async (original) => ({
  ...(await original<typeof import("~/services/popupInterruptionHint")>()),
  clearPopupInterruptionHint: mocks.clearHint,
  getPopupInterruptionHint: mocks.getHint,
}))
vi.mock("~/utils/browser", () => ({ isExtensionPopup: () => mocks.inPopup }))
vi.mock("~/utils/browser/sidePanel", async (original) => ({
  ...(await original<typeof import("~/utils/browser/sidePanel")>()),
  getSidePanelSupport: () => ({ supported: mocks.supported }),
}))
vi.mock("~/utils/navigation/sidepanel", async (original) => ({
  ...(await original<typeof import("~/utils/navigation/sidepanel")>()),
  openSidePanelWithFallback: mocks.openSidePanel,
}))
vi.mock("~/utils/navigation/optionsPage", async (original) => ({
  ...(await original<typeof import("~/utils/navigation/optionsPage")>()),
  openOrFocusOptionsMenuItem: mocks.openOptions,
}))
vi.mock("~/utils/navigation/popup", async (original) => ({
  ...(await original<typeof import("~/utils/navigation/popup")>()),
  closeIfPopup: mocks.closePopup,
}))
vi.mock("~/contexts/UserPreferencesContext", async (original) => ({
  ...(await original<typeof import("~/contexts/UserPreferencesContext")>()),
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({
    updateActionClickBehavior: mocks.updatePreference,
  }),
}))

describe("PopupInterruptionHintBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.supported = true
    mocks.inPopup = true
    mocks.getHint.mockResolvedValue({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      startedAt: 1,
      interruptedAt: 2,
    })
    mocks.clearHint.mockResolvedValue(undefined)
    mocks.openSidePanel.mockResolvedValue("sidepanel")
    mocks.openOptions.mockResolvedValue(undefined)
  })
  it("offers a one-time side panel continuation without changing toolbar preferences", async () => {
    const user = userEvent.setup()
    render(<PopupInterruptionHintBanner />)
    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.useSidepanel",
      }),
    )
    expect(mocks.openSidePanel).toHaveBeenCalled()
    expect(mocks.updatePreference).not.toHaveBeenCalled()
    expect(mocks.clearHint).toHaveBeenCalled()
    expect(mocks.closePopup).toHaveBeenCalled()
  })
  it("recommends and actually opens Options when side panels are unavailable", async () => {
    mocks.supported = false
    const user = userEvent.setup()
    render(<PopupInterruptionHintBanner />)
    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.useOptions",
      }),
    )
    expect(mocks.openOptions).toHaveBeenCalledWith("account", { action: "add" })
    expect(mocks.openSidePanel).not.toHaveBeenCalled()
    expect(mocks.updatePreference).not.toHaveBeenCalled()
    expect(mocks.clearHint).toHaveBeenCalled()
  })
  it("keeps recovery guidance and the popup available when navigation fails", async () => {
    mocks.openSidePanel.mockRejectedValue(new Error("navigation unavailable"))
    const user = userEvent.setup()
    render(<PopupInterruptionHintBanner />)
    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.useSidepanel",
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ui:popupInterruption.openFailed",
    )
    expect(mocks.clearHint).not.toHaveBeenCalled()
    expect(mocks.closePopup).not.toHaveBeenCalled()
    expect(screen.getByText("ui:popupInterruption.title")).toBeVisible()
  })
  it("does not clear the hint or close the popup before navigation succeeds", async () => {
    const navigation = createDeferred<"sidepanel">()
    mocks.openSidePanel.mockReturnValue(navigation.promise)
    const user = userEvent.setup()
    render(<PopupInterruptionHintBanner />)
    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.useSidepanel",
      }),
    )
    expect(mocks.clearHint).not.toHaveBeenCalled()
    expect(mocks.closePopup).not.toHaveBeenCalled()
    navigation.resolve("sidepanel")
    await waitFor(() => expect(mocks.clearHint).toHaveBeenCalled())
  })
  it("does not recommend leaving a side panel or Options page", async () => {
    mocks.inPopup = false
    render(<PopupInterruptionHintBanner />)
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    )
    expect(mocks.getHint).not.toHaveBeenCalled()
  })
  it("dismisses guidance without navigating when keeping the popup", async () => {
    const user = userEvent.setup()
    render(<PopupInterruptionHintBanner />)
    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.keepPopup",
      }),
    )
    expect(mocks.clearHint).toHaveBeenCalled()
    expect(mocks.openSidePanel).not.toHaveBeenCalled()
    expect(mocks.openOptions).not.toHaveBeenCalled()
  })
})
