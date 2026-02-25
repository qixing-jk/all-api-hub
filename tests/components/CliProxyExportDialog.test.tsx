import { describe, expect, it, vi } from "vitest"

import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

describe("CliProxyExportDialog", () => {
  it("loads upstream model ids and exposes them as name suggestions", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4", "claude"])

    render(
      <CliProxyExportDialog
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

    const nameCombo = await screen.findByRole("combobox")
    fireEvent.click(nameCombo)
    expect(await screen.findByText("gpt-4")).toBeInTheDocument()
  })

  it("falls back to manual input when upstream model fetch fails", async () => {
    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("network error"),
    )

    render(
      <CliProxyExportDialog
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

    expect(
      await screen.findByPlaceholderText(
        "ui:dialog.cliproxy.placeholders.modelName",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})
