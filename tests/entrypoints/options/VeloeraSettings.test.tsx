import { fireEvent, render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import VeloeraSettings from "~/features/BasicSettings/components/tabs/ManagedSite/VeloeraSettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

describe("VeloeraSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <VeloeraSettings />
      </I18nextProvider>,
    )

  it("shows an inline error and skips persisting when the admin user ID is not numeric", async () => {
    const updateVeloeraUserId = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      veloeraBaseUrl: "https://veloera.example.com",
      veloeraAdminToken: "",
      veloeraUserId: "200",
      updateVeloeraBaseUrl: vi.fn().mockResolvedValue(true),
      updateVeloeraAdminToken: vi.fn().mockResolvedValue(true),
      updateVeloeraUserId,
      resetVeloeraConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByDisplayValue("200")

    fireEvent.change(input, {
      target: { value: "abc" },
    })
    fireEvent.blur(input)

    expect(updateVeloeraUserId).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:errors.validation.userIdNumeric"),
    ).toBeInTheDocument()
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
  })
})
