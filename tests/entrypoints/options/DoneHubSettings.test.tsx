import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import DoneHubSettings from "~/entrypoints/options/pages/BasicSettings/components/tabs/ManagedSite/DoneHubSettings"
import { testI18n } from "~/tests/test-utils/i18n"
import { showUpdateToast } from "~/utils/toastHelpers"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

describe("DoneHubSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <DoneHubSettings />
      </I18nextProvider>,
    )

  it("trims the base URL before persisting", async () => {
    const updateDoneHubBaseUrl = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      doneHubBaseUrl: "https://api.example.com",
      doneHubAdminToken: "",
      doneHubUserId: "",
      updateDoneHubBaseUrl,
      updateDoneHubAdminToken: vi.fn().mockResolvedValue(true),
      updateDoneHubUserId: vi.fn().mockResolvedValue(true),
      resetDoneHubConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      "settings:doneHub.fields.baseUrlPlaceholder",
    )

    fireEvent.change(input, {
      target: { value: "  https://donehub.example.com  " },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateDoneHubBaseUrl).toHaveBeenCalledWith(
        "https://donehub.example.com",
      )
    })
  })

  it("skips persisting when the trimmed base URL is unchanged", () => {
    const updateDoneHubBaseUrl = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      doneHubBaseUrl: "https://donehub.example.com",
      doneHubAdminToken: "",
      doneHubUserId: "",
      updateDoneHubBaseUrl,
      updateDoneHubAdminToken: vi.fn().mockResolvedValue(true),
      updateDoneHubUserId: vi.fn().mockResolvedValue(true),
      resetDoneHubConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      "settings:doneHub.fields.baseUrlPlaceholder",
    )

    fireEvent.change(input, {
      target: { value: "  https://donehub.example.com  " },
    })
    fireEvent.blur(input)

    expect(updateDoneHubBaseUrl).not.toHaveBeenCalled()
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
  })
})
