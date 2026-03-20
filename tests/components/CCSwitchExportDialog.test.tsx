import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

describe("CCSwitchExportDialog", () => {
  it("loads upstream model ids and exposes them as a selectable default model", async () => {
    vi.resetModules()
    const { CCSwitchExportDialog } = await import(
      "~/components/CCSwitchExportDialog"
    )
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4", "claude"])

    render(
      <CCSwitchExportDialog
        isOpen={true}
        onClose={() => {}}
        account={
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" } as any
        }
        token={{ id: "tok", key: "sk-test" } as any}
      />,
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://x.test",
        apiKey: "sk-test",
      })
    })

    const modelCombo = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.model",
    )
    fireEvent.click(modelCombo)
    expect(await screen.findByText("gpt-4")).toBeInTheDocument()
  })

  it("appends /v1 to the default endpoint when switching to Codex", async () => {
    vi.resetModules()
    const { CCSwitchExportDialog } = await import(
      "~/components/CCSwitchExportDialog"
    )
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

    render(
      <CCSwitchExportDialog
        isOpen={true}
        onClose={() => {}}
        account={
          { id: "acc", name: "Example", baseUrl: "https://x.test" } as any
        }
        token={{ id: "tok", key: "sk-test" } as any}
      />,
    )

    const endpointInput = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.endpoint",
    )
    expect(endpointInput).toHaveValue("https://x.test")

    const appSelect = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.app",
    )
    await user.click(appSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.ccswitch.appOptions.codex",
      }),
    )

    await waitFor(() => {
      expect(endpointInput).toHaveValue("https://x.test/v1")
    })
  })

  it.each([
    "ui:dialog.ccswitch.appOptions.opencode",
    "ui:dialog.ccswitch.appOptions.openclaw",
  ])(
    "keeps the stored base URL as the default endpoint for %s",
    async (appLabel) => {
      vi.resetModules()
      const { CCSwitchExportDialog } = await import(
        "~/components/CCSwitchExportDialog"
      )
      const user = userEvent.setup()
      mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

      render(
        <CCSwitchExportDialog
          isOpen={true}
          onClose={() => {}}
          account={
            { id: "acc", name: "Example", baseUrl: "https://x.test" } as any
          }
          token={{ id: "tok", key: "sk-test" } as any}
        />,
      )

      const endpointInput = await screen.findByLabelText(
        "ui:dialog.ccswitch.fields.endpoint",
      )
      const appSelect = await screen.findByLabelText(
        "ui:dialog.ccswitch.fields.app",
      )

      await user.click(appSelect)
      await user.click(
        await screen.findByRole("option", {
          name: appLabel,
        }),
      )

      await waitFor(() => {
        expect(endpointInput).toHaveValue("https://x.test")
      })
    },
  )

  it("preserves a custom endpoint when switching between CC Switch apps", async () => {
    vi.resetModules()
    const { CCSwitchExportDialog } = await import(
      "~/components/CCSwitchExportDialog"
    )
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

    render(
      <CCSwitchExportDialog
        isOpen={true}
        onClose={() => {}}
        account={
          { id: "acc", name: "Example", baseUrl: "https://x.test" } as any
        }
        token={{ id: "tok", key: "sk-test" } as any}
      />,
    )

    const endpointInput = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.endpoint",
    )
    const appSelect = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.app",
    )

    await user.click(appSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.ccswitch.appOptions.codex",
      }),
    )

    await waitFor(() => {
      expect(endpointInput).toHaveValue("https://x.test/v1")
    })

    await user.clear(endpointInput)
    await user.type(endpointInput, "https://custom.test/router")

    await user.click(appSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.ccswitch.appOptions.opencode",
      }),
    )

    await waitFor(() => {
      expect(endpointInput).toHaveValue("https://custom.test/router")
    })
  })

  it("keeps the model picker usable when upstream model fetch fails", async () => {
    vi.resetModules()
    const { CCSwitchExportDialog } = await import(
      "~/components/CCSwitchExportDialog"
    )
    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("network error"),
    )

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(
      <CCSwitchExportDialog
        isOpen={true}
        onClose={() => {}}
        account={
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" } as any
        }
        token={{ id: "tok", key: "sk-test" } as any}
      />,
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalled()
    })

    const modelCombo = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.model",
    )
    expect(modelCombo).toHaveTextContent("ui:dialog.ccswitch.modelOptions.none")
    expect(screen.queryByText("gpt-4")).toBeNull()
    warnSpy.mockRestore()
  })

  it("prefills notes from the API token note field", async () => {
    vi.resetModules()
    const { CCSwitchExportDialog } = await import(
      "~/components/CCSwitchExportDialog"
    )
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])

    render(
      <CCSwitchExportDialog
        isOpen={true}
        onClose={() => {}}
        account={
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" } as any
        }
        token={{ id: "tok", key: "sk-test", note: "token note" } as any}
      />,
    )

    expect(
      await screen.findByLabelText("ui:dialog.ccswitch.fields.notes"),
    ).toHaveValue("token note")
  })
})
