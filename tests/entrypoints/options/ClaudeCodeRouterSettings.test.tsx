import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ClaudeCodeRouterSettings from "~/features/BasicSettings/components/tabs/ClaudeCodeRouter/ClaudeCodeRouterSettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

describe("ClaudeCodeRouterSettings", () => {
  type UserPreferencesContextValue = ReturnType<
    typeof useUserPreferencesContext
  >
  type MockUserPreferencesContextValue = Partial<UserPreferencesContextValue>

  const createContextValue = (
    overrides: MockUserPreferencesContextValue = {},
  ): UserPreferencesContextValue =>
    ({
      preferences: { lastUpdated: 1 },
      claudeCodeRouterBaseUrl: "http://router.local",
      claudeCodeRouterApiKey: "router-key",
      updateClaudeCodeRouterBaseUrl: vi.fn().mockResolvedValue(true),
      updateClaudeCodeRouterApiKey: vi.fn().mockResolvedValue(true),
      resetClaudeCodeRouterConfig: vi.fn().mockResolvedValue(true),
      ...overrides,
    }) as unknown as UserPreferencesContextValue

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <ClaudeCodeRouterSettings />
      </I18nextProvider>,
    )

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUserPreferencesContext).mockImplementation(() =>
      createContextValue(),
    )
  })

  it("persists base URL and API key updates with the current preferences version", async () => {
    const updateClaudeCodeRouterBaseUrl = vi.fn().mockResolvedValue(true)
    const updateClaudeCodeRouterApiKey = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        updateClaudeCodeRouterBaseUrl,
        updateClaudeCodeRouterApiKey,
      }),
    )

    renderSubject()

    const baseUrlInput = screen.getByPlaceholderText(
      "settings:claudeCodeRouter.baseUrlPlaceholder",
    )
    fireEvent.change(baseUrlInput, {
      target: { value: "http://next-router.local" },
    })
    fireEvent.blur(baseUrlInput)

    const apiKeyInput = screen.getByDisplayValue("router-key")
    fireEvent.change(apiKeyInput, {
      target: { value: "next-router-key" },
    })
    fireEvent.blur(apiKeyInput)

    await waitFor(() => {
      expect(updateClaudeCodeRouterBaseUrl).toHaveBeenCalledWith(
        "http://next-router.local",
        {
          expectedLastUpdated: 1,
        },
      )
      expect(updateClaudeCodeRouterApiKey).toHaveBeenCalledWith(
        "next-router-key",
        {
          expectedLastUpdated: 1,
        },
      )
      expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
        true,
        "settings:claudeCodeRouter.baseUrlLabel",
      )
      expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
        true,
        "settings:claudeCodeRouter.apiKeyLabel",
      )
    })
  })

  it("toggles the API key visibility label and input type", () => {
    renderSubject()

    const apiKeyInput = screen.getByPlaceholderText(
      "settings:claudeCodeRouter.apiKeyPlaceholder",
    )
    const toggle = screen.getByRole("button", {
      name: "keyManagement:actions.showKey",
    })

    expect(apiKeyInput).toHaveAttribute("type", "password")
    fireEvent.click(toggle)

    expect(
      screen.getByRole("button", {
        name: "keyManagement:actions.hideKey",
      }),
    ).toBeInTheDocument()
    expect(apiKeyInput).toHaveAttribute("type", "text")
  })
})
