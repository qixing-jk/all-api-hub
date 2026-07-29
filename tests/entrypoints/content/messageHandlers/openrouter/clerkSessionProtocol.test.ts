import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isOpenRouterClerkSessionRequest,
  isOpenRouterClerkSessionResponse,
  normalizeOpenRouterClerkUser,
  OPENROUTER_CLERK_SESSION_ADDITIONAL_READINESS_GRACE_MS,
  OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS,
  OPENROUTER_CLERK_SESSION_CHANNEL,
  OPENROUTER_CLERK_SESSION_CORRELATION_ID_MAX_LENGTH,
  OPENROUTER_CLERK_SESSION_INITIAL_READINESS_TIMEOUT_MS,
  OPENROUTER_CLERK_SESSION_REQUEST_KIND,
  OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
  setupOpenRouterClerkSessionBridge,
} from "~/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol"
import {
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
} from "~/entrypoints/content/messageHandlers/openrouter/managementKeyPage"

const EXPECTED_IDENTITY_FIELD_MAX_LENGTH = 256
const EXPECTED_CORRELATION_ADMISSION_LIMIT = 64

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
  const postMessage = vi.fn()
  const setTimeoutMock = vi.fn((callback: () => void, delay: number) =>
    globalThis.setTimeout(callback, delay),
  )
  const windowFixture = {
    location,
    addEventListener: vi.fn((_type: string, listener: MessageListener) => {
      listeners.add(listener)
    }),
    postMessage,
    setTimeout: setTimeoutMock,
  }

  return {
    windowFixture,
    postMessage,
    setTimeoutMock,
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

function request(correlationId = "clerk-correlation-example") {
  return {
    channel: OPENROUTER_CLERK_SESSION_CHANNEL,
    kind: OPENROUTER_CLERK_SESSION_REQUEST_KIND,
    correlationId,
  }
}

describe("OpenRouter Clerk session protocol", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("normalizes the Clerk user id and applies the display-name priority", () => {
    expect(
      normalizeOpenRouterClerkUser({
        id: "  user_example  ",
        fullName: "  Full Name  ",
        username: "lower-priority",
        primaryEmailAddress: { emailAddress: "email@example.invalid" },
      }),
    ).toEqual({ userId: "user_example", username: "Full Name" })

    expect(
      normalizeOpenRouterClerkUser({
        id: "user_example",
        fullName: "   ",
        username: "  Display Name  ",
        primaryEmailAddress: { emailAddress: "email@example.invalid" },
      }),
    ).toEqual({ userId: "user_example", username: "Display Name" })

    expect(
      normalizeOpenRouterClerkUser({
        id: "user_example",
        username: "",
        primaryEmailAddress: { emailAddress: "  email@example.invalid  " },
      }),
    ).toEqual({
      userId: "user_example",
      username: "email@example.invalid",
    })
  })

  it.each([null, {}, { id: "" }, { id: "   " }, { id: 123 }])(
    "rejects an empty or non-string Clerk id: %j",
    (value) => {
      expect(normalizeOpenRouterClerkUser(value)).toBeUndefined()
    },
  )

  it("ignores non-string display candidates and never exposes extra Clerk fields", () => {
    const identity = normalizeOpenRouterClerkUser({
      id: "user_example",
      fullName: { private: true },
      username: 42,
      primaryEmailAddress: { emailAddress: null },
      sessionToken: "private-session-token",
      organizationMemberships: [{ id: "private-organization" }],
    })

    expect(identity).toEqual({ userId: "user_example", username: "" })
    expect(Object.keys(identity ?? {})).toEqual(["userId", "username"])
    expect(JSON.stringify(identity)).not.toContain("private")
  })

  it("rejects Clerk identities whose normalized id or selected display exceeds the conservative boundary", () => {
    const oversized = "x".repeat(EXPECTED_IDENTITY_FIELD_MAX_LENGTH + 1)
    const paddedOversized = ` ${"x".repeat(EXPECTED_IDENTITY_FIELD_MAX_LENGTH - 1)} `

    expect(
      normalizeOpenRouterClerkUser({ id: oversized, username: "Display" }),
    ).toBeUndefined()
    expect(
      normalizeOpenRouterClerkUser({
        id: paddedOversized,
        username: "Display",
      }),
    ).toBeUndefined()
    expect(
      normalizeOpenRouterClerkUser({
        id: "user_example",
        fullName: oversized,
        username: "shorter-lower-priority-display",
      }),
    ).toBeUndefined()
    expect(
      normalizeOpenRouterClerkUser({
        id: "user_example",
        fullName: paddedOversized,
        username: "shorter-lower-priority-display",
      }),
    ).toBeUndefined()
    expect(
      normalizeOpenRouterClerkUser({
        id: "user_example",
        fullName: "",
        username: oversized,
      }),
    ).toBeUndefined()
    expect(
      normalizeOpenRouterClerkUser({
        id: "user_example",
        primaryEmailAddress: { emailAddress: oversized },
      }),
    ).toBeUndefined()
  })

  it("rejects forged responses with oversized identity fields", () => {
    const oversized = "x".repeat(EXPECTED_IDENTITY_FIELD_MAX_LENGTH + 1)
    const validEnvelope = {
      channel: OPENROUTER_CLERK_SESSION_CHANNEL,
      kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
      correlationId: "forged-response",
    }

    expect(
      isOpenRouterClerkSessionResponse({
        ...validEnvelope,
        identity: { userId: oversized, username: "Display" },
      }),
    ).toBe(false)
    expect(
      isOpenRouterClerkSessionResponse({
        ...validEnvelope,
        identity: { userId: "user_example", username: oversized },
      }),
    ).toBe(false)
  })

  it.each([
    { ...request(), channel: "wrong-channel" },
    { ...request(), kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND },
    { ...request(), correlationId: "" },
    { ...request(), correlationId: "   " },
    {
      ...request(),
      correlationId: "x".repeat(
        OPENROUTER_CLERK_SESSION_CORRELATION_ID_MAX_LENGTH + 1,
      ),
    },
    { ...request(), secret: "must-not-cross-worlds" },
  ])("rejects a malformed or non-request message: %j", (value) => {
    expect(isOpenRouterClerkSessionRequest(value)).toBe(false)
  })

  it("responds once per correlation after Clerk becomes ready", async () => {
    vi.useFakeTimers()
    const fixture = createWindowFixture()
    let clerkUser: unknown

    setupOpenRouterClerkSessionBridge({
      window: fixture.windowFixture as unknown as Window,
      readClerkUser: () => clerkUser,
    })
    fixture.emit(request())
    fixture.emit(request())
    globalThis.setTimeout(() => {
      clerkUser = {
        id: "  user_example  ",
        username: "  Display Name  ",
        sessionToken: "private-session-token",
      }
    }, 60)

    await vi.advanceTimersByTimeAsync(750)

    expect(fixture.postMessage).toHaveBeenCalledTimes(1)
    expect(fixture.postMessage).toHaveBeenCalledWith(
      {
        channel: OPENROUTER_CLERK_SESSION_CHANNEL,
        kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
        correlationId: "clerk-correlation-example",
        identity: { userId: "user_example", username: "Display Name" },
      },
      OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    )
    expect(JSON.stringify(fixture.postMessage.mock.calls)).not.toContain(
      "private-session-token",
    )
  })

  it("adds a named readiness grace period to the original readiness window", () => {
    expect(OPENROUTER_CLERK_SESSION_INITIAL_READINESS_TIMEOUT_MS).toBe(750)
    expect(OPENROUTER_CLERK_SESSION_ADDITIONAL_READINESS_GRACE_MS).toBe(2_250)
    expect(OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS).toBe(
      OPENROUTER_CLERK_SESSION_INITIAL_READINESS_TIMEOUT_MS +
        OPENROUTER_CLERK_SESSION_ADDITIONAL_READINESS_GRACE_MS,
    )
  })

  it("keeps polling when the Clerk id arrives before the display name", async () => {
    vi.useFakeTimers()
    const fixture = createWindowFixture()
    let clerkUser: unknown = { id: "user_example" }

    setupOpenRouterClerkSessionBridge({
      window: fixture.windowFixture as unknown as Window,
      readClerkUser: () => clerkUser,
    })
    fixture.emit(request("late-display-name"))
    globalThis.setTimeout(() => {
      clerkUser = {
        id: "user_example",
        fullName: "Late Display Name",
        sessionToken: "private-session-token",
      }
    }, 1_000)

    await vi.advanceTimersByTimeAsync(1_500)

    expect(fixture.postMessage).toHaveBeenCalledTimes(1)
    expect(fixture.postMessage).toHaveBeenCalledWith(
      {
        channel: OPENROUTER_CLERK_SESSION_CHANNEL,
        kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
        correlationId: "late-display-name",
        identity: {
          userId: "user_example",
          username: "Late Display Name",
        },
      },
      OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    )
    expect(JSON.stringify(fixture.postMessage.mock.calls)).not.toContain(
      "private-session-token",
    )
  })

  it("retains the Clerk id when no display name appears before the extended deadline", async () => {
    vi.useFakeTimers()
    const fixture = createWindowFixture()

    setupOpenRouterClerkSessionBridge({
      window: fixture.windowFixture as unknown as Window,
      readClerkUser: () => ({ id: "user_example" }),
    })
    fixture.emit(request("id-only-deadline"))

    await vi.advanceTimersByTimeAsync(
      OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS - 1,
    )
    expect(fixture.postMessage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(fixture.postMessage).toHaveBeenCalledWith(
      {
        channel: OPENROUTER_CLERK_SESSION_CHANNEL,
        kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
        correlationId: "id-only-deadline",
        identity: { userId: "user_example", username: "" },
      },
      OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    )
  })

  it("sends an identity-less response when Clerk stays unavailable", async () => {
    vi.useFakeTimers()
    const fixture = createWindowFixture()
    setupOpenRouterClerkSessionBridge({
      window: fixture.windowFixture as unknown as Window,
      readClerkUser: () => undefined,
    })

    fixture.emit(request("missing-clerk"))
    await vi.advanceTimersByTimeAsync(
      OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS,
    )

    expect(fixture.postMessage).toHaveBeenCalledWith(
      {
        channel: OPENROUTER_CLERK_SESSION_CHANNEL,
        kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
        correlationId: "missing-clerk",
      },
      OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    )
  })

  it("shares one bounded Clerk readiness poll across normal concurrent requests", async () => {
    vi.useFakeTimers()
    const fixture = createWindowFixture()
    let clerkUser: unknown
    const readClerkUser = vi.fn(() => clerkUser)
    setupOpenRouterClerkSessionBridge({
      window: fixture.windowFixture as unknown as Window,
      readClerkUser,
    })

    const correlations = Array.from(
      { length: 12 },
      (_, index) => `concurrent-${index}`,
    )
    correlations.forEach((correlationId) =>
      fixture.emit(request(correlationId)),
    )
    globalThis.setTimeout(() => {
      clerkUser = { id: "user_example", username: "Display Name" }
    }, 60)

    await vi.advanceTimersByTimeAsync(750)

    expect(readClerkUser).toHaveBeenCalledTimes(3)
    expect(fixture.setTimeoutMock).toHaveBeenCalledTimes(2)
    expect(fixture.postMessage).toHaveBeenCalledTimes(correlations.length)
    expect(
      fixture.postMessage.mock.calls.map(([message]) => message.correlationId),
    ).toEqual(correlations)
  })

  it("caps unique correlations and drops overload without starting more readiness work", async () => {
    const fixture = createWindowFixture()
    const readClerkUser = vi.fn(() => ({
      id: "user_example",
      username: "Display Name",
    }))
    setupOpenRouterClerkSessionBridge({
      window: fixture.windowFixture as unknown as Window,
      readClerkUser,
    })

    const correlations = Array.from(
      { length: EXPECTED_CORRELATION_ADMISSION_LIMIT + 40 },
      (_, index) => `overload-${index}`,
    )
    correlations.forEach((correlationId) =>
      fixture.emit(request(correlationId)),
    )
    await vi.waitFor(() =>
      expect(fixture.postMessage).toHaveBeenCalledTimes(
        EXPECTED_CORRELATION_ADMISSION_LIMIT,
      ),
    )

    expect(readClerkUser).toHaveBeenCalledTimes(1)
    expect(fixture.setTimeoutMock).not.toHaveBeenCalled()

    fixture.emit(request(correlations[0]))
    fixture.emit(request("unique-after-saturation"))
    await Promise.resolve()

    expect(fixture.postMessage).toHaveBeenCalledTimes(
      EXPECTED_CORRELATION_ADMISSION_LIMIT,
    )
    expect(readClerkUser).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      name: "source",
      location: undefined,
      event: { source: {} },
      data: request(),
    },
    {
      name: "origin",
      location: undefined,
      event: { origin: "https://example.invalid" },
      data: request(),
    },
    {
      name: "path",
      location: {
        origin: OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
        pathname: `${OPENROUTER_MANAGEMENT_KEYS_PATH}/nested`,
      },
      event: {},
      data: request(),
    },
    {
      name: "channel",
      location: undefined,
      event: {},
      data: { ...request(), channel: "wrong-channel" },
    },
    {
      name: "kind",
      location: undefined,
      event: {},
      data: { ...request(), kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND },
    },
    {
      name: "correlation",
      location: undefined,
      event: {},
      data: { ...request(), correlationId: "" },
    },
  ])(
    "ignores a request with the wrong $name",
    async ({ location, event, data }) => {
      vi.useFakeTimers()
      const fixture = createWindowFixture(location)
      setupOpenRouterClerkSessionBridge({
        window: fixture.windowFixture as unknown as Window,
        readClerkUser: () => ({ id: "user_example" }),
      })

      fixture.emit(data, event)
      await vi.advanceTimersByTimeAsync(750)

      expect(fixture.postMessage).not.toHaveBeenCalled()
    },
  )

  it("installs the main-world listener idempotently", () => {
    const fixture = createWindowFixture()
    const environment = {
      window: fixture.windowFixture as unknown as Window,
      readClerkUser: () => ({ id: "user_example" }),
    }

    setupOpenRouterClerkSessionBridge(environment)
    setupOpenRouterClerkSessionBridge(environment)

    expect(fixture.windowFixture.addEventListener).toHaveBeenCalledTimes(1)
  })

  it("reads the live Clerk user through the default bridge environment", async () => {
    const fixture = createWindowFixture()
    const liveWindow = Object.assign(fixture.windowFixture, {
      Clerk: {
        user: { id: "user_example", username: "Example User" },
      },
    })
    vi.stubGlobal("window", liveWindow)

    setupOpenRouterClerkSessionBridge()
    fixture.emit(request("default-environment-correlation"))
    await vi.waitFor(() => expect(fixture.postMessage).toHaveBeenCalledOnce())

    expect(fixture.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "default-environment-correlation",
        identity: { userId: "user_example", username: "Example User" },
      }),
      OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
    )
  })
})
