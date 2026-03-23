import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

describe("CCSwitchExportDialog", () => {
  beforeEach(() => {
    mockFetchOpenAICompatibleModelIds.mockReset()
  })

  it("places the app selector before provider details", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])

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

    const appSelect = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.app",
    )
    const nameInput = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.name",
    )

    expect(
      appSelect.compareDocumentPosition(nameInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })

  it("loads upstream model ids and exposes them as a selectable default model", async () => {
    const user = userEvent.setup()
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
    await user.click(modelCombo)
    expect(await screen.findByText("gpt-4")).toBeInTheDocument()
  })

  it("appends /v1 to the default endpoint when switching to Codex", async () => {
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

  it.each([
    {
      appLabel: "ui:dialog.ccswitch.appOptions.opencode",
      notice: "ui:dialog.ccswitch.notices.opencode",
    },
    {
      appLabel: "ui:dialog.ccswitch.appOptions.openclaw",
      notice: "ui:dialog.ccswitch.notices.openclaw",
    },
  ])(
    "shows the protocol limitation notice for $appLabel",
    async ({ appLabel, notice }) => {
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

      expect(screen.queryByText(notice)).toBeNull()

      const appSelect = await screen.findByLabelText(
        "ui:dialog.ccswitch.fields.app",
      )
      await user.click(appSelect)
      await user.click(
        await screen.findByRole("option", {
          name: appLabel,
        }),
      )

      const noticeElement = await screen.findByText(notice)
      expect(noticeElement).toBeInTheDocument()
      expect(noticeElement).toHaveAttribute("id", "ccswitch-app-limitation")
      expect(noticeElement).toHaveAttribute("role", "status")
      expect(appSelect).toHaveAttribute(
        "aria-describedby",
        "ccswitch-app-limitation",
      )
    },
  )

  it("does not show the limitation notice for Codex", async () => {
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

    const appSelect = await screen.findByLabelText(
      "ui:dialog.ccswitch.fields.app",
    )
    await user.click(appSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.ccswitch.appOptions.codex",
      }),
    )

    expect(screen.queryByText("ui:dialog.ccswitch.notices.opencode")).toBeNull()
    expect(screen.queryByText("ui:dialog.ccswitch.notices.openclaw")).toBeNull()
    expect(appSelect).not.toHaveAttribute("aria-describedby")
  })

  it("preserves a custom endpoint when switching between CC Switch apps", async () => {
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
    await user.click(endpointInput)
    await user.paste("https://custom.test/router")

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
