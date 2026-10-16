import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import { openSponsorWorkflow } from "~/features/AccountManagement/sponsors/openSponsorWorkflow"
import { sponsorWorkflowChannel } from "~/features/AccountManagement/sponsors/sponsorWorkflowIntent"
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

  it("still visits the provider when the current tab has no window", async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("chrome", { sidePanel: { open } })
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 1 } as browser.tabs.Tab,
    ])
    const visit = vi.fn()
    await openSponsorWorkflow(intent, visit)
    expect(open).toHaveBeenCalledOnce()
    expect(visit).toHaveBeenCalledOnce()
    expect(browser.tabs.create).not.toHaveBeenCalled()
  })

  it.each(["prepare", "publish", "cleanup"])(
    "visits the provider despite %s failure and releases any staged draft",
    async (failure) => {
      vi.stubGlobal("chrome", {
        sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
      })
      if (failure === "prepare")
        vi.spyOn(sponsorWorkflowChannel, "prepare").mockRejectedValue(
          new Error("storage unavailable"),
        )
      else
        vi.spyOn(sponsorWorkflowChannel, "publish").mockRejectedValue(
          new Error("publish failed"),
        )
      if (failure === "cleanup")
        vi.spyOn(sponsorWorkflowChannel, "retract").mockRejectedValue(
          new Error("cleanup failed"),
        )
      const visit = vi.fn()
      await openSponsorWorkflow(intent, visit, {
        id: 7,
        windowId: 2,
      } as browser.tabs.Tab)
      expect(visit).toHaveBeenCalledOnce()
      expect(await consumeSponsorWorkflow(2)).toBeNull()
      expect(browser.tabs.create).not.toHaveBeenCalled()
      const session = await browser.storage.session.get(null)
      expect(
        Object.keys(session).filter((key) =>
          key.includes("sponsorWorkflow_draft"),
        ),
      ).toHaveLength(0)
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
