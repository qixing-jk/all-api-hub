import { describe, expect, it, vi } from "vitest"

import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/AutoDetectSlowHintAlert"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

vi.mock("~/utils/docsLinks", () => ({
  getDocsAutoDetectUrl: vi.fn(),
}))

describe("AutoDetectSlowHintAlert", () => {
  it("opens auto-detect troubleshooting doc", async () => {
    const { getDocsAutoDetectUrl } = await import("~/utils/docsLinks")
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
})
