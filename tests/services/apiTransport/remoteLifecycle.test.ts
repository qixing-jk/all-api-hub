import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  announceRemoteFetchDispatch,
  applyLocalRemoteFetchResultEvidence,
  observeRemoteFetchLifecycle,
} from "~/services/apiTransport/remoteLifecycle"

const mocks = vi.hoisted(() => ({
  listener: undefined as ((message: any) => void) | undefined,
  dispose: vi.fn(),
  onRuntimeMessage: vi.fn((listener: (message: any) => void) => {
    mocks.listener = listener
    return mocks.dispose
  }),
  sendRuntimeMessage: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  onRuntimeMessage: mocks.onRuntimeMessage,
  sendRuntimeMessage: mocks.sendRuntimeMessage,
}))

describe("remote fetch lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listener = undefined
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)
  })

  it("broadcasts dispatch with only the controlled request identifier", () => {
    announceRemoteFetchDispatch("request-1")

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
      requestId: "request-1",
    })
  })

  it("correlates dispatch by request id and applies final evidence once", () => {
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const lifecycle = observeRemoteFetchLifecycle("request-1", observer)

    mocks.listener?.({
      action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
      requestId: "other-request",
    })
    mocks.listener?.({
      action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
      requestId: "request-1",
    })
    lifecycle.applyResultEvidence({
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })
    lifecycle.applyResultEvidence({
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })
    lifecycle.dispose()

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
  })

  it("lets an intermediate local context apply evidence before inspecting the result", () => {
    const lifecycleOrder: string[] = []
    const lifecycle = observeRemoteFetchLifecycle("request-1", {
      onDispatch: () => lifecycleOrder.push("dispatch"),
      onResponse: () => lifecycleOrder.push("response"),
    })
    const result = {
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
      get success() {
        lifecycleOrder.push("inspect")
        return true
      },
    }

    applyLocalRemoteFetchResultEvidence("request-1", result)
    void result.success
    lifecycle.dispose()

    expect(lifecycleOrder).toEqual(["dispatch", "response", "inspect"])
  })

  it("ignores absent, malformed, and internally inconsistent evidence", () => {
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const lifecycle = observeRemoteFetchLifecycle("request-1", observer)

    lifecycle.applyResultEvidence(null)
    lifecycle.applyResultEvidence({ transportLifecycle: { success: true } })
    lifecycle.applyResultEvidence({
      transportLifecycle: {
        upstreamRequestDispatched: false,
        upstreamResponseReceived: true,
      },
    })

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("contains observer failures while continuing to process later evidence", () => {
    const observer = {
      onDispatch: vi.fn(() => {
        throw new Error("observer unavailable")
      }),
      onResponse: vi.fn(),
    }
    const lifecycle = observeRemoteFetchLifecycle("request-1", observer)

    expect(() => {
      mocks.listener?.({
        action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
        requestId: "request-1",
      })
    }).not.toThrow()
    lifecycle.applyResultEvidence({
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })
    lifecycle.dispose()

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
  })

  it("does not broadcast malformed lifecycle request identifiers", () => {
    announceRemoteFetchDispatch("request id with spaces")

    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("ignores final evidence after disposal", () => {
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const lifecycle = observeRemoteFetchLifecycle("request-1", observer)

    lifecycle.dispose()
    lifecycle.applyResultEvidence({
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
    })

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })
})
