import { beforeAll, describe, expect, it, vi } from "vitest"

import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import commonEn from "~/locales/en/common.json"
import uiEn from "~/locales/en/ui.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

describe("CliProxyExportDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "ui", uiEn, true, true)
    testI18n.addResourceBundle("en", "common", commonEn, true, true)
  })

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
        uiEn.dialog.cliproxy.placeholders.modelName,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})
