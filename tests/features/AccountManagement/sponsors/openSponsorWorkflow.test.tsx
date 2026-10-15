import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import { openSponsorWorkflow } from "~/features/AccountManagement/sponsors/openSponsorWorkflow"
import { consumeSponsorWorkflow } from "~~/tests/test-utils/sponsorWorkflow"

const intent = {
  kind: SPONSOR_WORKFLOW_KINDS.Bookmark,
  prefill: { name: "Sponsor", url: "https://sponsor.example/" },
}

describe("optional sponsor sidebar", () => {
  beforeEach(async () => {
    await browser.storage.session.clear()
    vi.spyOn(window, "close").mockImplementation(() => {})
    vi.spyOn(browser.tabs, "create")
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(["unsupported", "rejected"])(
    "visits the provider without creating Options when the sidebar is %s",
    async (mode) => {
      vi.stubGlobal(
        "chrome",
        mode === "unsupported"
          ? {}
          : {
              sidePanel: {
                open: vi.fn().mockRejectedValue(new Error("unavailable")),
              },
            },
      )
      const visit = vi.fn()
      await openSponsorWorkflow(intent, visit, {
        id: 7,
        windowId: 2,
      } as browser.tabs.Tab)
      expect(visit).toHaveBeenCalledOnce()
      expect(browser.tabs.create).not.toHaveBeenCalled()
      expect(await consumeSponsorWorkflow(2)).toBeNull()
    },
  )

  it("opens the sidebar before visiting and delivers the creation hints", async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("chrome", { sidePanel: { open } })
    const visit = vi.fn(() => {
      expect(open).toHaveBeenCalled()
    })
    await openSponsorWorkflow(intent, visit, {
      id: 7,
      windowId: 2,
    } as browser.tabs.Tab)
    expect(await consumeSponsorWorkflow(2)).toMatchObject(intent)
    expect(browser.tabs.create).not.toHaveBeenCalled()
    expect(visit).toHaveBeenCalledOnce()
  })
})
