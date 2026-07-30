import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"

const mocks = vi.hoisted(() => ({
  contextRelease: vi.fn(),
  sendTabMessage: vi.fn(),
  pageContract: {
    OPENROUTER_MANAGEMENT_KEYS_ORIGIN: "https://example.invalid",
    OPENROUTER_MANAGEMENT_KEYS_URL:
      "https://example.invalid/settings/management-keys",
    OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH: 96,
    isOpenRouterClerkSessionIdentity: vi.fn(() => false),
  },
}))

vi.mock(
  "~/services/apiAdapters/openrouter/managementKeyPageContract",
  () => mocks.pageContract,
)

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  tempWindowBackgroundRuntime: {
    run: async (_url: string, _options: unknown, task: () => Promise<void>) =>
      task(),
    acquire: vi.fn(
      async (
        _url: string,
        _requestId: string,
        _suppressMinimize: boolean,
        _options: unknown,
        authorizeAtAcquire?: () => Promise<{ kind: string }>,
      ) => {
        const decision = await authorizeAtAcquire?.()
        if (decision?.kind !== "allowed") throw new Error("not authorized")
        return {
          tabId: 123,
          navigate: vi.fn().mockResolvedValue(undefined),
          inspect: vi.fn().mockResolvedValue({
            url: "https://example.invalid/settings/management-keys",
            status: "complete",
          }),
          release: mocks.contextRelease,
        }
      },
    ),
  },
}))

vi.mock("~/utils/browser/browserApi", () => ({
  sendTabMessageWithRetry: mocks.sendTabMessage,
}))

describe("OpenRouter Management Key temp-context port", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.contextRelease.mockResolvedValue(undefined)
    mocks.sendTabMessage.mockImplementation(
      async (_tabId: number, message: Record<string, unknown>) => {
        expect(message.action).toBe(
          RuntimeActionIds.ContentOpenRouterManagementKeyAction,
        )
        return {
          requestId: message.requestId,
          operation: "create",
          mutationState: "not_dispatched",
          attemptOutcome: "logged_out",
          label: (message.operation as { label: string }).label,
        }
      },
    )
  })

  it("releases through the request-bound context handle", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const sendResponse = vi.fn()

    await handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request_example",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request_example",
        mutationState: "not_dispatched",
      }),
    )
    expect(mocks.contextRelease).toHaveBeenCalledTimes(1)
    expect(mocks.contextRelease).toHaveBeenCalledWith({
      forceClose: true,
      reason: "openRouterManagementKeyActionSettled",
    })
    expect(mocks.contextRelease.mock.calls[0]?.[0]).not.toHaveProperty(
      "browserRemovalAttempts",
    )
  })

  it("fails closed when Coordinator authorization is omitted", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~/entrypoints/background/openrouter/managementKeyAction"
    )
    const sendResponse = vi.fn()

    await handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request_without_authorization",
        operation: { kind: "create", label: "extension-request-example" },
      },
      false,
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request_without_authorization",
        mutationState: "not_dispatched",
        attemptOutcome: "failed",
      }),
    )
    expect(mocks.sendTabMessage).not.toHaveBeenCalled()
    expect(mocks.contextRelease).not.toHaveBeenCalled()
  })
})
