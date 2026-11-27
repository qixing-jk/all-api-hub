import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import * as siteRoutes from "~/services/accounts/utils/siteRouteResolver"
import { cancelTempCheckinPageDiscovery } from "~/services/browsingContext/tempPage/checkinPageDiscovery"
import { tempWindowBackgroundRuntime } from "~/services/browsingContext/tempPage/runtime"
import { executeAuthorizedTempContextTask } from "~/services/browsingContext/tempPage/taskDispatch"
import {
  CHECK_IN_EVIDENCE_SCAN_PURPOSES,
  FEEDBACK_SCAN_STATUSES,
} from "~/services/checkin/discovery/evidence/scanTypes"
import { TEMP_CONTEXT_TASK_KINDS } from "~/services/protectionBypass/contracts"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { isRecord } from "~/utils/core/object"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/services/browsingContext/tempPage/runtime", () => ({
  tempWindowBackgroundRuntime: {
    run: vi.fn(async (_url, _options, task) => task()),
    acquire: vi.fn(),
  },
}))

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendTabMessageWithRetry: vi.fn(),
}))

const originUrl = "https://example.test"
const originPath = "/profile?tab=account"
const pageUrl = originUrl + originPath
const destination = "/rewards?tab=daily#/checkin"
const navigate = vi.fn()
const release = vi.fn()
const authorize = vi.fn()
let currentPage: string

function discover(requestId: string, reply = vi.fn()) {
  const pending = executeAuthorizedTempContextTask(
    {
      kind: TEMP_CONTEXT_TASK_KINDS.CheckinPageDiscovery,
      params: {
        originUrl,
        requestId,
        siteType: SITE_TYPES.NEW_API,
        nativePagePath: originPath,
      },
    },
    "options",
    authorize,
    reply,
  )
  return { reply, pending }
}

describe("temporary native check-in page discovery", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(tempWindowBackgroundRuntime.run).mockImplementation(
      async (_url, _options, task) => task(),
    )
    vi.mocked(tempWindowBackgroundRuntime.acquire).mockResolvedValue({
      tabId: 42,
      ownerWindowId: undefined,
      navigate,
      inspect: vi.fn().mockResolvedValue(null),
      release,
    })
    currentPage = ""
    navigate.mockImplementation(async (url: string) => {
      currentPage = url
    })
  })

  it("checks script candidates read-only and releases the authorized page lease", async () => {
    vi.mocked(sendTabMessageWithRetry).mockImplementation(async (_id, msg) => {
      if (!isRecord(msg)) throw new Error("Discovery sent an invalid message")
      if (msg.action === RuntimeActionIds.ContentInspectCheckinPage)
        return {
          success: true,
          pageUrl: currentPage,
          hasTarget: currentPage === originUrl + destination,
          candidates: [],
        }
      if (msg.action === RuntimeActionIds.ContentCheckinFeedbackScan)
        return {
          success: true,
          data: {
            status: FEEDBACK_SCAN_STATUSES.Completed,
            pageCandidates: [{ path: destination, sources: ["script"] }],
          },
        }
      throw new Error("Discovery attempted an unexpected action")
    })

    const { reply, pending } = discover("native-discovery")
    await pending

    expect(tempWindowBackgroundRuntime.acquire).toHaveBeenCalledWith(
      pageUrl,
      "native-discovery",
      false,
      { signal: expect.any(AbortSignal) },
      authorize,
    )
    expect(sendTabMessageWithRetry).toHaveBeenCalledWith(42, {
      action: RuntimeActionIds.ContentCheckinFeedbackScan,
      params: {
        originUrl,
        requestId: "native-discovery",
        input: {
          baseUrl: originUrl,
          siteType: SITE_TYPES.NEW_API,
          purpose: CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage,
        },
      },
    })
    expect(navigate.mock.calls.map(([url]) => url)).toEqual([
      pageUrl,
      originUrl + destination,
      pageUrl,
    ])
    expect(release).toHaveBeenCalledOnce()
    expect(reply).toHaveBeenCalledExactlyOnceWith({
      success: true,
      data: {
        complete: true,
        candidates: [
          {
            path: destination,
            sources: ["script", "area"],
            state: "actionable",
          },
        ],
      },
    })
  })

  it("cancels an in-flight scan, rejects a duplicate request and ignores late evidence", async () => {
    const scanning = createDeferred<void>()
    const result = createDeferred<{ success: boolean }>()
    vi.mocked(sendTabMessageWithRetry).mockImplementation(async (_id, msg) => {
      if (!isRecord(msg)) throw new Error("Discovery sent an invalid message")
      switch (msg.action) {
        case RuntimeActionIds.ContentInspectCheckinPage:
          return { success: true, hasTarget: false, candidates: [] }
        case RuntimeActionIds.ContentCheckinFeedbackScan:
          scanning.resolve()
          return result.promise
        case RuntimeActionIds.ContentCancelCheckinFeedbackScan:
          throw new Error("Content script closed during cancellation")
        default:
          throw new Error("Discovery attempted an unexpected action")
      }
    })

    const { reply, pending } = discover("cancelled-discovery")
    await scanning.promise
    const duplicate = discover("cancelled-discovery")
    await duplicate.pending
    expect(duplicate.reply).toHaveBeenCalledExactlyOnceWith({ success: false })
    expect(release).not.toHaveBeenCalled()
    cancelTempCheckinPageDiscovery("cancelled-discovery")
    await pending
    result.resolve({ success: true })

    expect(sendTabMessageWithRetry).toHaveBeenCalledWith(42, {
      action: RuntimeActionIds.ContentCancelCheckinFeedbackScan,
      requestId: "cancelled-discovery",
    })
    expect(tempWindowBackgroundRuntime.acquire).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(reply).toHaveBeenCalledExactlyOnceWith({ success: false })
  })

  it("rejects a route resolving outside the authorized page origin", async () => {
    const resolveRoute = vi
      .spyOn(siteRoutes, "resolveAccountSiteRouteUrl")
      .mockResolvedValueOnce("https://other.test/profile")
    const { reply, pending } = discover("foreign-route")
    try {
      await pending
      expect(tempWindowBackgroundRuntime.acquire).not.toHaveBeenCalled()
      expect(release).not.toHaveBeenCalled()
      expect(reply).toHaveBeenCalledWith({ success: false })
    } finally {
      resolveRoute.mockRestore()
    }
  })
})
