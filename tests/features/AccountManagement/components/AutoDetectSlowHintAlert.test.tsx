import { describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_DOC_URL } from "~/constants/about"
import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/AutoDetectSlowHintAlert"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

describe("AutoDetectSlowHintAlert", () => {
  it("opens auto-detect troubleshooting doc", async () => {
    const createSpy = vi.fn()
    ;(browser.tabs as any).create = createSpy

    render(<AutoDetectSlowHintAlert />)

    const helpButton = await screen.findByRole("button", {
      name: "accountDialog:actions.helpDocument",
    })
    fireEvent.click(helpButton)

    expect(createSpy).toHaveBeenCalledWith({
      url: AUTO_DETECT_DOC_URL,
      active: true,
    })
  })
})
