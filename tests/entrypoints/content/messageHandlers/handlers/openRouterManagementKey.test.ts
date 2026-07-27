import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { handleOpenRouterManagementKeyAction } from "~/entrypoints/content/messageHandlers/handlers/openRouterManagementKey"

const {
  pageActionMock,
  readOpenRouterClerkSessionIdentityMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  pageActionMock: vi.fn(),
  readOpenRouterClerkSessionIdentityMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock(
  "~/entrypoints/content/messageHandlers/openrouter/managementKeyPage",
  () => ({
    performOpenRouterManagementKeyPageAction: pageActionMock,
  }),
)

vi.mock(
  "~/entrypoints/content/messageHandlers/openrouter/clerkSessionReader",
  () => ({
    readOpenRouterClerkSessionIdentity: readOpenRouterClerkSessionIdentityMock,
  }),
)

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, sendRuntimeMessage: sendRuntimeMessageMock }
})

describe("OpenRouter Management Key content handler", () => {
  beforeEach(() => {
    pageActionMock.mockReset()
    readOpenRouterClerkSessionIdentityMock.mockReset()
    sendRuntimeMessageMock.mockReset()
    readOpenRouterClerkSessionIdentityMock.mockResolvedValue(undefined)
    sendRuntimeMessageMock.mockResolvedValue({ marked: true })
  })

  it("reads Clerk identity concurrently and attaches it only after create succeeds", async () => {
    let resolvePage: ((value: unknown) => void) | undefined
    let resolveIdentity:
      | ((value: { userId: string; username: string }) => void)
      | undefined
    pageActionMock.mockImplementation(
      () => new Promise((resolve) => (resolvePage = resolve)),
    )
    readOpenRouterClerkSessionIdentityMock.mockImplementation(
      () => new Promise((resolve) => (resolveIdentity = resolve)),
    )
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-with-identity",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    await vi.waitFor(() => {
      expect(pageActionMock).toHaveBeenCalledTimes(1)
      expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(1)
    })
    expect(sendResponse).not.toHaveBeenCalled()

    resolveIdentity?.({
      userId: "user_example",
      username: "Example User",
    })
    resolvePage?.({
      requestId: "request-with-identity",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        requestId: "request-with-identity",
        operation: "create",
        mutationState: "created",
        attemptOutcome: "success",
        accessToken: "sk-or-test-secret",
        label: "extension-request-example",
        sessionIdentity: {
          userId: "user_example",
          username: "Example User",
        },
      }),
    )
    expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(1)
  })

  it("keeps a successful create when the Clerk reader rejects", async () => {
    readOpenRouterClerkSessionIdentityMock.mockRejectedValue(
      new Error("reader unavailable"),
    )
    pageActionMock.mockResolvedValue({
      requestId: "request-reader-failure",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-reader-failure",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))
    expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(2)
    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-reader-failure",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })
  })

  it("performs one fresh Clerk read after an early empty result and attaches the retry identity", async () => {
    readOpenRouterClerkSessionIdentityMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        userId: "user_retry",
        username: "Retry User",
      })
    pageActionMock.mockResolvedValue({
      requestId: "request-fresh-reader",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-fresh-reader",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))
    expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(2)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "created",
        sessionIdentity: {
          userId: "user_retry",
          username: "Retry User",
        },
      }),
    )
  })

  it("returns created after the fresh Clerk read reaches its existing bound", async () => {
    vi.useFakeTimers()
    try {
      readOpenRouterClerkSessionIdentityMock
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(undefined), 100)
            }),
        )
      pageActionMock.mockResolvedValue({
        requestId: "request-bounded-reader",
        operation: "create",
        mutationState: "created",
        attemptOutcome: "success",
        accessToken: "sk-or-test-secret",
        label: "extension-request-example",
      })
      const sendResponse = vi.fn()

      handleOpenRouterManagementKeyAction(
        {
          requestId: "request-bounded-reader",
          operation: { kind: "create", label: "extension-request-example" },
        },
        sendResponse,
      )
      await vi.advanceTimersByTimeAsync(100)

      expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(2)
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "request-bounded-reader",
          mutationState: "created",
        }),
      )
      expect(sendResponse.mock.calls[0]?.[0]).not.toHaveProperty(
        "sessionIdentity",
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not attach Clerk identity to an unconfirmed create", async () => {
    readOpenRouterClerkSessionIdentityMock.mockResolvedValue(undefined)
    pageActionMock.mockResolvedValue({
      requestId: "request-unconfirmed",
      operation: "create",
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "failed",
      label: "extension-request-example",
    })
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-unconfirmed",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))
    expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(1)
    expect(sendResponse.mock.calls[0]?.[0]).not.toHaveProperty(
      "sessionIdentity",
    )
  })

  it("uses Clerk identity as positive evidence against a logged-out classification", async () => {
    let resolvePage: ((value: unknown) => void) | undefined
    let resolveIdentity:
      | ((value: { userId: string; username: string }) => void)
      | undefined
    pageActionMock.mockImplementation(
      () => new Promise((resolve) => (resolvePage = resolve)),
    )
    readOpenRouterClerkSessionIdentityMock.mockImplementation(
      () => new Promise((resolve) => (resolveIdentity = resolve)),
    )
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-clerk-authenticated",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    await vi.waitFor(() => {
      expect(pageActionMock).toHaveBeenCalledTimes(1)
      expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(1)
    })
    resolvePage?.({
      requestId: "request-clerk-authenticated",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "logged_out",
      label: "extension-request-example",
    })
    expect(sendResponse).not.toHaveBeenCalled()
    resolveIdentity?.({
      userId: "user_example",
      username: "Example User",
    })

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))
    expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-clerk-authenticated",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "timeout",
      label: "extension-request-example",
    })
    expect(sendResponse.mock.calls[0]?.[0]).not.toHaveProperty(
      "sessionIdentity",
    )
  })

  it("preserves logged out when Clerk has no authenticated identity", async () => {
    pageActionMock.mockResolvedValue({
      requestId: "request-no-clerk-identity",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "logged_out",
      label: "extension-request-example",
    })
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-no-clerk-identity",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "logged_out" }),
    )
  })

  it("reports dispatch by opaque request ID and sends one normalized result", async () => {
    pageActionMock.mockImplementation(
      async (request, _environment, onDispatch) => {
        await onDispatch()
        return {
          requestId: request.requestId,
          operation: "create",
          mutationState: "created",
          attemptOutcome: "success",
          accessToken: "sk-or-test-secret",
          label: request.operation.label,
        }
      },
    )
    const sendResponse = vi.fn()

    expect(
      handleOpenRouterManagementKeyAction(
        {
          requestId: "request-example",
          operation: { kind: "create", label: "extension-request-example" },
        },
        sendResponse,
      ),
    ).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowOpenRouterManagementKeyDispatched,
      requestId: "request-example",
    })
  })

  it("normalizes thrown page failures without exposing the thrown message", async () => {
    pageActionMock.mockRejectedValue(new Error("private backend detail"))
    const sendResponse = vi.fn()
    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-failure",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))

    expect(readOpenRouterClerkSessionIdentityMock).toHaveBeenCalledTimes(1)

    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-failure",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "failed",
      label: "extension-request-example",
    })
    expect(JSON.stringify(sendResponse.mock.calls)).not.toContain(
      "private backend detail",
    )
  })

  it("keeps a thrown page failure unconfirmed after dispatch", async () => {
    pageActionMock.mockImplementation(
      async (_request, _environment, onDispatch) => {
        await onDispatch()
        throw new Error("private backend detail")
      },
    )
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-dispatched-failure",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))

    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-dispatched-failure",
      operation: "create",
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "failed",
      label: "extension-request-example",
    })
    expect(JSON.stringify(sendResponse.mock.calls)).not.toContain(
      "private backend detail",
    )
  })

  it("returns a rejected dispatch marker to the page action", async () => {
    sendRuntimeMessageMock.mockResolvedValue({
      requestId: "request-marker-rejected",
      marked: false,
    })
    pageActionMock.mockImplementation(
      async (request, _environment, onDispatch) => {
        const marked = await onDispatch()
        return {
          requestId: request.requestId,
          operation: "create",
          mutationState: "not_dispatched",
          attemptOutcome: marked ? "failed" : "cancelled_before_create",
          label: request.operation.label,
        }
      },
    )
    const sendResponse = vi.fn()

    handleOpenRouterManagementKeyAction(
      {
        requestId: "request-marker-rejected",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "cancelled_before_create" }),
    )
  })

  it.each([
    { requestId: "request-missing-operation" },
    { requestId: "request-unknown-operation", operation: { kind: "unknown" } },
    {
      requestId: "request-invalid-create",
      operation: { kind: "create", label: 42 },
    },
  ])(
    "rejects malformed untrusted operations and still responds",
    async (request) => {
      const sendResponse = vi.fn()

      expect(
        handleOpenRouterManagementKeyAction(request as any, sendResponse),
      ).toBe(true)
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1))

      expect(pageActionMock).not.toHaveBeenCalled()
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: request.requestId,
          operation: "create",
          mutationState: "not_dispatched",
          attemptOutcome: "failed",
        }),
      )
    },
  )
})
