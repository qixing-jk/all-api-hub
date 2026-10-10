import { afterEach, describe, expect, it, vi } from "vitest"

import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/detection/AutoDetectSlowHintAlert"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

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

  it("keeps troubleshooting available without suggesting a permission-triggered runtime restart", async () => {
    render(<AutoDetectSlowHintAlert />)
    expect(
      await screen.findByText("accountDialog:messages.autoDetectTakingTooLong"),
    ).toBeVisible()
    expect(
      screen.queryByText(
        "accountDialog:messages.autoDetectCookiePermissionReloadHint",
      ),
    ).toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(
      screen.getByRole("button", {
        name: "accountDialog:actions.helpDocument",
      }),
    ).toBeVisible()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
