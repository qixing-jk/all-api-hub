// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("Browser API Lab sandbox bridge", () => {
  let messageListener: EventListener
  let evaluate: typeof import("~/utils/browser/devApiExplorer").evaluateJsSnippet

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    const addListener = window.addEventListener.bind(window)
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type, listener, options) => {
        if (type === "message") messageListener = listener as EventListener
        addListener(type, listener, options)
      },
    )
    vi.stubGlobal("chrome", {
      runtime: { getURL: () => "https://extension.test/sandbox.html" },
      storage: { local: { set: vi.fn() } },
    })
    evaluate = (await import("~/utils/browser/devApiExplorer"))
      .evaluateJsSnippet
  })

  afterEach(() => {
    window.removeEventListener("message", messageListener)
    document.body.replaceChildren()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function message(source: Window | null, data: Record<string, unknown>) {
    window.dispatchEvent(
      new MessageEvent("message", {
        source,
        data: { source: "aah-sandbox", ...data },
      }),
    )
  }

  it("rejects forged API requests after sandbox initialization times out", async () => {
    const run = evaluate("return 1")
    await vi.advanceTimersByTimeAsync(5000)
    expect((await run).error).toContain("initialization timed out")
    message(window, {
      type: "RPC_REQUEST",
      rpcId: 1,
      path: "storage.local.set",
      args: [{ compromised: true }],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })

  it("rejects requests from another window while accepting sandbox results", async () => {
    const run = evaluate("return 42")
    const iframe = document.querySelector("iframe")!
    const postMessage = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => {})
    message(window, { type: "SANDBOX_READY" })
    await vi.advanceTimersByTimeAsync(0)
    expect(postMessage).not.toHaveBeenCalled()
    message(iframe.contentWindow, { type: "SANDBOX_READY" })
    await vi.advanceTimersByTimeAsync(0)
    const request = postMessage.mock.calls[0]![0]
    message(window, {
      type: "EXECUTION_RESULT",
      runId: request.runId,
      success: true,
      result: "forged",
    })
    message(iframe.contentWindow, {
      type: "EXECUTION_RESULT",
      runId: request.runId,
      success: true,
      result: 42,
    })
    expect(await run).toMatchObject({ success: true, data: 42 })
  })

  it("settles every concurrent caller on initialization timeout and permits retry", async () => {
    const first = evaluate("return 1")
    const second = evaluate("return 2")
    let secondResult: unknown
    void second.then((result) => {
      secondResult = result
    })
    await vi.advanceTimersByTimeAsync(5000)
    expect((await first).success).toBe(false)
    expect(secondResult).toMatchObject({
      success: false,
      error: expect.stringContaining("initialization timed out"),
    })
    const retry = evaluate("return 3")
    const iframe = document.querySelector("iframe")!
    const post = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => {})
    message(iframe.contentWindow, { type: "SANDBOX_READY" })
    await vi.advanceTimersByTimeAsync(0)
    message(iframe.contentWindow, {
      type: "EXECUTION_RESULT",
      runId: post.mock.calls[0]![0].runId,
      success: true,
      result: 3,
    })
    expect(await retry).toMatchObject({ success: true, data: 3 })
  })

  it("bridges API calls, serializes uncloneable responses, and reports API failures", async () => {
    const run = evaluate("return chrome.runtime.getManifest()")
    const iframe = document.querySelector("iframe")!
    const post = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => {})
    message(iframe.contentWindow, { type: "SANDBOX_READY" })
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(
      new MessageEvent("message", { source: iframe.contentWindow, data: null }),
    )
    message(iframe.contentWindow, {
      type: "RPC_REQUEST",
      rpcId: 1,
      path: "storage.local.set",
      args: [{ ok: true }],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ ok: true })
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "RPC_RESPONSE",
        rpcId: 1,
        success: true,
      }),
      "*",
    )
    const api = chrome as any
    api.runtime.getManifest = () => ({ name: "Test", fn: () => {} })
    post.mockImplementationOnce(() => {
      throw new Error("cannot clone")
    })
    message(iframe.contentWindow, {
      type: "RPC_REQUEST",
      rpcId: 2,
      path: "runtime.getManifest",
      args: [],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ rpcId: 2, data: { name: "Test" } }),
      "*",
    )
    message(iframe.contentWindow, {
      type: "RPC_REQUEST",
      rpcId: 3,
      path: "missing.method",
      args: [],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ rpcId: 3, success: false }),
      "*",
    )
    const circular: Record<string, unknown> = {}
    circular.self = circular
    api.runtime.getManifest = () => circular
    post.mockImplementationOnce(() => {
      throw new Error("cannot clone")
    })
    message(iframe.contentWindow, {
      type: "RPC_REQUEST",
      rpcId: 4,
      path: "runtime.getManifest",
      args: [],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rpcId: 4,
        success: false,
        error: expect.stringContaining("circular"),
      }),
      "*",
    )
    message(iframe.contentWindow, {
      type: "EXECUTION_RESULT",
      runId: post.mock.calls[0]![0].runId,
      success: false,
      error: "script failed",
    })
    expect(await run).toMatchObject({ success: false, error: "script failed" })
  })

  it("reuses a ready sandbox and times out code that never returns", async () => {
    const first = evaluate("return 1")
    const iframe = document.querySelector("iframe")!
    const post = vi
      .spyOn(iframe.contentWindow!, "postMessage")
      .mockImplementation(() => {})
    message(iframe.contentWindow, { type: "SANDBOX_READY" })
    await vi.advanceTimersByTimeAsync(0)
    message(iframe.contentWindow, {
      type: "EXECUTION_RESULT",
      runId: post.mock.calls[0]![0].runId,
      success: true,
      result: 1,
    })
    expect((await first).success).toBe(true)
    const second = evaluate("await new Promise(() => {})")
    await vi.advanceTimersByTimeAsync(15000)
    expect(await second).toMatchObject({
      success: false,
      error: "Execution timed out (15s)",
    })
    expect(document.querySelectorAll("iframe")).toHaveLength(1)
  })

  it("reports runtime URL lookup failures", async () => {
    ;(chrome.runtime.getURL as any) = () => {
      throw new Error("invalid context")
    }
    expect((await evaluate("return 1")).error).toContain(
      "Cannot resolve sandbox.html URL",
    )
  })
})
