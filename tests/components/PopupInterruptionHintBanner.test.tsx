import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import PopupInterruptionHintBanner from "~/components/PopupInterruptionHintBanner"
import {
  clearPopupInterruptionHint,
  POPUP_CRITICAL_FLOWS,
} from "~/services/popupInterruptionHint"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { openSidePanelPage } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockClearPopupInterruptionHint,
  mockGetPopupInterruptionHint,
  mockOpenSidePanelPage,
  mockShowUpdateToast,
  mockUpdateActionClickBehavior,
} = vi.hoisted(() => ({
  mockClearPopupInterruptionHint: vi.fn(),
  mockGetPopupInterruptionHint: vi.fn(),
  mockOpenSidePanelPage: vi.fn(),
  mockShowUpdateToast: vi.fn(),
  mockUpdateActionClickBehavior: vi.fn(),
}))

vi.mock("~/services/popupInterruptionHint", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/popupInterruptionHint")>()

  return {
    ...actual,
    clearPopupInterruptionHint: mockClearPopupInterruptionHint,
    getPopupInterruptionHint: mockGetPopupInterruptionHint,
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openSidePanelPage: mockOpenSidePanelPage,
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: mockShowUpdateToast,
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      updateActionClickBehavior: mockUpdateActionClickBehavior,
    }),
  }
})

describe("PopupInterruptionHintBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateActionClickBehavior.mockResolvedValue({
      ok: true,
      preferences: DEFAULT_PREFERENCES,
    })
    mockOpenSidePanelPage.mockResolvedValue(undefined)
    mockClearPopupInterruptionHint.mockResolvedValue(undefined)
  })

  it("shows a sidebar guidance banner when account auto-detect was interrupted", async () => {
    mockGetPopupInterruptionHint.mockResolvedValue({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      startedAt: 1,
      interruptedAt: 2,
    })

    render(<PopupInterruptionHintBanner />)

    expect(await screen.findByText("ui:popupInterruption.title")).toBeVisible()
    expect(screen.getByText("ui:popupInterruption.description")).toBeVisible()
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("status").className).toContain("bg-amber-50")
  })

  it("saves the sidepanel preference, opens it, and clears the hint", async () => {
    const user = userEvent.setup()
    mockGetPopupInterruptionHint.mockResolvedValue({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      startedAt: 1,
      interruptedAt: 2,
    })

    render(<PopupInterruptionHintBanner />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.useSidepanel",
      }),
    )

    expect(mockUpdateActionClickBehavior).toHaveBeenCalledWith("sidepanel")
    expect(mockClearPopupInterruptionHint).toHaveBeenCalled()
    expect(mockOpenSidePanelPage).toHaveBeenCalled()
    await waitFor(() => {
      expect(
        screen.queryByText("ui:popupInterruption.title"),
      ).not.toBeInTheDocument()
    })
  })

  it("keeps the hint visible when saving the sidepanel preference fails", async () => {
    const user = userEvent.setup()
    const writeFailure = {
      ok: false,
      reason: { type: "storage-error", error: new Error("save failed") },
    }
    mockUpdateActionClickBehavior.mockResolvedValue(writeFailure)
    mockGetPopupInterruptionHint.mockResolvedValue({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      startedAt: 1,
      interruptedAt: 2,
    })

    render(<PopupInterruptionHintBanner />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.useSidepanel",
      }),
    )

    expect(mockClearPopupInterruptionHint).not.toHaveBeenCalled()
    expect(mockOpenSidePanelPage).not.toHaveBeenCalled()
    expect(mockShowUpdateToast).toHaveBeenCalledWith(
      writeFailure,
      "ui:popupInterruption.settingName",
    )
    expect(screen.getByText("ui:popupInterruption.title")).toBeVisible()
  })

  it("clears the hint when the user keeps using the popup", async () => {
    const user = userEvent.setup()
    mockGetPopupInterruptionHint.mockResolvedValue({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      startedAt: 1,
      interruptedAt: 2,
    })

    render(<PopupInterruptionHintBanner />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:popupInterruption.actions.keepPopup",
      }),
    )

    expect(clearPopupInterruptionHint).toHaveBeenCalled()
    expect(openSidePanelPage).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(
        screen.queryByText("ui:popupInterruption.title"),
      ).not.toBeInTheDocument()
    })
  })
})
