import { afterEach, describe, expect, it, vi } from "vitest"

import {
  REQUESTY_MANAGEMENT_KEY_CHANNEL,
  REQUESTY_MANAGEMENT_KEY_REQUEST_KIND,
  REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyBridge"
import {
  createRequestyManagementKeyReader,
  readRequestyManagementKey,
  REQUESTY_MANAGEMENT_KEY_READ_KINDS,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyReader"
import {
  REQUESTY_API_KEYS_ORIGIN,
  REQUESTY_API_KEYS_PATH,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"

const { injectScriptMock } = vi.hoisted(() => ({
  injectScriptMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("wxt/utils/inject-script", () => ({
  injectScript: injectScriptMock,
}))

type MessageListener = (event: MessageEvent) => void

const ON_KEYS_PAGE = {
  origin: REQUESTY_API_KEYS_ORIGIN,
  pathname: REQUESTY_API_KEYS_PATH,
}

function createWindowFixture(location = ON_KEYS_PAGE) {
  const listeners = new Set<MessageListener>()
  const events: string[] = []
  let onPostMessage: ((message: unknown) => void) | undefined
  const windowFixture = {
    location,
    addEventListener: vi.fn((_type: string, listener: MessageListener) => {
      events.push("listener")
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: MessageListener) => {
      listeners.delete(listener)
    }),
    postMessage: vi.fn((message: unknown) => {
      events.push("request")
      onPostMessage?.(message)
    }),
  }

  return {
    events,
    listeners,
    windowFixture,
    setOnPostMessage(callback: (message: unknown) => void) {
      onPostMessage = callback
    },
    emit(data: unknown, overrides: { origin?: string; source?: unknown } = {}) {
      const event = {
        data,
        origin: REQUESTY_API_KEYS_ORIGIN,
        source: windowFixture,
        ...overrides,
      } as unknown as MessageEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

function response(correlationId: string, overrides: Record<string, unknown>) {
  return {
    channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
    kind: REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
    correlationId,
    ...overrides,
  }
}

function createFixture(options?: {
  location?: { origin: string; pathname: string }
  injectScript?: () => Promise<unknown>
  createCorrelationId?: () => string
}) {
  const window = createWindowFixture(options?.location)
  let correlationSequence = 0
  const injectScript = vi.fn(async () => {
    window.events.push("inject")
    return options?.injectScript?.()
  })
  const timers: Array<{ callback: () => void; delayMs: number }> = []
  const readKey = createRequestyManagementKeyReader({
    window: window.windowFixture as unknown as Window,
    injectScript,
    createCorrelationId:
      options?.createCorrelationId ??
      (() => `reader-correlation-${++correlationSequence}`),
    setTimeout: (callback, delayMs) => {
      const timer = { callback, delayMs }
      timers.push(timer)
      return timer
    },
    clearTimeout: () => {},
  })
  return {
    ...window,
    injectScript,
    readKey,
    timers,
    fireTimeout() {
      const timer = timers.at(-1)
      if (!timer) throw new Error("no scheduled bridge deadline")
      timer.callback()
    },
  }
}

describe("Requesty management key reader", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    { origin: "https://example.invalid", pathname: REQUESTY_API_KEYS_PATH },
    {
      origin: REQUESTY_API_KEYS_ORIGIN,
      pathname: `${REQUESTY_API_KEYS_PATH}/x`,
    },
  ])(
    "reports a wrong page without dispatching a create: %j",
    async (location) => {
      const fixture = createFixture({ location })

      await expect(fixture.readKey("All API Hub")).resolves.toEqual({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.WrongPage,
      })
      expect(fixture.injectScript).not.toHaveBeenCalled()
      expect(fixture.windowFixture.addEventListener).not.toHaveBeenCalled()
      expect(fixture.windowFixture.postMessage).not.toHaveBeenCalled()
    },
  )

  it("dispatches the create only after registering its listener", async () => {
    const fixture = createFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, {
          ok: true,
          keyId: "key-created",
          accessToken: "rqsty-created",
        }),
      )
    })

    await expect(fixture.readKey("All API Hub")).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
      response: expect.objectContaining({ keyId: "key-created" }),
    })
    expect(fixture.events).toEqual(["listener", "inject", "request"])
    expect(fixture.windowFixture.postMessage).toHaveBeenCalledWith(
      {
        channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
        kind: REQUESTY_MANAGEMENT_KEY_REQUEST_KIND,
        correlationId: "reader-correlation-1",
        name: "All API Hub",
      },
      REQUESTY_API_KEYS_ORIGIN,
    )
  })

  it("carries a machine-readable failure response through untouched", async () => {
    const fixture = createFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, { ok: false, reason: "plaintext_missing" }),
      )
    })

    await expect(fixture.readKey("All API Hub")).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
      response: expect.objectContaining({ ok: false }),
    })
  })

  it("ignores responses from another source, origin, or correlation", async () => {
    const fixture = createFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, {
          ok: true,
          keyId: "key-wrong-source",
          accessToken: "rqsty-secret",
        }),
        { source: {} },
      )
      fixture.emit(
        response(correlationId, {
          ok: true,
          keyId: "key-wrong-origin",
          accessToken: "rqsty-secret",
        }),
        { origin: "https://example.invalid" },
      )
      fixture.emit(
        response("wrong-correlation", {
          ok: true,
          keyId: "key-wrong-correlation",
          accessToken: "rqsty-secret",
        }),
      )
      fixture.emit(
        response(correlationId, {
          ok: true,
          keyId: "key-accepted",
          accessToken: "rqsty-created",
        }),
      )
    })

    await expect(fixture.readKey("All API Hub")).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
      response: expect.objectContaining({ keyId: "key-accepted" }),
    })
  })

  it.each([
    ["a success without a key id", { ok: true, accessToken: "rqsty-created" }],
    ["a success without a plaintext", { ok: true, keyId: "key-created" }],
    [
      "a success with an empty plaintext",
      { ok: true, keyId: "k", accessToken: "" },
    ],
    ["a failure without a reason", { ok: false }],
    ["an unknown envelope", { ok: "yes" }],
    ["an array", []],
  ])("never treats %s as a response", async (_label, payload) => {
    const fixture = createFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(response(correlationId, payload as Record<string, unknown>))
    })

    const pending = fixture.readKey("All API Hub")
    fixture.fireTimeout()

    await expect(pending).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
    })
  })

  it("times out the bridge deadline and releases its listener", async () => {
    const fixture = createFixture()

    const pending = fixture.readKey("All API Hub")
    expect(fixture.timers).toHaveLength(1)
    expect(fixture.timers[0]?.delayMs).toBe(20_000)
    fixture.fireTimeout()

    await expect(pending).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
    })
    expect(fixture.listeners).toHaveLength(0)
    expect(fixture.windowFixture.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it("stops waiting when the script injection fails", async () => {
    const fixture = createFixture({
      injectScript: async () => {
        throw new Error("injection failed")
      },
    })

    await expect(fixture.readKey("All API Hub")).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
    })
    expect(fixture.windowFixture.postMessage).not.toHaveBeenCalled()
    expect(fixture.listeners).toHaveLength(0)
  })

  it("caches successful injection and retries a failed one", async () => {
    let attempt = 0
    const fixture = createFixture({
      injectScript: async () => {
        attempt += 1
        if (attempt === 1) throw new Error("injection failed")
      },
    })
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, {
          ok: true,
          keyId: "key-created",
          accessToken: "rqsty-created",
        }),
      )
    })

    await expect(fixture.readKey("All API Hub")).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
    })
    // The failed attempt must not poison the cache for the next read.
    await expect(fixture.readKey("All API Hub")).resolves.toEqual(
      expect.objectContaining({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
      }),
    )
    await expect(fixture.readKey("All API Hub")).resolves.toEqual(
      expect.objectContaining({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
      }),
    )
    expect(fixture.injectScript).toHaveBeenCalledTimes(2)
  })

  it("reports no response when the correlation id cannot be generated", async () => {
    const fixture = createFixture({
      createCorrelationId: () => {
        throw new Error("random source unavailable")
      },
    })

    await expect(fixture.readKey("All API Hub")).resolves.toEqual({
      kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
    })
    expect(fixture.windowFixture.addEventListener).not.toHaveBeenCalled()
  })

  it.each(["", "x".repeat(129)])(
    "reports no response for an unusable correlation id (%j)",
    async (correlationId) => {
      const fixture = createFixture({
        createCorrelationId: () => correlationId,
      })

      await expect(fixture.readKey("All API Hub")).resolves.toEqual({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.NoResponse,
      })
      expect(fixture.windowFixture.addEventListener).not.toHaveBeenCalled()
    },
  )

  it("uses the live window, script injector and random id by default", async () => {
    const fixture = createWindowFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, {
          ok: true,
          keyId: "key-created",
          accessToken: "rqsty-created",
        }),
      )
    })
    vi.stubGlobal("window", fixture.windowFixture)
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.fill(1)
        return bytes
      }),
    })

    await expect(readRequestyManagementKey("All API Hub")).resolves.toEqual(
      expect.objectContaining({
        kind: REQUESTY_MANAGEMENT_KEY_READ_KINDS.Response,
      }),
    )
    expect(injectScriptMock).toHaveBeenCalledWith("/requesty-management-key.js")
    expect(fixture.windowFixture.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "01".repeat(16),
      }),
      REQUESTY_API_KEYS_ORIGIN,
    )
  })
})
