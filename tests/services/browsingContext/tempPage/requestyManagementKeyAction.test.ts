import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  REQUESTY_PROVISIONING_STATES,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import { PROTECTION_BYPASS_DENIED_REASONS } from "~/services/protectionBypass/contracts"

const mocks = vi.hoisted(() => ({
  contextRelease: vi.fn(),
  sendTabMessage: vi.fn(),
  acquire: vi.fn(),
  run: vi.fn(),
}))

vi.mock("~/services/browsingContext/tempPage/runtime", () => ({
  tempWindowBackgroundRuntime: {
    run: mocks.run,
    acquire: mocks.acquire,
  },
}))

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendTabMessageWithRetry: mocks.sendTabMessage,
}))

const KEYS_URL = "https://app.requesty.ai/api-keys"

const { handleTempWindowRequestyManagementKeyAction } = await import(
  "~/services/browsingContext/tempPage/requestyManagementKeyAction"
)

const request = {
  requestId: "request-1",
  operation: { kind: "create" as const, name: "All API Hub" },
}

/** Builds a temp context whose inspected tab sits on the keys page. */
function contextAt(
  url: string | null = KEYS_URL,
  overrides: { navigateFails?: boolean } = {},
) {
  return {
    tabId: 42,
    navigate: overrides.navigateFails
      ? vi.fn().mockRejectedValue(new Error("navigation failed"))
      : vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue(url === null ? null : { url }),
    release: mocks.contextRelease,
  }
}

/** Runs the action with an authorized acquisition and returns its response. */
async function runAction(
  options: {
    request?: unknown
    context?: ReturnType<typeof contextAt>
    acquireRejects?: boolean
    runRejects?: boolean
    pageMessage?: unknown
  } = {},
) {
  const context = options.context ?? contextAt()
  mocks.acquire.mockImplementation(
    async (
      _url: string,
      _requestId: string,
      _suppressMinimize: boolean,
      _options: unknown,
      authorizeAtAcquire?: () => Promise<{ kind: string }>,
    ) => {
      // Mirror the real runtime: an unauthorized acquisition never yields a
      // context, so a denied bypass cannot reach the page.
      const decision = await authorizeAtAcquire?.()
      if (options.acquireRejects || decision?.kind !== "allowed") {
        throw new Error("acquisition denied")
      }
      return context
    },
  )
  mocks.run.mockImplementation(
    async (_url: string, _options: unknown, task: () => Promise<void>) => {
      if (options.runRejects) throw new Error("scheduler rejected the task")
      return task()
    },
  )
  if ("pageMessage" in options) {
    mocks.sendTabMessage.mockImplementation(async () => options.pageMessage)
  }
  const sendResponse = vi.fn()
  await handleTempWindowRequestyManagementKeyAction(
    (options.request ?? request) as typeof request,
    false,
    sendResponse,
    async () => ({ kind: "allowed" }) as never,
  )
  return sendResponse
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.contextRelease.mockResolvedValue(undefined)
  // Default page answer: the provider returned a created key.
  mocks.sendTabMessage.mockImplementation(
    async (_tabId: number, message: Record<string, unknown>) => ({
      requestId: message.requestId,
      operation: "create",
      state: REQUESTY_PROVISIONING_STATES.Created,
      accessToken: "rqsty-created",
      keyId: "key-created",
      name: "All API Hub",
    }),
  )
})

describe("Requesty management-key temp-page action", () => {
  it("returns the page result and releases the context exactly once", async () => {
    const sendResponse = await runAction()

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
      requestId: "request-1",
      operation: "create",
      state: REQUESTY_PROVISIONING_STATES.Created,
      accessToken: "rqsty-created",
      keyId: "key-created",
      name: "All API Hub",
    })
    expect(mocks.sendTabMessage).toHaveBeenCalledWith(
      42,
      {
        action: RuntimeActionIds.ContentRequestyManagementKeyAction,
        requestId: "request-1",
        operation: request.operation,
      },
      { maxAttempts: 1 },
    )
    expect(mocks.contextRelease).toHaveBeenCalledExactlyOnceWith({
      forceClose: true,
      reason: "requestyManagementKeyActionSettled",
    })
  })

  it("fails closed when the Coordinator authorization is omitted", async () => {
    const sendResponse = vi.fn()

    await handleTempWindowRequestyManagementKeyAction(
      request,
      false,
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      }),
    )
    // The default authorization denies before any context exists.
    expect(mocks.acquire).toHaveBeenCalledTimes(1)
    expect(mocks.sendTabMessage).not.toHaveBeenCalled()
    expect(mocks.contextRelease).not.toHaveBeenCalled()
  })

  it.each([
    ["an empty request id", { ...request, requestId: "" }],
    ["a missing operation", { requestId: "request-1" }],
    [
      "a non-create operation",
      { requestId: "request-1", operation: { kind: "delete", name: "x" } },
    ],
    [
      "a blank key name",
      { requestId: "request-1", operation: { kind: "create", name: "   " } },
    ],
    [
      "a non-string name",
      { requestId: "request-1", operation: { kind: "create", name: 7 } },
    ],
  ])("rejects %s before scheduling any work", async (_label, invalid) => {
    const sendResponse = await runAction({ request: invalid })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.CreateRejected,
      }),
    )
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.sendTabMessage).not.toHaveBeenCalled()
  })

  it("rejects a duplicate request id while the first is still running", async () => {
    let releaseFirst: (() => void) | undefined
    mocks.acquire.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve(contextAt())
        }),
    )
    mocks.run.mockImplementation(
      async (_url: string, _options: unknown, task: () => Promise<void>) =>
        task(),
    )
    const firstResponse = vi.fn()
    const secondResponse = vi.fn()
    const authorize = async () => ({ kind: "allowed" }) as never

    const first = handleTempWindowRequestyManagementKeyAction(
      request,
      false,
      firstResponse,
      authorize,
    )
    await vi.waitFor(() => expect(mocks.acquire).toHaveBeenCalledTimes(1))

    await handleTempWindowRequestyManagementKeyAction(
      request,
      false,
      secondResponse,
      authorize,
    )
    expect(secondResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.CreateRejected,
      }),
    )

    releaseFirst?.()
    await first
    expect(firstResponse).toHaveBeenCalledTimes(1)
  })

  it("keeps a page-answered pre-dispatch failure as not dispatched", async () => {
    // Signed out: the page reader refuses the wrong route and answers without
    // dispatching, so the create must not be reported as possibly applied.
    const sendResponse = await runAction({
      pageMessage: {
        requestId: "request-1",
        operation: "create",
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
        name: "All API Hub",
      },
    })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      }),
    )
    expect(mocks.contextRelease).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch when the context lands outside the console", async () => {
    const sendResponse = await runAction({
      context: contextAt("https://example.invalid/api-keys"),
    })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      }),
    )
    expect(mocks.sendTabMessage).not.toHaveBeenCalled()
    expect(mocks.contextRelease).toHaveBeenCalledTimes(1)
  })

  it("treats a context without a readable tab as not dispatched", async () => {
    const sendResponse = await runAction({ context: contextAt(null) })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      }),
    )
  })

  it.each([
    ["a missing page answer", undefined],
    ["a non-object page answer", "created"],
    [
      "a page answer for another request",
      {
        requestId: "other",
        operation: "create",
        state: REQUESTY_PROVISIONING_STATES.Created,
        accessToken: "rqsty-created",
        keyId: "key-created",
        name: "All API Hub",
      },
    ],
    [
      "a page answer for another operation",
      {
        requestId: "request-1",
        operation: "delete",
        state: REQUESTY_PROVISIONING_STATES.Created,
        accessToken: "rqsty-created",
        keyId: "key-created",
        name: "All API Hub",
      },
    ],
  ])("reports %s as possibly dispatched", async (_label, pageMessage) => {
    const sendResponse = await runAction({ pageMessage })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
      }),
    )
    expect(mocks.contextRelease).toHaveBeenCalledTimes(1)
  })

  it("reports a transport failure before the page answered as not dispatched", async () => {
    const sendResponse = await runAction({
      acquireRejects: true,
    })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.NotDispatched,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      }),
    )
    expect(mocks.contextRelease).not.toHaveBeenCalled()
    expect(mocks.sendTabMessage).not.toHaveBeenCalled()
  })

  it("reports a failure while the page answered as possibly dispatched", async () => {
    mocks.acquire.mockImplementation(async () => contextAt())
    mocks.run.mockImplementation(
      async (_url: string, _options: unknown, task: () => Promise<void>) =>
        task(),
    )
    // The message is delivered, then the deadline rejects the race.
    mocks.sendTabMessage.mockImplementation(() => new Promise(() => {}))
    const sendResponse = vi.fn()

    await handleTempWindowRequestyManagementKeyAction(
      request,
      false,
      sendResponse,
      async () => ({ kind: "allowed" }) as never,
    )

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
      }),
    )
  }, 40_000)

  it("reports a scheduler rejection as possibly dispatched", async () => {
    const sendResponse = await runAction({ runRejects: true })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        state: REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
      }),
    )
  })

  it("does not release a context that was never acquired", async () => {
    await runAction({ runRejects: true })

    expect(mocks.contextRelease).not.toHaveBeenCalled()
  })

  it("keeps the deny reason machine-readable when authorization denies", async () => {
    mocks.acquire.mockResolvedValue(contextAt())
    mocks.run.mockImplementation(
      async (_url: string, _options: unknown, task: () => Promise<void>) =>
        task(),
    )
    const sendResponse = vi.fn()

    await handleTempWindowRequestyManagementKeyAction(
      { ...request, requestId: "request-denied" },
      false,
      sendResponse,
      async () =>
        ({
          kind: "denied",
          reason: PROTECTION_BYPASS_DENIED_REASONS.MissingExecution,
        }) as never,
    )

    expect(sendResponse).toHaveBeenCalledTimes(1)
  })

  it("normalizes the echoed key name in a failure envelope", async () => {
    const sendResponse = await runAction({
      request: {
        requestId: "request-1",
        operation: { kind: "create", name: "  Connection   key  " },
      },
      acquireRejects: true,
    })

    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "Connection key" }),
    )
  })
})
