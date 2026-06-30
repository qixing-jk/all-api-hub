import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ClaudeCodeRouterSettings from "~/features/BasicSettings/components/tabs/ClaudeCodeRouter/ClaudeCodeRouterSettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

const { showUpdateToastMock, toastErrorMock } = vi.hoisted(() => ({
  showUpdateToastMock: vi.fn(),
  toastErrorMock: vi.fn(),
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
    if (result?.ok === false && result.reason?.type === "stale") {
      toastErrorMock("settings:messages.preferencesChangedExternally")
    } else {
      showUpdateToastMock(result, setting)
    }
    return result
  },
  showUpdateToast: showUpdateToastMock,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
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
      updateClaudeCodeRouterBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeRouterApiKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetClaudeCodeRouterConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
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
    const updateClaudeCodeRouterBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    const updateClaudeCodeRouterApiKey = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
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
        expect.objectContaining({
          expectedLastUpdated: 1,
        }),
      )
      expect(updateClaudeCodeRouterApiKey).toHaveBeenCalledWith(
        "next-router-key",
        expect.objectContaining({
          expectedLastUpdated: 1,
        }),
      )
      expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        "settings:claudeCodeRouter.baseUrlLabel",
      )
      expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        "settings:claudeCodeRouter.apiKeyLabel",
      )
    })
  })

  it("shows stale preference guidance instead of a generic update failure", async () => {
    const updateClaudeCodeRouterBaseUrl = vi
      .fn()
      .mockImplementation(
        async (
          _url: string,
          _options?: { expectedLastUpdated?: number },
        ): Promise<any> => {
          return {
            ok: false,
            reason: {
              type: "stale",
              expectedLastUpdated: 1,
              actualLastUpdated: 2,
            },
          }
        },
      )
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        updateClaudeCodeRouterBaseUrl,
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

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      )
    })

    expect(updateClaudeCodeRouterBaseUrl).toHaveBeenCalledWith(
      "http://next-router.local",
      expect.objectContaining({
        expectedLastUpdated: 1,
      }),
    )
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
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
