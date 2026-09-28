import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  scan: vi.fn(),
  prepareSub2Api: vi.fn(),
  completeSub2Api: vi.fn(),
  clearSub2Api: vi.fn(),
  prepareNewApi: vi.fn(),
  completeNewApi: vi.fn(),
  clearNewApi: vi.fn(),
}))
vi.mock("~/utils/browser/browserApi", () => ({
  onRuntimeMessage: mocks.register,
}))
vi.mock("~/entrypoints/content/messageHandlers/handlers", () => ({}))
vi.mock("~/services/apiService/sub2api/oauth/content", () => ({
  handlePrepareSub2ApiOAuth: mocks.prepareSub2Api,
  handleCompleteSub2ApiOAuth: mocks.completeSub2Api,
  handleClearSub2ApiOAuthEvidence: mocks.clearSub2Api,
}))
vi.mock("~/services/apiService/newApiFamily/oauth/newApiContent", () => ({
  handlePrepareNewApiOAuth: mocks.prepareNewApi,
  handleCompleteNewApiOAuth: mocks.completeNewApi,
  handleClearNewApiOAuthEvidence: mocks.clearNewApi,
}))
vi.mock("~/services/checkin/feedback/pageScan", () => ({
  handlePageFeedbackScan: mocks.scan,
}))
beforeEach(() => vi.resetAllMocks())

describe("feedback content routing", () => {
  it.each([
    [RuntimeActionIds.ContentPrepareSub2ApiOAuth, "prepareSub2Api"],
    [RuntimeActionIds.ContentCompleteSub2ApiOAuth, "completeSub2Api"],
    [RuntimeActionIds.ContentClearSub2ApiOAuthEvidence, "clearSub2Api"],
    [RuntimeActionIds.ContentPrepareNewApiOAuth, "prepareNewApi"],
    [RuntimeActionIds.ContentCompleteNewApiOAuth, "completeNewApi"],
    [RuntimeActionIds.ContentClearNewApiOAuthEvidence, "clearNewApi"],
  ] as const)(
    "routes OAuth action %s to its content handler",
    (action, key) => {
      mocks[key].mockReturnValue(true)
      setupContentMessageHandlers()
      const request = { action, requestId: "oauth-flow" }
      const reply = vi.fn()
      const listener = atIndex(mocks.register.mock.calls, 0)[0]
      expect(listener(request, {}, reply)).toBe(true)
      expect(mocks[key]).toHaveBeenCalledExactlyOnceWith(request, reply)
    },
  )

  it.each([
    RuntimeActionIds.ContentCheckinFeedbackScan,
    RuntimeActionIds.ContentCancelCheckinFeedbackScan,
  ])("keeps the reply port open for %s", async (action) => {
    mocks.scan.mockImplementation((_request, reply) => reply({ success: true }))
    setupContentMessageHandlers()
    const listener = atIndex(mocks.register.mock.calls, 0)[0]
    const request = { action, requestId: "scan" }
    const reply = vi.fn()
    expect(listener(request, {}, reply)).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ success: true }),
    )
    expect(mocks.scan).toHaveBeenCalledWith(request, reply)
  })

  it("reports a handler failure through the reply port", async () => {
    mocks.scan.mockImplementation(() => {
      throw new Error("unavailable")
    })
    setupContentMessageHandlers()
    const reply = vi.fn()
    atIndex(mocks.register.mock.calls, 0)[0](
      { action: RuntimeActionIds.ContentCheckinFeedbackScan },
      {},
      reply,
    )
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ success: false }),
    )
  })
})
