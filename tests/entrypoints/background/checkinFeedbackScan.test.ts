import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  cancelTempCheckinFeedbackScan,
  executeTempCheckinFeedbackScan,
} from "~/entrypoints/background/checkinFeedbackScan"
import { tempWindowBackgroundRuntime } from "~/entrypoints/background/tempWindowPool"
import { resolveAccountSiteRouteUrl } from "~/services/accounts/utils/siteRouteResolver"
import { FEEDBACK_SCAN_SESSION_TIMEOUT_MS } from "~/services/checkin/feedback/scanTypes"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"
import { removeTempWindowCookieRule } from "~/utils/browser/dnrCookieInjector"

afterEach(() => vi.useRealTimers())

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  tempWindowBackgroundRuntime: {
    run: vi.fn(async (_url, _options, task) => task()),
    acquire: vi.fn(),
    prepareFetchOptions: vi.fn(),
  },
}))
vi.mock("~/utils/browser/browserApi", () => ({
  sendTabMessageWithRetry: vi.fn(),
}))
vi.mock("~/utils/browser/dnrCookieInjector", () => ({
  removeTempWindowCookieRule: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("~/services/accounts/utils/siteRouteResolver", () => ({
  resolveAccountSiteRouteUrl: vi.fn(),
  SITE_ROUTE_KINDS: { CheckIn: "checkIn" },
}))
const navigate = vi.fn().mockResolvedValue(undefined)
const release = vi.fn().mockResolvedValue(undefined)
const authorize = vi.fn().mockResolvedValue({ kind: "allowed", adapter: "tab" })
const params = (requestId: string) => ({
  originUrl: "https://example.com",
  requestId,
  input: { baseUrl: "https://example.com", siteType: "new-api" as const },
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValue(
    "https://example.com/console/personal",
  )
  vi.mocked(tempWindowBackgroundRuntime.acquire).mockResolvedValue({
    tabId: 42,
    release,
    navigate,
  } as any)
  vi.mocked(tempWindowBackgroundRuntime.prepareFetchOptions).mockResolvedValue({
    ruleIds: [17],
    effectiveFetchOptions: { credentials: "include" },
  })
  vi.mocked(sendTabMessageWithRetry).mockResolvedValue({
    success: true,
    data: {},
  })
})

describe("temporary feedback scan ownership", () => {
  it("falls back after route lookup failure", async () => {
    vi.mocked(resolveAccountSiteRouteUrl).mockRejectedValueOnce(
      new Error("lookup failed"),
    )
    const reply = vi.fn()
    await executeTempCheckinFeedbackScan(
      params("route-failure"),
      false,
      authorize,
      reply,
    )
    expect(tempWindowBackgroundRuntime.acquire).toHaveBeenCalledWith(
      "https://example.com",
      "route-failure",
      false,
      expect.any(Object),
      authorize,
    )
    expect(reply).toHaveBeenCalledWith({ success: true, data: {} })
  })

  it("releases the page at its deadline even if cancellation messages reject", async () => {
    vi.useFakeTimers()
    vi.mocked(sendTabMessageWithRetry).mockImplementation(
      async (_tab, request: any) => {
        if (request.action === "contentCheckinFeedbackScan")
          return new Promise(() => {})
        throw new Error("closed port")
      },
    )
    const reply = vi.fn()
    const pending = executeTempCheckinFeedbackScan(
      params("deadline-failure"),
      false,
      authorize,
      reply,
    )
    await vi.advanceTimersByTimeAsync(FEEDBACK_SCAN_SESSION_TIMEOUT_MS)
    await pending
    expect(reply).toHaveBeenCalledWith({ success: false })
    expect(removeTempWindowCookieRule).toHaveBeenCalledWith(17)
    expect(release).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([null, "https://other.example/checkin"])(
    "uses the site homepage when no same-origin manual route is available: %s",
    async (route) => {
      vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValue(route)
      await executeTempCheckinFeedbackScan(
        params("background-fallback"),
        false,
        authorize,
        vi.fn(),
      )
      expect(tempWindowBackgroundRuntime.acquire).toHaveBeenCalledWith(
        "https://example.com",
        "background-fallback",
        false,
        expect.any(Object),
        authorize,
      )
    },
  )

  it("holds one page lease for the scan and removes status cookie rules before release", async () => {
    const reply = vi.fn()
    await executeTempCheckinFeedbackScan(
      params("background-1"),
      false,
      authorize,
      reply,
    )
    expect(tempWindowBackgroundRuntime.acquire).toHaveBeenCalledWith(
      "https://example.com/console/personal",
      "background-1",
      false,
      expect.any(Object),
      authorize,
    )
    expect(navigate).toHaveBeenCalledWith(
      "https://example.com/console/personal",
      expect.objectContaining({ origin: "https://example.com" }),
    )
    expect(
      tempWindowBackgroundRuntime.prepareFetchOptions,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        rawOptions: { credentials: "omit" },
        resolvedAuthType: "access_token",
      }),
    )
    expect(sendTabMessageWithRetry).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        action: "contentCheckinFeedbackScan",
        statusOptions: expect.objectContaining({
          "/api/user/checkin": { credentials: "include" },
        }),
      }),
    )
    expect(removeTempWindowCookieRule).toHaveBeenCalledWith(17)
    expect(release).toHaveBeenCalledWith()
    expect(reply).toHaveBeenCalledWith({ success: true, data: {} })
  })

  it("does not open a page when cancellation reaches the background before authorization completes", async () => {
    cancelTempCheckinFeedbackScan("background-pre-cancel")
    const reply = vi.fn()
    await executeTempCheckinFeedbackScan(
      params("background-pre-cancel"),
      false,
      authorize,
      reply,
    )
    expect(tempWindowBackgroundRuntime.acquire).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({ success: false })
  })

  it("cancels page reads and releases only its lease when the dialog closes", async () => {
    vi.mocked(sendTabMessageWithRetry).mockImplementation(
      async (_tabId, request: any) => {
        if (request.action === "contentCheckinFeedbackScan")
          return new Promise(() => {})
        return { success: true }
      },
    )
    const reply = vi.fn()
    const pending = executeTempCheckinFeedbackScan(
      params("background-close"),
      false,
      authorize,
      reply,
    )
    await vi.waitFor(() =>
      expect(sendTabMessageWithRetry).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ action: "contentCheckinFeedbackScan" }),
      ),
    )
    cancelTempCheckinFeedbackScan("background-close")
    await pending
    expect(sendTabMessageWithRetry).toHaveBeenCalledWith(42, {
      action: "contentCancelCheckinFeedbackScan",
      requestId: "background-close",
    })
    expect(release).toHaveBeenCalledWith()
    expect(reply).toHaveBeenCalledWith({ success: false })
  })
})
