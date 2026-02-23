import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ActionClickBehaviorSettings from "~/entrypoints/options/pages/BasicSettings/components/ActionClickBehaviorSettings"
import settingsEn from "~/locales/en/settings.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"
import { getSidePanelSupport, type SidePanelSupport } from "~/utils/browserApi"
import { showResultToast, showUpdateToast } from "~/utils/toastHelpers"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    getSidePanelSupport: vi.fn(),
  }
})

vi.mock("~/utils/toastHelpers", () => ({
  showResultToast: vi.fn(),
  showUpdateToast: vi.fn(),
}))

describe("ActionClickBehaviorSettings (side panel fallback)", () => {
  testI18n.addResourceBundle("en", "settings", settingsEn, true, true)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderSubject = () => render(<ActionClickBehaviorSettings />)

  it("shows unsupported helper even when stored preference is sidepanel", async () => {
    const sidePanelSupport = {
      supported: false,
      kind: "unsupported",
      reason: "x",
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
        settingsEn.actionClick.sidepanelUnsupportedHelper,
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
        name: settingsEn.actionClick.sidepanelTitle,
      }),
    )

    await waitFor(() => {
      expect(updateActionClickBehavior).toHaveBeenCalledWith("sidepanel")
    })

    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith(
      true,
      settingsEn.actionClick.sidepanelFallbackToast,
    )
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
  })
})
