import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import { createAccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"

const { log, send } = vi.hoisted(() => ({ log: vi.fn(), send: vi.fn() }))
vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ debug: log, info: log }),
}))
vi.mock("~/utils/browser/browserApi", () => ({ sendRuntimeMessage: send }))

describe("account detection diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    send.mockResolvedValue(undefined)
  })

  it("correlates stages and keeps a bounded final summary", () => {
    const trace = createAccountDetectionDiagnostics({ requestId: "detect-1" })
    for (let index = 0; index < 40; index++)
      trace.record("source_result", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        index,
      })
    trace.finish("failed", { reason: "no_usable_session" })
    const summary = log.mock.calls.at(-1)?.[1]
    expect(summary).toMatchObject({
      requestId: "detect-1",
      outcome: "failed",
      reason: "no_usable_session",
      eventCount: 40,
    })
    expect(summary.events).toHaveLength(16)
    expect(summary.events.at(-1)).toMatchObject({
      event: "source_result",
      index: 39,
    })
    expect(send).not.toHaveBeenCalled()
  })

  it("reuses the content log relay with the same request ID", () => {
    const trace = createAccountDetectionDiagnostics({
      requestId: "temp-1",
      relayToBackground: true,
    })
    trace.record("refresh_response", { status: 409 })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cloudflareGuardLog",
        event: "refresh_response",
        details: expect.objectContaining({
          diagnosticScope: "account_detection",
          requestId: "temp-1",
          status: 409,
        }),
      }),
    )
  })

  it("cannot fail the observed operation when local logging or relay fails", () => {
    log.mockImplementation(() => {
      throw new Error("logger failed")
    })
    send.mockImplementation(() => {
      throw new Error("relay failed")
    })
    const trace = createAccountDetectionDiagnostics({ relayToBackground: true })
    expect(() => {
      trace.record("refresh_started")
      trace.finish("failed")
    }).not.toThrow()
    log.mockReset()
  })
})
