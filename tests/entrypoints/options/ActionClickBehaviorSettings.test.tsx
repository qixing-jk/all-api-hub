import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ActionClickBehaviorSettings from "~/features/BasicSettings/components/tabs/General/ActionClickBehaviorSettings"
import {
  getSidePanelSupport,
  type SidePanelSupport,
} from "~/utils/browser/browserApi"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getSidePanelSupport: vi.fn(),
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: vi.fn(),
  showUpdateToast: vi.fn(),
}))

describe("ActionClickBehaviorSettings (side panel fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Note: `renderSubject()` uses the shared test renderer; i18n runs in key-assertion mode
  // so `t()` returns fully-qualified keys (e.g. "settings:...").
  const renderSubject = () => render(<ActionClickBehaviorSettings />)

  it("shows unsupported fallback messaging even when stored preference is sidepanel", async () => {
    const sidePanelSupport = {
      supported: false,
      kind: "unsupported",
      reason:
        "Side panel API exposed, but current mobile runtime cannot present a usable side panel",
    } satisfies SidePanelSupport
    vi.mocked(getSidePanelSupport).mockReturnValue(sidePanelSupport)

    const userPreferencesContext = {
      actionClickBehavior: "sidepanel",
      updateActionClickBehavior: vi.fn(),
    } satisfies Partial<ReturnType<typeof useUserPreferencesContext>>
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      userPreferencesContext as unknown as ReturnType<
        typeof useUserPreferencesContext
      >,
    )

    renderSubject()

    expect(
      await screen.findByText(
        "settings:actionClick.sidepanelUnsupportedHelper",
      ),
    ).toBeInTheDocument()
  })

  it("persists sidepanel selection and shows fallback toast when unsupported", async () => {
    const sidePanelSupport = {
      supported: false,
      kind: "unsupported",
      reason: "x",
    } satisfies SidePanelSupport
    vi.mocked(getSidePanelSupport).mockReturnValue(sidePanelSupport)

    const updateActionClickBehavior = vi.fn().mockResolvedValue(true)
    const userPreferencesContext = {
      actionClickBehavior: "popup",
      updateActionClickBehavior,
    } satisfies Partial<ReturnType<typeof useUserPreferencesContext>>
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      userPreferencesContext as unknown as ReturnType<
        typeof useUserPreferencesContext
      >,
    )

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:actionClick.sidepanelTitle",
      }),
    )

    await waitFor(() => {
      expect(updateActionClickBehavior).toHaveBeenCalledWith("sidepanel")
    })

    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith(
      true,
      "settings:actionClick.sidepanelFallbackToast",
    )
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
  })
})
