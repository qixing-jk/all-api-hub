import { afterEach, describe, expect, it, vi } from "vitest"

import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/detection/AutoDetectSlowHintAlert"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("~/utils/navigation/docsLinks", () => ({
  getDocsAutoDetectUrl: vi.fn(),
}))

describe("AutoDetectSlowHintAlert", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it("opens auto-detect troubleshooting doc", async () => {
    const { getDocsAutoDetectUrl } =
      await import("~/utils/navigation/docsLinks")
    const expectedUrl = "https://example.com/auto-detect"
    vi.mocked(getDocsAutoDetectUrl).mockReturnValue(expectedUrl)

    const createSpy = vi.spyOn(browser.tabs, "create")

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

  it("shows an info notice with a troubleshooting action while detection is pending", async () => {
    const onHelpClick = vi.fn()
    const createSpy = vi.spyOn(browser.tabs, "create")

    render(<AutoDetectSlowHintAlert onHelpClick={onHelpClick} />)

    const status = await screen.findByRole("status")
    expect(status).toHaveAttribute("data-tone", "info")
    expect(status).toHaveClass("bg-info-soft")
    expect(status).toHaveTextContent(
      "accountDialog:messages.autoDetectTakingTooLong",
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "accountDialog:messages.autoDetectCookiePermissionReloadHint",
      ),
    ).toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    const helpButton = screen.getByRole("button", {
      name: "accountDialog:actions.helpDocument",
    })
    expect(helpButton).toBeVisible()
    expect(status).toContainElement(helpButton)
    fireEvent.click(helpButton)

    expect(onHelpClick).toHaveBeenCalledOnce()
    expect(createSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
