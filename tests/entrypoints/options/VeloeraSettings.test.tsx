import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import VeloeraSettings from "~/features/BasicSettings/components/tabs/ManagedSite/VeloeraSettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

const { showUpdateToastMock } = vi.hoisted(() => ({
  showUpdateToastMock: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  runPreferenceUpdateWithToast: async ({
    expectedLastUpdated,
    setting,
    update,
  }: {
    expectedLastUpdated: number
    setting: string
    update: (options: { expectedLastUpdated: number }) => Promise<any>
  }) => {
    const result = await update({ expectedLastUpdated })
    showUpdateToastMock(result, setting)
    return result
  },
  showUpdateToast: showUpdateToastMock,
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
      updateVeloeraBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateVeloeraAdminToken: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateVeloeraUserId: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetVeloeraConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      ...overrides,
    }) as any

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <VeloeraSettings />
      </I18nextProvider>,
    )

  it("shows an inline error and skips persisting when the admin user ID is not numeric", async () => {
    const updateVeloeraUserId = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
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
    const updateVeloeraBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    const updateVeloeraAdminToken = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
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

  it("skips persisting the admin user ID when only legacy whitespace differs", () => {
    const updateVeloeraUserId = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        veloeraUserId: " 200 ",
        updateVeloeraUserId,
      }),
    )

    renderSubject()

    const input = document.querySelectorAll("input")[2]
    expect(input).toBeTruthy()
    if (!input) {
      throw new Error("Expected Veloera user ID input to be rendered")
    }
    fireEvent.change(input, {
      target: { value: "200" },
    })
    fireEvent.blur(input)

    expect(updateVeloeraUserId).not.toHaveBeenCalled()
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
  })

  it("trims and persists a changed admin user ID", async () => {
    const updateVeloeraUserId = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        updateVeloeraUserId,
      }),
    )

    renderSubject()

    const input = document.querySelectorAll("input")[2]
    expect(input).toBeTruthy()
    if (!input) {
      throw new Error("Expected Veloera user ID input to be rendered")
    }

    fireEvent.change(input, {
      target: { value: " 201 " },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateVeloeraUserId).toHaveBeenCalledWith("201", {
        expectedLastUpdated: 1,
      })
      expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        "settings:veloera.fields.userIdLabel",
      )
    })
  })
})
