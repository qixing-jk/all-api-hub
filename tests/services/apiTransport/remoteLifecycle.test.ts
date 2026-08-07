import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  announceRemoteFetchDispatch,
  applyLocalRemoteFetchResultEvidence,
  hasAffirmativeRemoteFetchPreDispatchEvidence,
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

const activeLifecycles = new Set<
  ReturnType<typeof observeRemoteFetchLifecycle>
>()

const observe = (...args: Parameters<typeof observeRemoteFetchLifecycle>) => {
  const lifecycle = observeRemoteFetchLifecycle(...args)
  activeLifecycles.add(lifecycle)
  return lifecycle
}

describe("remote fetch lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listener = undefined
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    for (const lifecycle of activeLifecycles) lifecycle.dispose()
    activeLifecycles.clear()
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
    const lifecycle = observe("request-1", observer)

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
    const lifecycle = observe("request-1", {
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
    const lifecycle = observe("request-1", observer)

    lifecycle.applyResultEvidence(null)
    lifecycle.applyResultEvidence({ transportLifecycle: null })
    lifecycle.applyResultEvidence({ transportLifecycle: "malformed" })
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

  it("reports affirmative pre-dispatch evidence while applying the result", () => {
    const lifecycle = observe("request-1", {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    })

    expect(
      lifecycle.applyResultEvidence({
        transportLifecycle: {
          upstreamRequestDispatched: false,
          upstreamResponseReceived: false,
        },
      }),
    ).toMatchObject({ affirmativePreDispatch: true })
    expect(
      lifecycle.applyResultEvidence({
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: false,
        },
      }),
    ).toMatchObject({ affirmativePreDispatch: false })
  })

  it("snapshots stateful top-level and nested lifecycle getters once", () => {
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const lifecycle = observe("request-1", observer)
    let lifecycleReads = 0
    let dispatchReads = 0
    let responseReads = 0
    const result = {
      get transportLifecycle() {
        lifecycleReads += 1
        return {
          get upstreamRequestDispatched() {
            dispatchReads += 1
            return dispatchReads > 1
          },
          get upstreamResponseReceived() {
            responseReads += 1
            return false
          },
        }
      },
    }

    const assessment = lifecycle.applyResultEvidence(result)

    expect(assessment).toMatchObject({
      affirmativePreDispatch: true,
      hasTransportLifecycle: true,
    })
    expect(Object.isFrozen(assessment)).toBe(true)
    expect(lifecycleReads).toBe(1)
    expect(dispatchReads).toBe(1)
    expect(responseReads).toBe(1)
    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("reads lifecycle evidence through a stateful proxy without a separate presence probe", () => {
    const lifecycle = observe("request-1", {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    })
    const accesses: string[] = []
    const result = new Proxy(
      {
        transportLifecycle: {
          upstreamRequestDispatched: false,
          upstreamResponseReceived: false,
        },
      },
      {
        get: (target, property, receiver) => {
          accesses.push(`get:${String(property)}`)
          return Reflect.get(target, property, receiver)
        },
        has: (target, property) => {
          accesses.push(`has:${String(property)}`)
          return Reflect.has(target, property)
        },
      },
    )

    expect(lifecycle.applyResultEvidence(result)).toMatchObject({
      affirmativePreDispatch: true,
    })
    expect(accesses).toEqual(["get:transportLifecycle"])
  })

  it.each([null, undefined, "malformed", 42, false])(
    "does not treat non-object result %j as affirmative pre-dispatch evidence",
    (result) => {
      expect(hasAffirmativeRemoteFetchPreDispatchEvidence(result)).toBe(false)
    },
  )

  it("preserves lifecycle accessor errors for the transport boundary", () => {
    const evidenceError = new Error("lifecycle getter failed")
    const result = {
      get transportLifecycle(): never {
        throw evidenceError
      },
    }

    expect(() => hasAffirmativeRemoteFetchPreDispatchEvidence(result)).toThrow(
      evidenceError,
    )
  })

  it("contains observer failures while continuing to process later evidence", () => {
    const observer = {
      onDispatch: vi.fn(() => {
        throw new Error("observer unavailable")
      }),
      onResponse: vi.fn(),
    }
    const lifecycle = observe("request-1", observer)

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

  it("contains a rejected dispatch announcement", async () => {
    mocks.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("runtime messaging unavailable"),
    )

    expect(() => announceRemoteFetchDispatch("request-1")).not.toThrow()
    await Promise.resolve()

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce()
  })

  it("ignores final evidence after disposal", () => {
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const lifecycle = observe("request-1", observer)

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
