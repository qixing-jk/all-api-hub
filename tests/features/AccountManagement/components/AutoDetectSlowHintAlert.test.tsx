import { afterEach, describe, expect, it, vi } from "vitest"

import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/AutoDetectSlowHintAlert"
import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    reloadRuntime: vi.fn(),
  }
})

vi.mock("~/utils/navigation/docsLinks", () => ({
  getDocsAutoDetectUrl: vi.fn(),
}))

describe("AutoDetectSlowHintAlert", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("opens auto-detect troubleshooting doc", async () => {
    const { getDocsAutoDetectUrl } = await import(
      "~/utils/navigation/docsLinks"
    )
    const expectedUrl = "https://example.com/auto-detect"
    vi.mocked(getDocsAutoDetectUrl).mockReturnValue(expectedUrl)

    const createSpy = vi.fn()
    ;(browser.tabs as any).create = createSpy

    render(<AutoDetectSlowHintAlert />)

    const helpButton = await screen.findByRole("button", {
      name: "accountDialog:actions.helpDocument",
    })
    fireEvent.click(helpButton)

    expect(createSpy).toHaveBeenCalledWith({
      url: expectedUrl,
      active: true,
    })
  })

  it("offers a confirmed extension reload recovery action for slow Cookie permission detection", async () => {
    const { reloadRuntime } = await import("~/utils/browser/browserApi")

    render(<AutoDetectSlowHintAlert />)

    expect(
      await screen.findByText(
        "accountDialog:messages.autoDetectCookiePermissionReloadHint",
      ),
    ).toBeVisible()

    const reloadButton = screen.getByRole("button", {
      name: "accountDialog:actions.reloadExtensionAndRetry",
    })
    fireEvent.click(reloadButton)

    const reloadDialog = await screen.findByRole("dialog", {
      name: "accountDialog:warnings.reloadExtension.title",
    })

    expect(reloadDialog).toBeVisible()
    expect(
      within(reloadDialog).getByText(
        "accountDialog:messages.reloadExtensionConfirm",
      ),
    ).toBeVisible()

    const confirmButton = within(reloadDialog).getByRole("button", {
      name: "accountDialog:actions.reloadExtensionAndRetry",
    })
    fireEvent.click(confirmButton)

    expect(reloadRuntime).toHaveBeenCalledTimes(1)
  })

  it("does not reload the extension when the recovery action is cancelled", async () => {
    const { reloadRuntime } = await import("~/utils/browser/browserApi")

    render(<AutoDetectSlowHintAlert />)

    const reloadButton = await screen.findByRole("button", {
      name: "accountDialog:actions.reloadExtensionAndRetry",
    })
    fireEvent.click(reloadButton)

    const reloadDialog = await screen.findByRole("dialog", {
      name: "accountDialog:warnings.reloadExtension.title",
    })

    const cancelButton = within(reloadDialog).getByRole("button", {
      name: "common:actions.cancel",
    })
    fireEvent.click(cancelButton)

    expect(reloadRuntime).not.toHaveBeenCalled()
  })
})
