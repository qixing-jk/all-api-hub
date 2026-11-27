import { beforeEach, expect, it, vi } from "vitest"

import { executeWithCurrentTabContentPreference } from "~/services/apiTransport/currentTabTransport"
import {
  API_DIRECT_REQUEST_REASONS,
  API_OPERATION_SEMANTICS,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import type { FetchApiOptions } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  onDispatch: vi.fn(),
  onResponse: vi.fn(),
  fallback: vi.fn(),
}))

vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()),
  sendTabMessageWithRetry: mocks.send,
  onRuntimeMessage: vi.fn(() => vi.fn()),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fallback.mockResolvedValue("fallback")
})

function execute(options: Partial<FetchApiOptions> = {}) {
  return executeWithCurrentTabContentPreference(
    {
      request: {
        baseUrl: "https://example.com",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
        directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
      },
      fetchContext: {
        kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 17,
        origin: "https://example.com",
      },
      url: "https://example.com/api/user/token",
      endpoint: "/api/user/token",
      fetchOptions: options.options ?? { method: "GET" },
      responseType: "json",
      options: {
        endpoint: "/api/user/token",
        operationSemantics: API_OPERATION_SEMANTICS.Mutation,
        ...options,
      },
      onDispatch: mocks.onDispatch,
      onResponse: mocks.onResponse,
    },
    (response) => response.body,
    mocks.fallback,
  )
}

it("does not repeat a mutating GET when the current-tab response is lost", async () => {
  const failure = new Error("Message channel closed")
  mocks.send.mockRejectedValueOnce(failure)
  await expect(execute()).rejects.toBe(failure)
  expect(mocks.send).toHaveBeenCalledOnce()
  expect(mocks.fallback).not.toHaveBeenCalled()
  expect(mocks.onDispatch).toHaveBeenCalledOnce()
  expect(mocks.onResponse).not.toHaveBeenCalled()
})

it("cancels a pending POST retry before a reloaded tab can receive it", async () => {
  const messaging = await vi.importActual<
    typeof import("~/utils/browser/runtimeMessages")
  >("~/utils/browser/runtimeMessages")
  mocks.send.mockImplementationOnce(messaging.sendTabMessageWithRetry)
  const sendMessage = vi
    .spyOn(browser.tabs, "sendMessage")
    .mockRejectedValueOnce(new Error("Receiving end does not exist"))
    .mockResolvedValue({ success: true, data: "submitted" })
  vi.useFakeTimers()
  try {
    const abort = new AbortController()
    const result = execute({
      options: { method: "POST", signal: abort.signal },
    }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(sendMessage).toHaveBeenCalledOnce()
    abort.abort()
    await vi.runAllTimersAsync()
    expect(sendMessage).toHaveBeenCalledOnce()
    expect(await result).toBe(abort.signal.reason)
    expect(mocks.onDispatch).not.toHaveBeenCalled()
    expect(mocks.fallback).not.toHaveBeenCalled()
  } finally {
    sendMessage.mockRestore()
    vi.useRealTimers()
  }
})

it("retains possible dispatch when a retried POST is already in flight at cancellation", async () => {
  const messaging = await vi.importActual<
    typeof import("~/utils/browser/runtimeMessages")
  >("~/utils/browser/runtimeMessages")
  mocks.send.mockImplementationOnce(messaging.sendTabMessageWithRetry)
  const pending = createDeferred<{ success: boolean; data: string }>()
  const sendMessage = vi
    .spyOn(browser.tabs, "sendMessage")
    .mockRejectedValueOnce(new Error("Receiving end does not exist"))
    .mockReturnValueOnce(pending.promise)
  vi.useFakeTimers()
  try {
    const abort = new AbortController()
    const result = execute({
      options: { method: "POST", signal: abort.signal },
    })
    await vi.runAllTimersAsync()
    expect(sendMessage).toHaveBeenCalledTimes(2)
    abort.abort()
    expect(mocks.onDispatch).toHaveBeenCalledOnce()
    pending.resolve({ success: true, data: "submitted" })
    await expect(result).resolves.toBe("submitted")
    expect(mocks.fallback).not.toHaveBeenCalled()
  } finally {
    sendMessage.mockRestore()
    vi.useRealTimers()
  }
})

it.each(["receiver unavailable", "explicit rejection"])(
  "allows the first GET mutation dispatch after %s proves the page did not dispatch",
  async (failure) => {
    if (failure === "receiver unavailable") {
      mocks.send.mockRejectedValueOnce(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      )
    } else {
      mocks.send.mockResolvedValueOnce({
        success: false,
        error: "Page unavailable before dispatch",
        transportLifecycle: {
          upstreamRequestDispatched: false,
          upstreamResponseReceived: false,
        },
      })
    }
    await expect(execute()).resolves.toBe("fallback")
    expect(mocks.fallback).toHaveBeenCalledOnce()
    expect(mocks.onDispatch).not.toHaveBeenCalled()
  },
)

it("does not repeat a GET mutation after affirmative page dispatch evidence", async () => {
  mocks.send.mockResolvedValueOnce({
    success: false,
    error: "Response lost after dispatch",
    transportLifecycle: {
      upstreamRequestDispatched: true,
      upstreamResponseReceived: false,
    },
  })
  await expect(execute()).rejects.toThrow("Response lost after dispatch")
  expect(mocks.fallback).not.toHaveBeenCalled()
  expect(mocks.onDispatch).toHaveBeenCalledOnce()
  expect(mocks.onResponse).not.toHaveBeenCalled()
})

it("cannot make a POST replayable by declaring read semantics", async () => {
  const failure = new Error("Message channel closed")
  mocks.send.mockRejectedValueOnce(failure)
  await expect(
    execute({
      operationSemantics: API_OPERATION_SEMANTICS.Read,
      options: { method: "POST", body: "{}" },
    }),
  ).rejects.toBe(failure)
  expect(mocks.fallback).not.toHaveBeenCalled()
  expect(mocks.onDispatch).toHaveBeenCalledOnce()
})

it("still recovers a GET read when the current-tab response is lost", async () => {
  mocks.send.mockRejectedValueOnce(new Error("Message channel closed"))
  await expect(
    execute({ operationSemantics: API_OPERATION_SEMANTICS.Read }),
  ).resolves.toBe("fallback")
  expect(mocks.fallback).toHaveBeenCalledOnce()
})
