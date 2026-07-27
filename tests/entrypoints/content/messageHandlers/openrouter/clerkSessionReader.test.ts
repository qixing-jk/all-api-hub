import { afterEach, describe, expect, it, vi } from "vitest"

import {
  OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS,
  OPENROUTER_CLERK_SESSION_CHANNEL,
  OPENROUTER_CLERK_SESSION_REQUEST_KIND,
  OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
} from "~/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol"
import {
  createOpenRouterClerkSessionReader,
  OPENROUTER_CLERK_SESSION_CROSS_WORLD_MARGIN_MS,
  OPENROUTER_CLERK_SESSION_READER_TIMEOUT_MS,
  readOpenRouterClerkSessionIdentity,
} from "~/entrypoints/content/messageHandlers/openrouter/clerkSessionReader"
import {
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
} from "~/entrypoints/content/messageHandlers/openrouter/managementKeyPage"

type MessageListener = (event: MessageEvent) => void
type MessageEventOverrides = {
  origin?: string
  source?: unknown
}

function createWindowFixture(
  location: { origin: string; pathname: string } = {
    origin: OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    pathname: OPENROUTER_MANAGEMENT_KEYS_PATH,
  },
) {
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
    emit(data: unknown, overrides: MessageEventOverrides = {}) {
      const event = {
        data,
        origin: OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
        source: windowFixture,
        ...overrides,
      } as unknown as MessageEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}

function response(correlationId: string, identity: unknown = undefined) {
  return {
    channel: OPENROUTER_CLERK_SESSION_CHANNEL,
    kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
    correlationId,
    ...(identity === undefined ? {} : { identity }),
  }
}

function createReaderFixture(options?: {
  location?: { origin: string; pathname: string }
  injectScript?: () => Promise<unknown>
}) {
  const window = createWindowFixture(options?.location)
  let correlationSequence = 0
  const injectScript = vi.fn(async () => {
    window.events.push("inject")
    return options?.injectScript?.()
  })
  const readIdentity = createOpenRouterClerkSessionReader({
    window: window.windowFixture as unknown as Window,
    injectScript,
    createCorrelationId: () => `reader-correlation-${++correlationSequence}`,
  })
  return { ...window, injectScript, readIdentity }
}

describe("OpenRouter Clerk session reader", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("exposes the isolated-world reader entrypoint", () => {
    expect(readOpenRouterClerkSessionIdentity).toBeTypeOf("function")
  })

  it("keeps a transport margin beyond the extended bridge deadline", () => {
    expect(OPENROUTER_CLERK_SESSION_CROSS_WORLD_MARGIN_MS).toBe(500)
    expect(OPENROUTER_CLERK_SESSION_READER_TIMEOUT_MS).toBe(
      OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS +
        OPENROUTER_CLERK_SESSION_CROSS_WORLD_MARGIN_MS,
    )
  })

  it("accepts a bridge response that arrives inside the cross-world margin", async () => {
    vi.useFakeTimers()
    const fixture = createReaderFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      globalThis.setTimeout(() => {
        fixture.emit(
          response(correlationId, {
            userId: "user_example",
            username: "Late Display Name",
          }),
        )
      }, OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS + 1)
    })

    const result = fixture.readIdentity()
    await vi.advanceTimersByTimeAsync(
      OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS + 1,
    )

    await expect(result).resolves.toEqual({
      userId: "user_example",
      username: "Late Display Name",
    })
  })

  it.each([
    {
      origin: "https://example.invalid",
      pathname: OPENROUTER_MANAGEMENT_KEYS_PATH,
    },
    {
      origin: OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
      pathname: `${OPENROUTER_MANAGEMENT_KEYS_PATH}/nested`,
    },
  ])(
    "returns early outside the exact management route: %j",
    async (location) => {
      const fixture = createReaderFixture({ location })

      await expect(fixture.readIdentity()).resolves.toBeUndefined()
      expect(fixture.injectScript).not.toHaveBeenCalled()
      expect(fixture.windowFixture.addEventListener).not.toHaveBeenCalled()
    },
  )

  it("registers the response listener before injection and request dispatch", async () => {
    const fixture = createReaderFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, {
          userId: "user_example",
          username: "Display Name",
        }),
      )
    })

    await expect(fixture.readIdentity()).resolves.toEqual({
      userId: "user_example",
      username: "Display Name",
    })
    expect(fixture.events).toEqual(["listener", "inject", "request"])
    expect(fixture.windowFixture.postMessage).toHaveBeenCalledWith(
      {
        channel: OPENROUTER_CLERK_SESSION_CHANNEL,
        kind: OPENROUTER_CLERK_SESSION_REQUEST_KIND,
        correlationId: "reader-correlation-1",
      },
      OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    )
  })

  it("caches successful injection across reads", async () => {
    const fixture = createReaderFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, { userId: "user_example", username: "" }),
      )
    })

    await expect(fixture.readIdentity()).resolves.toEqual({
      userId: "user_example",
      username: "",
    })
    await expect(fixture.readIdentity()).resolves.toEqual({
      userId: "user_example",
      username: "",
    })

    expect(fixture.injectScript).toHaveBeenCalledTimes(1)
    expect(fixture.windowFixture.postMessage).toHaveBeenCalledTimes(2)
  })

  it("allows injection failure to retry without logging payloads", async () => {
    const consoleSpies = [
      vi.spyOn(console, "debug").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ]
    let attempt = 0
    const fixture = createReaderFixture({
      injectScript: async () => {
        attempt += 1
        if (attempt === 1) throw new Error("private injection failure")
      },
    })
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(
        response(correlationId, { userId: "user_example", username: "" }),
      )
    })

    await expect(fixture.readIdentity()).resolves.toBeUndefined()
    await expect(fixture.readIdentity()).resolves.toEqual({
      userId: "user_example",
      username: "",
    })

    expect(fixture.injectScript).toHaveBeenCalledTimes(2)
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled())
  })

  it("returns undefined when random correlation generation fails", async () => {
    const window = createWindowFixture()
    const injectScript = vi.fn().mockResolvedValue(undefined)
    const readIdentity = createOpenRouterClerkSessionReader({
      window: window.windowFixture as unknown as Window,
      injectScript,
      createCorrelationId: () => {
        throw new Error("random source unavailable")
      },
    })

    await expect(readIdentity()).resolves.toBeUndefined()
    expect(injectScript).not.toHaveBeenCalled()
    expect(window.windowFixture.addEventListener).not.toHaveBeenCalled()
  })

  it("ignores responses with the wrong source, origin, or correlation", async () => {
    const fixture = createReaderFixture()
    fixture.setOnPostMessage((message) => {
      const correlationId = (message as { correlationId: string }).correlationId
      fixture.emit(response(correlationId), { source: {} })
      fixture.emit(response(correlationId), {
        origin: "https://example.invalid",
      })
      fixture.emit(response("wrong-correlation"))
      fixture.emit(
        response(correlationId, {
          userId: "user_example",
          username: "Display Name",
        }),
      )
    })

    await expect(fixture.readIdentity()).resolves.toEqual({
      userId: "user_example",
      username: "Display Name",
    })
  })

  it.each([
    response("reader-correlation-1", {
      userId: "",
      username: "Display Name",
    }),
    response("reader-correlation-1", {
      userId: "user_example",
      username: 42,
    }),
    {
      ...response("reader-correlation-1", {
        userId: "user_example",
        username: "Display Name",
      }),
      secret: "must-not-cross-worlds",
    },
  ])(
    "returns undefined for a malformed matching response: %j",
    async (value) => {
      const fixture = createReaderFixture()
      fixture.setOnPostMessage(() => fixture.emit(value))

      await expect(fixture.readIdentity()).resolves.toBeUndefined()
      expect(fixture.listeners).toHaveLength(0)
    },
  )

  it("times out and cleans up its listener", async () => {
    vi.useFakeTimers()
    const fixture = createReaderFixture()

    const result = fixture.readIdentity()
    await vi.advanceTimersByTimeAsync(
      OPENROUTER_CLERK_SESSION_READER_TIMEOUT_MS,
    )

    await expect(result).resolves.toBeUndefined()
    expect(fixture.listeners).toHaveLength(0)
    expect(fixture.windowFixture.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
