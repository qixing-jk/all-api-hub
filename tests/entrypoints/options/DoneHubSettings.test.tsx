import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import DoneHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/DoneHubSettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
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
      preferences: { lastUpdated: 1 },
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
        {
          expectedLastUpdated: 1,
        },
      )
    })
  })

  it("skips persisting when the trimmed base URL is unchanged", () => {
    const updateDoneHubBaseUrl = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
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

  it("shows an inline error and skips persisting when the admin user ID is not numeric", async () => {
    const updateDoneHubUserId = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      doneHubBaseUrl: "https://donehub.example.com",
      doneHubAdminToken: "",
      doneHubUserId: "100",
      updateDoneHubBaseUrl: vi.fn().mockResolvedValue(true),
      updateDoneHubAdminToken: vi.fn().mockResolvedValue(true),
      updateDoneHubUserId,
      resetDoneHubConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByDisplayValue("100")

    fireEvent.change(input, {
      target: { value: "abc" },
    })
    fireEvent.blur(input)

    expect(updateDoneHubUserId).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:errors.validation.userIdNumeric"),
    ).toBeInTheDocument()
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
  })
})
