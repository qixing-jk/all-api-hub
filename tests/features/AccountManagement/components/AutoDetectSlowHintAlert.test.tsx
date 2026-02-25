import { describe, expect, it, vi } from "vitest"

import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/AutoDetectSlowHintAlert"
import { fireEvent, render, screen } from "~/tests/test-utils/render"
import { getDocsAutoDetectUrl } from "~/utils/docsLinks"

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
      url: getDocsAutoDetectUrl(),
      active: true,
    })
  })
})
