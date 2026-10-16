import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { executeMainWorldFunction } from "~/utils/browser/scripting"

describe("executeMainWorldFunction", () => {
  const originalBrowser = (globalThis as any).browser

  beforeEach(() => {
    ;(globalThis as any).browser = {
      scripting: {
        executeScript: vi.fn(),
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
  })

  it("returns null when browser.scripting.executeScript is unavailable", async () => {
    ;(globalThis as any).browser = {}
    const result = await executeMainWorldFunction(1, () => "test")
    expect(result).toBeNull()
  })

  it("executes function in MAIN world and returns the result", async () => {
    const executeScriptMock = (globalThis as any).browser.scripting
      .executeScript
    executeScriptMock.mockResolvedValue([
      { result: { token: "cf-token", hasApi: true } },
    ])

    const fn = (arg: boolean) => ({ token: "cf-token", hasApi: arg })
    const result = await executeMainWorldFunction(101, fn, [true])

    expect(executeScriptMock).toHaveBeenCalledWith({
      target: { tabId: 101 },
      args: [true],
      func: fn,
      world: "MAIN",
    })
    expect(result).toEqual({ token: "cf-token", hasApi: true })
  })

  it("returns null when injection reports an error", async () => {
    const executeScriptMock = (globalThis as any).browser.scripting
      .executeScript
    executeScriptMock.mockResolvedValue([
      { error: new Error("Execution failed"), result: null },
    ])

    const result = await executeMainWorldFunction(101, () => "ignored")
    expect(result).toBeNull()
  })

  it("returns null when executeScript rejects", async () => {
    const executeScriptMock = (globalThis as any).browser.scripting
      .executeScript
    executeScriptMock.mockRejectedValue(new Error("Tab closed"))

    const result = await executeMainWorldFunction(101, () => "ignored")
    expect(result).toBeNull()
  })
})
