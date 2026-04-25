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

  const createContextValue = (overrides: Record<string, unknown> = {}) =>
    ({
      preferences: { lastUpdated: 1 },
      veloeraBaseUrl: "https://veloera.example.com",
      veloeraAdminToken: "stored-token",
      veloeraUserId: "200",
      updateVeloeraBaseUrl: vi.fn().mockResolvedValue(true),
      updateVeloeraAdminToken: vi.fn().mockResolvedValue(true),
      updateVeloeraUserId: vi.fn().mockResolvedValue(true),
      resetVeloeraConfig: vi.fn().mockResolvedValue(true),
      ...overrides,
    }) as any

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <VeloeraSettings />
      </I18nextProvider>,
    )

  it("shows an inline error and skips persisting when the admin user ID is not numeric", async () => {
    const updateVeloeraUserId = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        veloeraAdminToken: "",
        updateVeloeraUserId,
      }),
    )

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

  it("trims the base URL and admin token before persisting", async () => {
    const updateVeloeraBaseUrl = vi.fn().mockResolvedValue(true)
    const updateVeloeraAdminToken = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        updateVeloeraBaseUrl,
        updateVeloeraAdminToken,
      }),
    )

    renderSubject()

    const baseUrlInput = screen.getByDisplayValue("https://veloera.example.com")
    fireEvent.change(baseUrlInput, {
      target: { value: "  https://trimmed.veloera.example.com  " },
    })
    fireEvent.blur(baseUrlInput)

    const adminTokenInput = screen.getByDisplayValue("stored-token")
    fireEvent.change(adminTokenInput, {
      target: { value: "  next-token  " },
    })
    fireEvent.blur(adminTokenInput)

    expect(updateVeloeraBaseUrl).toHaveBeenCalledWith(
      "https://trimmed.veloera.example.com",
      {
        expectedLastUpdated: 1,
      },
    )
    expect(updateVeloeraAdminToken).toHaveBeenCalledWith("next-token", {
      expectedLastUpdated: 1,
    })
  })
})
