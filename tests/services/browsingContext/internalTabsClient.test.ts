import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { excludeInternalTabs } from "~/services/browsingContext/internalTabs"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("browsing-context ownership queries", () => {
  afterEach(() => vi.restoreAllMocks())

  it("batches simultaneous scans but checks ownership again on the next scan", async () => {
    const send = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue({ success: true, tabIds: [12] })
    expect(
      await Promise.all([
        excludeInternalTabs([{ id: 12 }, { id: 13 }]),
        excludeInternalTabs([{ id: 12 }]),
      ]),
    ).toEqual([[{ id: 13 }], []])
    expect(send).toHaveBeenCalledTimes(1)
    expect(atIndex(send.mock.calls, 0)[0]).toEqual({
      action: RuntimeActionIds.GetInternalTabIds,
      tabIds: [12, 13],
    })
    send.mockResolvedValue({ success: true, tabIds: [13] })
    expect(await excludeInternalTabs([{ id: 13 }])).toEqual([])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it.each([
    undefined,
    null,
    {},
    { success: false },
    { tabIds: [] },
    { success: true, tabIds: ["12"] },
    { success: true, tabIds: [99] },
  ])(
    "rejects unconfirmed ownership instead of counting the page as ordinary: %j",
    async (response) => {
      vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue(response)
      await expect(excludeInternalTabs([{ id: 12 }])).rejects.toThrow()
    },
  )

  it("accepts a confirmed empty result and skips queries for an empty scan", async () => {
    const send = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue({ success: true, tabIds: [] })
    expect(await excludeInternalTabs([])).toEqual([])
    expect(send).not.toHaveBeenCalled()
    expect(await excludeInternalTabs([{ id: 12 }])).toEqual([{ id: 12 }])
  })
})
