import { beforeEach, describe, expect, it, vi } from "vitest"

import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"

type RuntimeMessageListener = (
  message: unknown,
  sender: browser.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean

interface TestProtocolMap {
  "test:ping"(data: { value: string }): { echoed: string }
  "test:fail"(): { ok: boolean }
  "test:other"(): { ok: boolean }
  "test:void"(): undefined
}

function createRuntimeMock() {
  const listeners = new Set<RuntimeMessageListener>()
  const addListener = vi.fn((listener: RuntimeMessageListener) => {
    listeners.add(listener)
  })
  const removeListener = vi.fn((listener: RuntimeMessageListener) => {
    listeners.delete(listener)
  })
  const sendMessage = vi.fn()
  const tabsSendMessage = vi.fn()

  ;(globalThis as any).browser = {
    runtime: {
      onMessage: {
        addListener,
        removeListener,
      },
      sendMessage,
    },
    tabs: {
      sendMessage: tabsSendMessage,
    },
  }

  return {
    addListener,
    removeListener,
    sendMessage,
    tabsSendMessage,
    getListener: () => {
      const listener = Array.from(listeners)[0]
      expect(listener).toBeTypeOf("function")
      return listener
    },
  }
}

describe("extension messaging transport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps the runtime channel open and responds through sendResponse", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    const handler = vi
      .fn()
      .mockResolvedValue({ echoed: "pong" } satisfies { echoed: string })

    const remove = messenger.onMessage("test:ping", handler)
    const sendResponse = vi.fn()

    const handled = runtime.getListener()(
      {
        id: 1,
        type: "test:ping",
        data: { value: "pong" },
        timestamp: Date.now(),
      },
      { id: "sender" } as browser.runtime.MessageSender,
      sendResponse,
    )

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ res: { echoed: "pong" } })
    })
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { value: "pong" },
        sender: { id: "sender" },
        type: "test:ping",
      }),
    )

    remove()
    expect(runtime.removeListener).toHaveBeenCalledTimes(1)
  })

  it("does not claim unknown message formats or unregistered types", () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    messenger.onMessage("test:ping", vi.fn())
    const listener = runtime.getListener()

    expect(listener("not-object", {}, vi.fn())).toBe(false)
    expect(listener({ action: "legacy" }, {}, vi.fn())).toBe(false)
    expect(
      listener(
        {
          id: 1,
          type: "test:unknown",
          timestamp: Date.now(),
        },
        {},
        vi.fn(),
      ),
    ).toBe(false)
  })

  it("throws on malformed envelopes when strict format validation is enabled", () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>({
      throwOnUnknownMessageFormat: true,
    })
    messenger.onMessage("test:ping", vi.fn())
    const listener = runtime.getListener()

    expect(() => listener("not-object", {}, vi.fn())).toThrow(
      "Unknown message format",
    )
    expect(() => listener({ action: "legacy" }, {}, vi.fn())).toThrow(
      "Unknown message format",
    )
  })

  it("serializes listener failures so senders reject with a readable error", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    messenger.onMessage("test:fail", async () => {
      throw new TypeError("boom")
    })
    const sendResponse = vi.fn()

    expect(
      runtime.getListener()(
        {
          id: 1,
          type: "test:fail",
          timestamp: Date.now(),
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        err: expect.objectContaining({
          message: "boom",
          name: "TypeError",
        }),
      })
    })

    runtime.sendMessage.mockResolvedValueOnce(sendResponse.mock.calls[0]?.[0])

    await expect(messenger.sendMessage("test:fail")).rejects.toThrow("boom")
  })

  it("serializes synchronous listener failures without closing the channel", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    messenger.onMessage("test:fail", () => {
      throw new Error("sync boom")
    })
    const sendResponse = vi.fn()

    const handled = runtime.getListener()(
      {
        id: 1,
        type: "test:fail",
        timestamp: Date.now(),
      },
      {},
      sendResponse,
    )

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        err: expect.objectContaining({
          message: "sync boom",
        }),
      })
    })
  })

  it.each([
    ["string failure", "string failure"],
    [{ code: "bad-input" }, '{"code":"bad-input"}'],
  ])("serializes non-error listener failures: %s", async (failure, message) => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    messenger.onMessage("test:fail", () => {
      throw failure
    })
    const sendResponse = vi.fn()

    expect(
      runtime.getListener()(
        {
          id: 1,
          type: "test:fail",
          timestamp: Date.now(),
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        err: expect.objectContaining({
          message,
          name: "Error",
        }),
      })
    })
  })

  it("serializes circular non-error listener failures", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    const failure: Record<string, unknown> = { code: "circular" }
    failure.self = failure
    messenger.onMessage("test:fail", () => {
      throw failure
    })
    const sendResponse = vi.fn()

    expect(
      runtime.getListener()(
        {
          id: 1,
          type: "test:fail",
          timestamp: Date.now(),
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        err: expect.objectContaining({
          message: "[object Object]",
          name: "Error",
        }),
      })
    })
  })

  it("rejects when the browser returns no response", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    runtime.sendMessage.mockResolvedValueOnce(undefined)

    await expect(
      messenger.sendMessage("test:ping", { value: "lost" }),
    ).rejects.toThrow("No response")
  })

  it("retries receiver-missing runtime sends before preserving the typed response", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    runtime.sendMessage
      .mockRejectedValueOnce(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      )
      .mockResolvedValueOnce({ res: { echoed: "pong" } })

    await expect(
      messenger.sendMessage("test:ping", { value: "pong" }),
    ).resolves.toEqual({ echoed: "pong" })
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2)
  })

  it("does not retry typed listener errors returned by the receiver", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    runtime.sendMessage.mockResolvedValueOnce({
      err: { message: "listener failed", name: "Error" },
    })

    await expect(messenger.sendMessage("test:fail")).rejects.toThrow(
      "listener failed",
    )
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1)
  })

  it("targets tabs and frames through tabs.sendMessage", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    runtime.tabsSendMessage.mockResolvedValueOnce({ res: undefined })

    await expect(
      messenger.sendMessage("test:void", undefined, { tabId: 7, frameId: 3 }),
    ).resolves.toBeUndefined()

    expect(runtime.tabsSendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: "test:void",
      }),
      { frameId: 3 },
    )
  })

  it("retries receiver-missing tab sends before preserving the typed response", async () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()
    runtime.tabsSendMessage
      .mockRejectedValueOnce(new Error("Receiving end does not exist"))
      .mockResolvedValueOnce({ res: { echoed: "from tab" } })

    await expect(
      messenger.sendMessage(
        "test:ping",
        { value: "from tab" },
        { tabId: 7, frameId: 3 },
      ),
    ).resolves.toEqual({ echoed: "from tab" })
    expect(runtime.tabsSendMessage).toHaveBeenCalledTimes(2)
    expect(runtime.tabsSendMessage).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ type: "test:ping" }),
      { frameId: 3 },
    )
  })

  it("keeps the root listener until the last typed listener is removed", () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()

    const removePing = messenger.onMessage("test:ping", vi.fn())
    const removeOther = messenger.onMessage("test:other", vi.fn())

    removePing()
    expect(runtime.removeListener).not.toHaveBeenCalled()

    removeOther()
    expect(runtime.removeListener).toHaveBeenCalledTimes(1)
  })

  it("throws when registering duplicate listeners for the same type", () => {
    createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()

    messenger.onMessage("test:ping", vi.fn())

    expect(() => messenger.onMessage("test:ping", vi.fn())).toThrow(
      "only one listener can be setup",
    )
  })

  it("removes the root listener when all typed listeners are cleared", () => {
    const runtime = createRuntimeMock()
    const messenger = defineExtensionMessaging<TestProtocolMap>()

    messenger.onMessage("test:ping", vi.fn())
    messenger.onMessage("test:other", vi.fn())
    messenger.removeAllListeners()

    expect(runtime.removeListener).toHaveBeenCalledTimes(1)
  })
})
