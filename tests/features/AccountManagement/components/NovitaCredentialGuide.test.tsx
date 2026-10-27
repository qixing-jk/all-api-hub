import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { NovitaCredentialGuide } from "~/features/AccountManagement/components/AccountDialog/form/NovitaCredentialGuide"
import { createTab } from "~/utils/browser/tabs"
import { render as renderWithProviders } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/tabs", () => ({ createTab: vi.fn() }))

const render = (ui: React.ReactElement) =>
  renderWithProviders(ui, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

describe("Novita credential recovery", () => {
  it("keeps the API key while editing the console token and retries failed navigation", async () => {
    const user = userEvent.setup()
    const onCredentialChange = vi.fn()
    const onPrepareInput = vi.fn()
    vi.mocked(createTab)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({} as never)
    render(
      <NovitaCredentialGuide
        credential={
          'novita-credentials:{"apiKey":"sk_daily","consoleToken":"old"}'
        }
        onCredentialChange={onCredentialChange}
        onPrepareInput={onPrepareInput}
        actions={{
          onAcquireConsole: vi.fn(),
          onVerify: vi.fn(),
          isVerifying: false,
        }}
      >
        {(link) => link}
      </NovitaCredentialGuide>,
    )
    const input = screen.getByLabelText(
      /accountDialog:novitaCredentials.console/,
    )
    await user.clear(input)
    expect(onCredentialChange).toHaveBeenLastCalledWith("sk_daily")
    const open = screen.getByRole("button", {
      name: "accountDialog:novitaCredentials.openKeys",
    })
    await user.click(open)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "accountDialog:accessTokenVerification.novita.openPageFailed",
    )
    await user.click(open)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(onPrepareInput).toHaveBeenCalledTimes(2)
    expect(createTab).toHaveBeenLastCalledWith(
      "https://novita.ai/settings/key-management",
      true,
    )
  })
  it.each([true, false])(
    "continues verification in the available surface (side panel: %s)",
    async (sidePanelSupported) => {
      const user = userEvent.setup()
      const onContinue = vi.fn()
      const props = {
        credential: "",
        onCredentialChange: vi.fn(),
        onPrepareInput: vi.fn(),
        children: (link: React.ReactNode) => link,
      }
      const continuation = {
        onContinue,
        sidePanelSupported,
        isPending: false,
        disabled: false,
        errorMessage: "Could not continue",
      }
      const { rerender } = render(
        <NovitaCredentialGuide
          {...props}
          actions={{
            onAcquireConsole: vi.fn(),
            onVerify: vi.fn(),
            isVerifying: false,
            continuation,
          }}
        />,
      )
      const name = sidePanelSupported
        ? "accountDialog:accessTokenVerification.continueInSidePanel"
        : "accountDialog:accessTokenVerification.continueInFullPage"
      await user.click(screen.getByRole("button", { name }))
      expect(onContinue).toHaveBeenCalledOnce()
      expect(screen.getByRole("alert")).toHaveTextContent("Could not continue")
      rerender(
        <NovitaCredentialGuide
          {...props}
          actions={{
            onAcquireConsole: vi.fn(),
            onVerify: vi.fn(),
            isVerifying: false,
            continuation: { ...continuation, isPending: true },
          }}
        />,
      )
      expect(screen.getByRole("button", { name })).toBeDisabled()
    },
  )
})
