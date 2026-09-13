import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers"

const mocks = vi.hoisted(() => ({ register: vi.fn(), scan: vi.fn() }))
vi.mock("~/utils/browser/browserApi", () => ({
  onRuntimeMessage: mocks.register,
}))
vi.mock("~/entrypoints/content/messageHandlers/handlers", () => ({}))
vi.mock("~/services/checkin/feedback/pageScan", () => ({
  handlePageFeedbackScan: mocks.scan,
}))
beforeEach(() => vi.resetAllMocks())

describe("feedback content routing", () => {
  it.each([
    RuntimeActionIds.ContentCheckinFeedbackScan,
    RuntimeActionIds.ContentCancelCheckinFeedbackScan,
  ])("keeps the reply port open for %s", async (action) => {
    mocks.scan.mockImplementation((_request, reply) => reply({ success: true }))
    setupContentMessageHandlers()
    const listener = mocks.register.mock.calls[0][0]
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
    mocks.register.mock.calls[0][0](
      { action: RuntimeActionIds.ContentCheckinFeedbackScan },
      {},
      reply,
    )
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ success: false }),
    )
  })
})
