import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  readTempPageReclaimRetryArmed,
  readTempPageReclamationHistory,
  reclaimOrphanedTempPages,
  rotateTempPageBrowserSession,
  setupTempPageReclaimRetryListener,
} from "~/entrypoints/background/tempContextReclamation"
import { rotateInternalTabBrowserSession } from "~/services/browsingContext/internalTabsBackground"

const { reclaimOrphanedInternalTabsMock, RETRY_ALARM } = vi.hoisted(() => ({
  reclaimOrphanedInternalTabsMock: vi.fn(),
  RETRY_ALARM: "tempPageReclaimRetry",
}))

vi.mock("~/services/browsingContext/internalTabReclamation", () => ({
  reclaimOrphanedInternalTabs: reclaimOrphanedInternalTabsMock,
  TEMP_PAGE_RECLAIM_RETRY_ALARM: RETRY_ALARM,
}))

vi.mock("~/services/browsingContext/internalTabsBackground", () => ({
  isInternalTabOwned: vi.fn(() => false),
  rotateInternalTabBrowserSession: vi.fn(),
}))

/** Runs the registered alarm listener with one alarm, as the browser would. */
async function fireAlarm(name: string) {
  const addListener = vi.spyOn(browser.alarms.onAlarm, "addListener")
  setupTempPageReclaimRetryListener()
  const listener = addListener.mock.calls.at(-1)?.[0]
  addListener.mockRestore()

  await listener?.({ name } as browser.alarms.Alarm)
}

beforeEach(() => {
  reclaimOrphanedInternalTabsMock
    .mockReset()
    .mockResolvedValue({ outcomes: [], reclaimedCount: 0 })
})

describe("temp page reclamation composition", () => {
  it("sweeps for its own retry alarm and ignores every other alarm", async () => {
    await fireAlarm("someOtherAlarm")

    expect(reclaimOrphanedInternalTabsMock).not.toHaveBeenCalled()

    await fireAlarm(RETRY_ALARM)

    expect(reclaimOrphanedInternalTabsMock).toHaveBeenCalledTimes(1)
    expect(reclaimOrphanedInternalTabsMock).toHaveBeenCalledWith({
      isTabTracked: expect.any(Function),
    })
  })

  it("keeps the run visible to the dev panel", async () => {
    const summary = {
      outcomes: [{ kind: "closed-tab", tabId: 7 }],
      reclaimedCount: 1,
    }
    reclaimOrphanedInternalTabsMock.mockResolvedValue(summary)

    await reclaimOrphanedTempPages()

    expect(readTempPageReclamationHistory()[0]).toEqual({
      at: expect.any(Number),
      summary,
    })
  })

  it("rotates the browser session through the composed call", async () => {
    await rotateTempPageBrowserSession()

    expect(rotateInternalTabBrowserSession).toHaveBeenCalledTimes(1)
  })

  it("reports whether the retry alarm is armed", async () => {
    const get = vi.spyOn(browser.alarms, "get")
    get.mockResolvedValueOnce(undefined)
    await expect(readTempPageReclaimRetryArmed()).resolves.toBe(false)
    get.mockResolvedValueOnce({ name: RETRY_ALARM } as browser.alarms.Alarm)
    await expect(readTempPageReclaimRetryArmed()).resolves.toBe(true)
    expect(get).toHaveBeenCalledWith(RETRY_ALARM)
  })
})
