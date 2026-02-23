import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ActionClickBehaviorSettings from "~/entrypoints/options/pages/BasicSettings/components/ActionClickBehaviorSettings"
import settingsEn from "~/locales/en/settings.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { getSidePanelSupport } from "~/utils/browserApi"
import { showResultToast, showUpdateToast } from "~/utils/toastHelpers"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

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

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <ActionClickBehaviorSettings />
      </I18nextProvider>,
    )

  it("shows unsupported helper even when stored preference is sidepanel", async () => {
    vi.mocked(getSidePanelSupport).mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "x",
    } as any)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      actionClickBehavior: "sidepanel",
      updateActionClickBehavior: vi.fn(),
    } as any)

    renderSubject()

    expect(
      await screen.findByText(
        settingsEn.actionClick.sidepanelUnsupportedHelper,
      ),
    ).toBeInTheDocument()
  })

  it("persists sidepanel selection and shows fallback toast when unsupported", async () => {
    vi.mocked(getSidePanelSupport).mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "x",
    } as any)
    const updateActionClickBehavior = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      actionClickBehavior: "popup",
      updateActionClickBehavior,
    } as any)

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
