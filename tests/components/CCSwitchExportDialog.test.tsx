import { describe, expect, it, vi } from "vitest"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

describe("CCSwitchExportDialog", () => {
  it("loads upstream model ids and exposes them as a selectable default model", async () => {
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
})
