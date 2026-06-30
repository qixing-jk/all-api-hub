import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import LoggingSettings from "~/features/BasicSettings/components/tabs/General/LoggingSettings"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

describe("LoggingSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      loggingConsoleEnabled: true,
      loggingLevel: "info",
      resetLoggingSettings: vi.fn().mockResolvedValue({ ok: true }),
      updateLoggingConsoleEnabled: vi.fn().mockResolvedValue({ ok: true }),
      updateLoggingLevel: vi.fn().mockResolvedValue({ ok: true }),
    } as any)
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <LoggingSettings />
      </I18nextProvider>,
    )

  it("shows result-aware feedback after toggling console logging", async () => {
    const writeResult = { ok: true as const }
    const updateLoggingConsoleEnabled = vi.fn().mockResolvedValue(writeResult)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      loggingConsoleEnabled: true,
      loggingLevel: "info",
      resetLoggingSettings: vi.fn().mockResolvedValue({ ok: true }),
      updateLoggingConsoleEnabled,
      updateLoggingLevel: vi.fn().mockResolvedValue({ ok: true }),
    } as any)

    renderSubject()

    fireEvent.click(screen.getByRole("switch", { name: "Toggle" }))

    await waitFor(() => {
      expect(updateLoggingConsoleEnabled).toHaveBeenCalledWith(false)
      expect(showUpdateToast).toHaveBeenCalledWith(
        writeResult,
        "settings:logging.consoleEnabled",
      )
    })
  })
})
