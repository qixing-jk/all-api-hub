import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS,
  OPENROUTER_MANAGEMENT_KEY_TRANSPORT_MARGIN_MS,
  OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS,
} from "~/constants/openRouterBootstrap"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH } from "~/services/apiAdapters/openrouter/managementKeySecret"

const originalBrowser = (globalThis as any).browser
const EXPECTED_TRACKED_OPENROUTER_ACTION_IDS = 128

async function settleReadiness() {
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(500)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(500)
}

describe("OpenRouter Management Key background action", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>
  let createTabMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>
  let applyTempWindowDownloadBlockRuleMock: ReturnType<typeof vi.fn>
  let removeTempWindowDownloadBlockRuleMock: ReturnType<typeof vi.fn>
  let updateTabMock: ReturnType<typeof vi.fn>

  const mockPageResponder = (
    onAction: (message: any) => unknown | Promise<unknown>,
  ) =>
    sendMessageMock.mockImplementation(async (_tabId: number, message: any) => {
      if (
        message.action === RuntimeActionIds.ContentCheckCapGuard ||
        message.action === RuntimeActionIds.ContentCheckCloudflareGuard
      ) {
        return { success: true, passed: true }
      }
      if (message.action === RuntimeActionIds.ContentShowShieldBypassUi) {
        return undefined
      }
      if (
        message.action === RuntimeActionIds.ContentOpenRouterManagementKeyAction
      ) {
        return await onAction(message)
      }
      throw new Error(`Unexpected action: ${message.action}`)
    })

  const recordDispatchOutcomes = (
    markDispatched: (requestId: string) => boolean,
  ) => {
    const outcomes: boolean[] = []
    return {
      outcomes,
      mark: (requestId: string) => {
        outcomes.push(markDispatched(requestId))
      },
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    createTabMock = vi.fn().mockResolvedValue({ id: 901 })
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)
    applyTempWindowDownloadBlockRuleMock = vi.fn().mockResolvedValue(2901)
    removeTempWindowDownloadBlockRuleMock = vi.fn().mockResolvedValue(undefined)
    updateTabMock = vi.fn().mockResolvedValue(undefined)
    sendMessageMock = vi.fn()
    mockPageResponder((message) => ({
      requestId: message.requestId,
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: message.operation.label,
    }))
    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      tabs: {
        get: vi.fn().mockResolvedValue({
          status: "complete",
          url: "https://openrouter.ai/settings/management-keys",
        }),
        query: vi.fn().mockResolvedValue([]),
        remove: removeTabOrWindowMock,
        update: updateTabMock,
        sendMessage: sendMessageMock,
      },
      windows: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    }
    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        createTab: createTabMock,
        createWindow: vi.fn(),
        hasWindowsAPI: vi.fn(() => true),
        onTabRemoved: vi.fn(() => () => {}),
        onWindowRemoved: vi.fn(() => () => {}),
        removeTabOrWindow: removeTabOrWindowMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: { tempWindowFallback: { tempContextMode: "tab" } },
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          tempWindowFallback: { tempContextMode: "tab" },
        }),
      },
    }))
    vi.doMock("~/utils/browser/dnrCookieInjector", () => ({
      applyTempWindowCookieRule: vi.fn().mockResolvedValue(null),
      removeTempWindowCookieRule: vi.fn().mockResolvedValue(undefined),
      applyTempWindowDownloadBlockRule: applyTempWindowDownloadBlockRuleMock,
      removeTempWindowDownloadBlockRule: removeTempWindowDownloadBlockRuleMock,
    }))
    vi.doMock("~/utils/browser/firefoxTempWindowDownloadBlocker", () => ({
      applyFirefoxTempWindowDownloadBlockRule: vi.fn().mockResolvedValue(null),
      removeFirefoxTempWindowDownloadBlockRule: vi
        .fn()
        .mockResolvedValue(undefined),
    }))
    vi.doMock("~/utils/i18n/core", () => ({ t: vi.fn((key: string) => key) }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("opens a new OpenRouter context directly on the Management Keys page", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const response = vi.fn()

    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-direct-management-keys",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await settleReadiness()
    await pending

    expect(updateTabMock.mock.calls[0]).toEqual([
      901,
      { url: "https://openrouter.ai/settings/management-keys" },
    ])
    expect(updateTabMock).not.toHaveBeenCalledWith(901, {
      url: "https://openrouter.ai",
    })
  })

  it("uses only the dedicated content action and settles create once", async () => {
    const {
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-example",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await vi.waitFor(() => expect(resolvePage).toBeTypeOf("function"))
    expect(
      markTempWindowOpenRouterManagementKeyDispatched("request-example"),
    ).toBe(true)
    resolvePage?.({
      requestId: "request-example",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })
    await pending

    expect(sendMessageMock).toHaveBeenCalledWith(
      901,
      expect.objectContaining({
        action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
        requestId: "request-example",
      }),
    )
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      901,
      expect.objectContaining({
        action: RuntimeActionIds.ContentTriggerCheckinPageAction,
      }),
    )
    expect(sendResponse).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "created",
        accessToken: "sk-or-test-secret",
      }),
    )
  })

  it("rejects caller-controlled action fields as a request failure", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const sendResponse = vi.fn()
    await handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-origin-override",
        operation: { kind: "create", label: "extension-request-example" },
        originUrl: "https://example.invalid",
      } as any,
      sendResponse,
    )
    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "not_dispatched",
        attemptOutcome: "failed",
      }),
    )
  })

  it("cancels before dispatch without sending the content mutation", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const sendResponse = vi.fn()
    expect(
      cancelTempWindowOpenRouterManagementKeyAction("request-cancel-before"),
    ).toEqual({
      requestId: "request-cancel-before",
      certainty: "unknown",
      cancellationAccepted: true,
    })
    expect(
      cancelTempWindowOpenRouterManagementKeyAction("request-cancel-before"),
    ).toEqual({
      requestId: "request-cancel-before",
      certainty: "unknown",
      cancellationAccepted: true,
    })
    await handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-before",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "not_dispatched",
        attemptOutcome: "cancelled_before_create",
      }),
    )
    expect(
      cancelTempWindowOpenRouterManagementKeyAction("request-cancel-before"),
    ).toEqual({
      requestId: "request-cancel-before",
      certainty: "known",
      cancellationAccepted: false,
      mutationState: "not_dispatched",
    })
  })

  it("bounds pre-cancelled request IDs and admits the oldest after eviction", async () => {
    const action = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )

    for (
      let index = 0;
      index <= EXPECTED_TRACKED_OPENROUTER_ACTION_IDS;
      index += 1
    ) {
      expect(
        action.cancelTempWindowOpenRouterManagementKeyAction(
          `request-pre-cancel-bound-${index}`,
        ),
      ).toMatchObject({ certainty: "unknown", cancellationAccepted: true })
    }

    const oldestResponse = vi.fn()
    const secondOldestResponse = vi.fn()
    const newestResponse = vi.fn()
    const oldest = action.handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-pre-cancel-bound-0",
        operation: { kind: "create", label: "oldest-request" },
      },
      oldestResponse,
    )
    await settleReadiness()
    await oldest
    const secondOldest = action.handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-pre-cancel-bound-1",
        operation: { kind: "create", label: "second-oldest-request" },
      },
      secondOldestResponse,
    )
    await secondOldest
    const newest = action.handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: `request-pre-cancel-bound-${EXPECTED_TRACKED_OPENROUTER_ACTION_IDS}`,
        operation: { kind: "create", label: "newest-request" },
      },
      newestResponse,
    )
    await newest

    expect(oldestResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "not_dispatched",
        attemptOutcome: "failed",
      }),
    )
    expect(secondOldestResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "not_dispatched",
        attemptOutcome: "cancelled_before_create",
      }),
    )
    expect(newestResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "not_dispatched",
        attemptOutcome: "cancelled_before_create",
      }),
    )
  })

  it("normalizes malformed action requests before scheduling", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const response = vi.fn()

    await handleTempWindowOpenRouterManagementKeyAction(
      { requestId: "request-malformed-action" } as any,
      response,
    )

    expect(response).toHaveBeenCalledWith({
      requestId: "request-malformed-action",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "failed",
      label: "",
    })
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it("omits cancellation acceptance and mutation evidence for malformed IDs", async () => {
    const { cancelTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )

    expect(cancelTempWindowOpenRouterManagementKeyAction("")).toEqual({
      requestId: "",
      certainty: "unknown",
    })
  })

  it("keeps a dispatched request pending through cancel and settles created once", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-after-dispatch",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await vi.waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith(
        901,
        expect.objectContaining({
          action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
        }),
      ),
    )
    expect(
      markTempWindowOpenRouterManagementKeyDispatched(
        "request-cancel-after-dispatch",
      ),
    ).toBe(true)
    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-after-dispatch",
      ),
    ).toEqual({
      requestId: "request-cancel-after-dispatch",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "dispatched_unconfirmed",
      label: "extension-request-example",
    })
    expect(sendResponse).not.toHaveBeenCalled()
    resolvePage?.({
      requestId: "request-cancel-after-dispatch",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })
    await pending
    expect(sendResponse).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptOutcome: "cancelled_after_create",
        accessToken: "sk-or-test-secret",
      }),
    )
    expect(
      markTempWindowOpenRouterManagementKeyDispatched(
        "request-cancel-after-dispatch",
      ),
    ).toBe(false)
    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-after-dispatch",
      ),
    ).toEqual({
      requestId: "request-cancel-after-dispatch",
      certainty: "known",
      cancellationAccepted: false,
      mutationState: "created",
      label: "extension-request-example",
    })
  })

  it("maps a post-dispatch deadline to dispatched_unconfirmed without a secret", async () => {
    const {
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    mockPageResponder(() => new Promise(() => {}))
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-timeout-after-dispatch",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await vi.waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith(
        901,
        expect.objectContaining({
          action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
        }),
      ),
    )
    expect(
      markTempWindowOpenRouterManagementKeyDispatched(
        "request-timeout-after-dispatch",
      ),
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(
      OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS,
    )
    await pending
    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-timeout-after-dispatch",
      operation: "create",
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "timeout",
      label: "extension-request-example",
    })
  })

  it("keeps the transport open through the page classification deadline", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-page-deadline-result",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await vi.waitFor(() => expect(resolvePage).toBeTypeOf("function"))

    expect(OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS).toBe(
      OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS +
        OPENROUTER_MANAGEMENT_KEY_TRANSPORT_MARGIN_MS,
    )
    await vi.advanceTimersByTimeAsync(OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS)
    expect(sendResponse).not.toHaveBeenCalled()

    resolvePage?.({
      requestId: "request-page-deadline-result",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "logged_out",
      label: "extension-request-example",
    })
    await pending
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "logged_out" }),
    )
  })

  it("does not mutate when cancellation wins during context acquisition", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolveTab: ((value: { id: number }) => void) | undefined
    createTabMock.mockImplementation(
      () => new Promise((resolve) => (resolveTab = resolve)),
    )
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-during-acquire",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await vi.waitFor(() => expect(createTabMock).toHaveBeenCalled())
    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-during-acquire",
      ),
    ).toEqual({
      requestId: "request-cancel-during-acquire",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "not_dispatched",
    })
    resolveTab?.({ id: 902 })
    await settleReadiness()
    await pending

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "cancelled_before_create" }),
    )
    expect(removeTabOrWindowMock).toHaveBeenCalled()
  })

  it("does not mutate when cancellation wins during navigation", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolveNavigation: (() => void) | undefined
    updateTabMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolveNavigation = resolve)),
    )
    const response = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-during-navigation",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await settleReadiness()
    await vi.waitFor(() => expect(updateTabMock).toHaveBeenCalled())

    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-during-navigation",
      ),
    ).toMatchObject({
      certainty: "known",
      mutationState: "not_dispatched",
    })
    resolveNavigation?.()
    await settleReadiness()
    await pending

    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "cancelled_before_create" }),
    )
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
      }),
    )
  })

  it.each(["not a valid URL", "https://example.invalid/private"])(
    "rejects an inspected tab outside the canonical origin: %s",
    async (url) => {
      ;(globalThis as any).browser.tabs.get.mockResolvedValue({
        status: "complete",
        url,
      })
      const { handleTempWindowOpenRouterManagementKeyAction } = await import(
        "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
      )
      const response = vi.fn()
      const pending = handleTempWindowOpenRouterManagementKeyAction(
        {
          requestId: `request-invalid-inspected-origin-${url}`,
          operation: { kind: "create", label: "extension-request-example" },
        },
        response,
      )
      await settleReadiness()
      await pending

      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          mutationState: "not_dispatched",
          attemptOutcome: "invalid_origin",
        }),
      )
    },
  )

  it("rejects a duplicate in-flight request ID without a second mutation", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const firstResponse = vi.fn()
    const secondResponse = vi.fn()
    const first = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-duplicate",
        operation: { kind: "create", label: "extension-request-example" },
      },
      firstResponse,
    )
    await settleReadiness()
    await vi.waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith(
        901,
        expect.objectContaining({
          action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
        }),
      ),
    )
    const second = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-duplicate",
        operation: { kind: "create", label: "extension-request-example" },
      },
      secondResponse,
    )
    resolvePage?.({
      requestId: "request-duplicate",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
    })
    await Promise.all([first, second])

    expect(
      sendMessageMock.mock.calls.filter(
        ([, message]) =>
          message.action ===
          RuntimeActionIds.ContentOpenRouterManagementKeyAction,
      ),
    ).toHaveLength(1)
    expect(secondResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationState: "not_dispatched",
        attemptOutcome: "failed",
      }),
    )
  })

  it("normalizes a mismatched page result without forwarding its secret", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    mockPageResponder(() => ({
      requestId: "other-request",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-private-secret",
      label: "other-label",
    }))
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-result-guard",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await pending

    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-result-guard",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "failed",
      label: "extension-request-example",
    })
    expect(JSON.stringify(sendResponse.mock.calls)).not.toContain(
      "sk-or-private-secret",
    )
  })

  it.each([
    { operation: "delete", label: "extension-request-example" },
    { operation: "create", label: "different-label" },
  ])(
    "rejects a page result with mismatched operation metadata",
    async (fields) => {
      const { handleTempWindowOpenRouterManagementKeyAction } = await import(
        "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
      )
      mockPageResponder((message) => ({
        requestId: message.requestId,
        operation: fields.operation,
        mutationState: "not_dispatched",
        attemptOutcome: "failed",
        label: fields.label,
      }))
      const response = vi.fn()
      const pending = handleTempWindowOpenRouterManagementKeyAction(
        {
          requestId: `request-metadata-${fields.operation}-${fields.label}`,
          operation: { kind: "create", label: "extension-request-example" },
        },
        response,
      )
      await settleReadiness()
      await pending

      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          mutationState: "not_dispatched",
          attemptOutcome: "failed",
        }),
      )
    },
  )

  it.each([
    {
      mutationState: "created",
      attemptOutcome: "cancelled_after_create",
      accessToken: "sk-or-cancelled-after-create",
    },
    { mutationState: "dispatched_unconfirmed", attemptOutcome: "timeout" },
  ])(
    "accepts a marked $mutationState page result with $attemptOutcome",
    async (pageFields) => {
      const {
        handleTempWindowOpenRouterManagementKeyAction,
        markTempWindowOpenRouterManagementKeyDispatched,
      } = await import(
        "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
      )
      const dispatch = recordDispatchOutcomes(
        markTempWindowOpenRouterManagementKeyDispatched,
      )
      mockPageResponder((message) => {
        dispatch.mark(message.requestId)
        return {
          requestId: message.requestId,
          operation: "create",
          label: message.operation.label,
          ...pageFields,
        }
      })
      const response = vi.fn()
      const pending = handleTempWindowOpenRouterManagementKeyAction(
        {
          requestId: `request-marked-${pageFields.mutationState}`,
          operation: { kind: "create", label: "extension-request-example" },
        },
        response,
      )
      await settleReadiness()
      await pending

      expect(dispatch.outcomes).toEqual([true])
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({ mutationState: pageFields.mutationState }),
      )
    },
  )

  it("does not forward an oversized page secret after create dispatch", async () => {
    const oversizedSecret = `sk-or-${"a".repeat(
      OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH - "sk-or-".length + 1,
    )}`
    const {
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const dispatch = recordDispatchOutcomes(
      markTempWindowOpenRouterManagementKeyDispatched,
    )
    mockPageResponder((message) => {
      dispatch.mark(message.requestId)
      return {
        requestId: message.requestId,
        operation: "create",
        mutationState: "created",
        attemptOutcome: "success",
        accessToken: oversizedSecret,
        label: message.operation.label,
      }
    })
    const sendResponse = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-oversized-secret",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await pending

    expect(dispatch.outcomes).toEqual([true])
    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "request-oversized-secret",
      operation: "create",
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "failed",
      label: "extension-request-example",
    })
    expect(JSON.stringify(sendResponse.mock.calls)).not.toContain(
      oversizedSecret,
    )
  })

  it.each([
    {
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-unmarked-secret",
    },
    {
      mutationState: "dispatched_unconfirmed",
      attemptOutcome: "timeout",
    },
  ])(
    "derives mutation certainty from the marker for $mutationState page results",
    async (pageFields) => {
      const { handleTempWindowOpenRouterManagementKeyAction } = await import(
        "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
      )
      mockPageResponder((message) => ({
        requestId: message.requestId,
        operation: "create",
        label: message.operation.label,
        ...pageFields,
      }))
      const response = vi.fn()
      const pending = handleTempWindowOpenRouterManagementKeyAction(
        {
          requestId: `request-unmarked-${pageFields.mutationState}`,
          operation: { kind: "create", label: "extension-request-example" },
        },
        response,
      )
      await settleReadiness()
      await pending
      expect(response).toHaveBeenCalledWith({
        requestId: `request-unmarked-${pageFields.mutationState}`,
        operation: "create",
        mutationState: "not_dispatched",
        attemptOutcome: "failed",
        label: "extension-request-example",
      })
      expect(JSON.stringify(response.mock.calls)).not.toContain(
        "sk-or-unmarked-secret",
      )
    },
  )

  it("releases the context even when sending the result throws", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const sendResponse = vi.fn(() => {
      throw new Error("response channel closed")
    })
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-response-throws",
        operation: { kind: "create", label: "extension-request-example" },
      },
      sendResponse,
    )
    await settleReadiness()
    await expect(pending).resolves.toBeUndefined()
    expect(removeTabOrWindowMock).toHaveBeenCalled()
  })

  it("rejects a marker race after cancellation before dispatch", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const response = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-before-marker",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await settleReadiness()
    await vi.waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith(
        901,
        expect.objectContaining({
          action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
        }),
      ),
    )
    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-before-marker",
      ),
    ).toEqual({
      requestId: "request-cancel-before-marker",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "not_dispatched",
    })
    expect(
      markTempWindowOpenRouterManagementKeyDispatched(
        "request-cancel-before-marker",
      ),
    ).toBe(false)
    resolvePage?.({
      requestId: "request-cancel-before-marker",
      operation: "create",
      mutationState: "not_dispatched",
      attemptOutcome: "cancelled_before_create",
      label: "extension-request-example",
    })
    await pending
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "cancelled_before_create" }),
    )
  })

  it("settles cancellation promptly when acquisition stalls and cleans up a late context", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolveTab: ((value: { id: number }) => void) | undefined
    createTabMock.mockImplementation(
      () => new Promise((resolve) => (resolveTab = resolve)),
    )
    const response = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-stalled-acquire",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await vi.waitFor(() => expect(createTabMock).toHaveBeenCalled())
    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-stalled-acquire",
      ),
    ).toEqual({
      requestId: "request-cancel-stalled-acquire",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "not_dispatched",
    })
    await vi.advanceTimersByTimeAsync(100)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ attemptOutcome: "cancelled_before_create" }),
    )
    resolveTab?.({ id: 903 })
    await settleReadiness()
    await pending
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: RuntimeActionIds.ContentOpenRouterManagementKeyAction,
      }),
    )
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
  })

  it("owns rejection when a cancelled response port is already closed", async () => {
    const {
      cancelTempWindowOpenRouterManagementKeyAction,
      handleTempWindowOpenRouterManagementKeyAction,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolveTab: ((value: { id: number }) => void) | undefined
    createTabMock.mockImplementation(
      () => new Promise((resolve) => (resolveTab = resolve)),
    )
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-cancel-closed-port",
        operation: { kind: "create", label: "extension-request-example" },
      },
      () => {
        throw new Error("response port closed")
      },
    )
    await vi.waitFor(() => expect(createTabMock).toHaveBeenCalled())
    expect(
      cancelTempWindowOpenRouterManagementKeyAction(
        "request-cancel-closed-port",
      ),
    ).toEqual({
      requestId: "request-cancel-closed-port",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "not_dispatched",
    })
    await vi.advanceTimersByTimeAsync(100)
    resolveTab?.({ id: 904 })
    await settleReadiness()
    await expect(pending).resolves.toBeUndefined()
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
  })

  it("reconstructs allowlisted results and strips page extras", async () => {
    const {
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const response = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-result-canary",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await settleReadiness()
    await vi.waitFor(() => expect(resolvePage).toBeTypeOf("function"))
    expect(
      markTempWindowOpenRouterManagementKeyDispatched("request-result-canary"),
    ).toBe(true)
    resolvePage?.({
      requestId: "request-result-canary",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-allowlisted",
      label: "extension-request-example",
      sessionIdentity: {
        userId: "user_example",
        username: "Example User",
      },
      rawPageResponse: { accessToken: "sk-or-leaked" },
      arbitrary: "drop-me",
    })
    await pending
    expect(response).toHaveBeenCalledWith({
      requestId: "request-result-canary",
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-allowlisted",
      label: "extension-request-example",
      sessionIdentity: {
        userId: "user_example",
        username: "Example User",
      },
    })
    expect(JSON.stringify(response.mock.calls)).not.toContain("sk-or-leaked")
  })

  it("retains only exact secret-free completion summaries for cancellation", async () => {
    const action = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const dispatch = recordDispatchOutcomes(
      action.markTempWindowOpenRouterManagementKeyDispatched,
    )
    mockPageResponder((message) => {
      dispatch.mark(message.requestId)
      if (message.requestId === "request-summary-created") {
        return {
          requestId: message.requestId,
          operation: "create",
          mutationState: "created",
          attemptOutcome: "success",
          accessToken: "sk-or-private-summary-secret",
          label: message.operation.label,
          sessionIdentity: {
            userId: "private-user-placeholder",
            username: "Private User",
          },
        }
      }
      return {
        requestId: message.requestId,
        operation: "create",
        mutationState: "dispatched_unconfirmed",
        attemptOutcome: "timeout",
        label: message.operation.label,
        accessToken: "sk-or-private-unconfirmed-secret",
      }
    })

    const notDispatchedResponse = vi.fn()
    await action.handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-summary-not-dispatched",
        operation: { kind: "create", label: "not-dispatched-label" },
        originUrl: "https://example.invalid",
      } as any,
      notDispatchedResponse,
    )
    const createdPending = action.handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-summary-created",
        operation: { kind: "create", label: "created-label" },
      },
      vi.fn(),
    )
    await settleReadiness()
    await createdPending
    const unconfirmedPending =
      action.handleTempWindowOpenRouterManagementKeyAction(
        {
          requestId: "request-summary-unconfirmed",
          operation: { kind: "create", label: "unconfirmed-label" },
        },
        vi.fn(),
      )
    await settleReadiness()
    await unconfirmedPending

    expect(dispatch.outcomes).toEqual([true, true])
    const summaries = [
      action.cancelTempWindowOpenRouterManagementKeyAction(
        "request-summary-not-dispatched",
      ),
      action.cancelTempWindowOpenRouterManagementKeyAction(
        "request-summary-created",
      ),
      action.cancelTempWindowOpenRouterManagementKeyAction(
        "request-summary-unconfirmed",
      ),
    ]
    expect(summaries).toEqual([
      {
        requestId: "request-summary-not-dispatched",
        certainty: "known",
        cancellationAccepted: false,
        mutationState: "not_dispatched",
      },
      {
        requestId: "request-summary-created",
        certainty: "known",
        cancellationAccepted: false,
        mutationState: "created",
        label: "created-label",
      },
      {
        requestId: "request-summary-unconfirmed",
        certainty: "known",
        cancellationAccepted: false,
        mutationState: "dispatched_unconfirmed",
        label: "unconfirmed-label",
      },
    ])
    expect(JSON.stringify(summaries)).not.toContain("private")
    expect(Object.keys(summaries[0])).toEqual([
      "requestId",
      "certainty",
      "cancellationAccepted",
      "mutationState",
    ])
  })

  it("evicts only the oldest completed summary at the existing bound", async () => {
    const action = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )

    for (
      let index = 0;
      index <= EXPECTED_TRACKED_OPENROUTER_ACTION_IDS;
      index += 1
    ) {
      const requestId = `request-summary-bound-${index}`
      expect(
        action.cancelTempWindowOpenRouterManagementKeyAction(requestId),
      ).toMatchObject({
        requestId,
        certainty: "unknown",
        cancellationAccepted: true,
      })
      await action.handleTempWindowOpenRouterManagementKeyAction(
        {
          requestId,
          operation: { kind: "create", label: `summary-label-${index}` },
        },
        vi.fn(),
      )
    }

    expect(
      action.cancelTempWindowOpenRouterManagementKeyAction(
        "request-summary-bound-0",
      ),
    ).toEqual({
      requestId: "request-summary-bound-0",
      certainty: "unknown",
      cancellationAccepted: true,
    })
    expect(
      action.cancelTempWindowOpenRouterManagementKeyAction(
        "request-summary-bound-1",
      ),
    ).toEqual({
      requestId: "request-summary-bound-1",
      certainty: "known",
      cancellationAccepted: false,
      mutationState: "not_dispatched",
    })
    expect(
      action.cancelTempWindowOpenRouterManagementKeyAction(
        `request-summary-bound-${EXPECTED_TRACKED_OPENROUTER_ACTION_IDS}`,
      ),
    ).toEqual({
      requestId: `request-summary-bound-${EXPECTED_TRACKED_OPENROUTER_ACTION_IDS}`,
      certainty: "known",
      cancellationAccepted: false,
      mutationState: "not_dispatched",
    })
  })

  it.each([
    { userId: "", username: "Example User" },
    { userId: " user_example ", username: "Example User" },
    { userId: "user_example", username: "Example User", extra: "ignored" },
  ])("omits malformed page session identity %#", async (sessionIdentity) => {
    const {
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    let resolvePage: ((value: unknown) => void) | undefined
    mockPageResponder(() => new Promise((resolve) => (resolvePage = resolve)))
    const response = vi.fn()
    const requestId = `request-invalid-identity-${JSON.stringify(
      sessionIdentity,
    )}`
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId,
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await settleReadiness()
    await vi.waitFor(() => expect(resolvePage).toBeTypeOf("function"))
    expect(markTempWindowOpenRouterManagementKeyDispatched(requestId)).toBe(
      true,
    )
    resolvePage?.({
      requestId,
      operation: "create",
      mutationState: "created",
      attemptOutcome: "success",
      accessToken: "sk-or-test-secret",
      label: "extension-request-example",
      sessionIdentity,
    })
    await pending

    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ mutationState: "created" }),
    )
    expect(response.mock.calls[0]?.[0]).not.toHaveProperty("sessionIdentity")
  })

  it("attempts browser context removal once without resending the result", async () => {
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    removeTabOrWindowMock.mockRejectedValueOnce(
      new Error("temporary cleanup failure"),
    )
    const response = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-release-retry",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )
    await settleReadiness()
    await pending
    expect(response).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
  })

  it("does not repeat page mutation or download-rule cleanup when browser removal fails", async () => {
    const {
      handleTempWindowOpenRouterManagementKeyAction,
      markTempWindowOpenRouterManagementKeyDispatched,
    } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    removeTabOrWindowMock.mockRejectedValue(
      new Error("persistent close failure"),
    )
    const dispatch = recordDispatchOutcomes(
      markTempWindowOpenRouterManagementKeyDispatched,
    )
    mockPageResponder((message) => {
      dispatch.mark(message.requestId)
      return {
        requestId: message.requestId,
        operation: "create",
        mutationState: "created",
        attemptOutcome: "success",
        accessToken: "sk-or-test-secret",
        label: message.operation.label,
      }
    })
    const response = vi.fn()
    const pending = handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-release-exhausted",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )

    await settleReadiness()
    await pending

    expect(dispatch.outcomes).toEqual([true])
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ mutationState: "created" }),
    )
    expect(response).toHaveBeenCalledTimes(1)
    expect(
      sendMessageMock.mock.calls.filter(
        ([, message]) =>
          message.action ===
          RuntimeActionIds.ContentOpenRouterManagementKeyAction,
      ),
    ).toHaveLength(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(applyTempWindowDownloadBlockRuleMock).toHaveBeenCalledTimes(1)
    expect(removeTempWindowDownloadBlockRuleMock).toHaveBeenCalledTimes(1)
  })

  it("settles with a pre-dispatch failure when the temp runtime rejects", async () => {
    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
      tempWindowBackgroundRuntime: {
        run: vi.fn().mockRejectedValue(new Error("runtime unavailable")),
      },
    }))
    const { handleTempWindowOpenRouterManagementKeyAction } = await import(
      "~~/tests/entrypoints/background/openRouterManagementKeyActionTestAdapter"
    )
    const response = vi.fn()

    await handleTempWindowOpenRouterManagementKeyAction(
      {
        requestId: "request-runtime-rejection",
        operation: { kind: "create", label: "extension-request-example" },
      },
      response,
    )

    expect(response).toHaveBeenCalledWith({
      requestId: "request-runtime-rejection",
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: "extension-request-example",
    })
  })
})
