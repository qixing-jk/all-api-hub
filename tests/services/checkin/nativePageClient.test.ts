import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS } from "~/services/checkin/discovery/evidence/scanTypes"
import { findNativeCheckInPagesInBrowser } from "~/services/checkin/discovery/nativePageClient"
import type { NativeCheckInPageExploration } from "~/services/checkin/discovery/nativePageDiscovery"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: vi.fn(),
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue({ success: true }),
}))

const input = {
  siteUrl: "https://site.test/console",
  siteType: SITE_TYPES.NEW_API,
  nativePagePath: "/invite",
}
const exploration: NativeCheckInPageExploration = {
  candidates: [],
  complete: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe("native page discovery client", () => {
  it("sends only navigation facts and retires cancellation after completion", async () => {
    vi.mocked(executeProtectionBypassTask).mockResolvedValue({
      success: true,
      data: exploration,
    })
    const controller = new AbortController()
    const draft = { ...input, accessToken: "not-for-discovery", userId: "42" }
    expect(
      await findNativeCheckInPagesInBrowser(draft, controller.signal),
    ).toBe(exploration)
    expect(executeProtectionBypassTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: {
          kind: "checkin_page_discovery",
          params: {
            originUrl: "https://site.test",
            requestId: expect.any(String),
            siteType: SITE_TYPES.NEW_API,
            nativePagePath: "/invite",
          },
        },
      }),
    )
    controller.abort()
    await vi.advanceTimersByTimeAsync(CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS)
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { success: false },
    { success: true },
    { success: true, data: { ...exploration, inspectionUnavailable: true } },
  ])(
    "rejects unavailable inspection without a direct fallback: %j",
    async (reply) => {
      vi.mocked(executeProtectionBypassTask).mockResolvedValue(reply)
      await expect(
        findNativeCheckInPagesInBrowser(input, new AbortController().signal),
      ).rejects.toThrow("page_scan_unavailable")
      expect(executeProtectionBypassTask).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(["abort", "timeout"] as const)(
    "cancels the owned request on %s even when the cancellation message fails",
    async (cause) => {
      const remote = createDeferred<{
        success: boolean
        data?: NativeCheckInPageExploration
      }>()
      vi.mocked(executeProtectionBypassTask).mockReturnValue(remote.promise)
      vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
        new Error("port closed"),
      )
      const controller = new AbortController()
      const pending = findNativeCheckInPagesInBrowser(input, controller.signal)
      const rejected = expect(pending).rejects.toThrow("scan_cancelled")
      if (cause === "abort") controller.abort()
      else
        await vi.advanceTimersByTimeAsync(
          CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS,
        )
      await rejected
      const request = vi.mocked(executeProtectionBypassTask).mock.calls[0]![0]
      expect(sendRuntimeMessage).toHaveBeenCalledExactlyOnceWith({
        action: RuntimeActionIds.CancelCheckinPageDiscovery,
        requestId: request.task.params.requestId,
      })
      remote.resolve({ success: true, data: exploration })
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it("does not start a page task after cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      findNativeCheckInPagesInBrowser(input, controller.signal),
    ).rejects.toThrow()
    expect(executeProtectionBypassTask).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
