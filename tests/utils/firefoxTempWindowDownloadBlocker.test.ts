import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}))

describe("firefoxTempWindowDownloadBlocker", () => {
  const originalBrowser = (globalThis as any).browser
  let addListenerMock: ReturnType<typeof vi.fn>
  let removeListenerMock: ReturnType<typeof vi.fn>
  let isFirefoxEnvMock: ReturnType<typeof vi.fn>
  let registeredListener:
    | ((details: browser.webRequest._OnBeforeRequestDetails) => unknown)
    | undefined

  beforeEach(() => {
    vi.resetModules()
    loggerWarnMock.mockReset()
    registeredListener = undefined
    addListenerMock = vi.fn((listener) => {
      registeredListener = listener
    })
    removeListenerMock = vi.fn()
    isFirefoxEnvMock = vi.fn(() => true)
    ;(globalThis as any).browser = {
      webRequest: {
        onBeforeRequest: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    }
    vi.doMock("~/utils/browser/protectionBypass", () => ({
      isProtectionBypassFirefoxEnv: isFirefoxEnvMock,
    }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.doUnmock("~/utils/browser/protectionBypass")
    vi.restoreAllMocks()
  })

  it("cancels executable requests only for active temp tabs", async () => {
    const { applyFirefoxTempWindowDownloadBlockRule } = await import(
      "~/utils/browser/firefoxTempWindowDownloadBlocker"
    )

    await expect(applyFirefoxTempWindowDownloadBlockRule(77)).resolves.toBe(77)

    expect(addListenerMock).toHaveBeenCalledWith(
      expect.any(Function),
      {
        urls: ["<all_urls>"],
        types: ["main_frame", "sub_frame", "object", "xmlhttprequest", "other"],
      },
      ["blocking"],
    )
    expect(registeredListener).toBeTypeOf("function")

    expect(
      registeredListener!({
        tabId: 77,
        url: "https://downloads.example.invalid/tool.EXE?source=temp",
      } as any),
    ).toEqual({ cancel: true })
    expect(
      registeredListener!({
        tabId: 78,
        url: "https://downloads.example.invalid/tool.exe",
      } as any),
    ).toEqual({})
    expect(
      registeredListener!({
        tabId: 77,
        url: "https://downloads.example.invalid/manual.pdf",
      } as any),
    ).toEqual({})
  })

  it("unregisters the listener after the last temp tab is removed", async () => {
    const {
      applyFirefoxTempWindowDownloadBlockRule,
      removeFirefoxTempWindowDownloadBlockRule,
    } = await import("~/utils/browser/firefoxTempWindowDownloadBlocker")

    await applyFirefoxTempWindowDownloadBlockRule(77)
    await applyFirefoxTempWindowDownloadBlockRule(88)

    expect(addListenerMock).toHaveBeenCalledTimes(1)

    await removeFirefoxTempWindowDownloadBlockRule(77)
    expect(removeListenerMock).not.toHaveBeenCalled()

    await removeFirefoxTempWindowDownloadBlockRule(88)
    expect(removeListenerMock).toHaveBeenCalledWith(registeredListener)
  })

  it("returns null outside Firefox or when webRequest blocking is unavailable", async () => {
    const { applyFirefoxTempWindowDownloadBlockRule } = await import(
      "~/utils/browser/firefoxTempWindowDownloadBlocker"
    )

    isFirefoxEnvMock.mockReturnValueOnce(false)
    await expect(
      applyFirefoxTempWindowDownloadBlockRule(77),
    ).resolves.toBeNull()
    expect(addListenerMock).not.toHaveBeenCalled()
    ;(globalThis as any).browser = {}
    await expect(
      applyFirefoxTempWindowDownloadBlockRule(77),
    ).resolves.toBeNull()
  })

  it("returns null when browser API probing throws", async () => {
    ;(globalThis as any).browser = {
      get webRequest() {
        throw new Error("blocked getter")
      },
    }
    const { applyFirefoxTempWindowDownloadBlockRule } = await import(
      "~/utils/browser/firefoxTempWindowDownloadBlocker"
    )

    await expect(
      applyFirefoxTempWindowDownloadBlockRule(77),
    ).resolves.toBeNull()
  })

  it("ignores invalid tab ids", async () => {
    const {
      applyFirefoxTempWindowDownloadBlockRule,
      removeFirefoxTempWindowDownloadBlockRule,
    } = await import("~/utils/browser/firefoxTempWindowDownloadBlocker")

    await expect(
      applyFirefoxTempWindowDownloadBlockRule(-1),
    ).resolves.toBeNull()
    await expect(
      removeFirefoxTempWindowDownloadBlockRule(Number.NaN),
    ).resolves.toBeUndefined()
    expect(addListenerMock).not.toHaveBeenCalled()
    expect(removeListenerMock).not.toHaveBeenCalled()
  })

  it("cleans up state when listener registration fails", async () => {
    addListenerMock.mockImplementationOnce(() => {
      throw new Error("missing permission")
    })
    const { applyFirefoxTempWindowDownloadBlockRule } = await import(
      "~/utils/browser/firefoxTempWindowDownloadBlocker"
    )

    await expect(
      applyFirefoxTempWindowDownloadBlockRule(77),
    ).resolves.toBeNull()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to install Firefox temp-window download block listener",
      expect.any(Error),
    )
    expect(registeredListener).toBeUndefined()
  })

  it("logs listener cleanup failures without throwing", async () => {
    removeListenerMock.mockImplementationOnce(() => {
      throw new Error("cleanup failed")
    })
    const {
      applyFirefoxTempWindowDownloadBlockRule,
      removeFirefoxTempWindowDownloadBlockRule,
    } = await import("~/utils/browser/firefoxTempWindowDownloadBlocker")

    await applyFirefoxTempWindowDownloadBlockRule(77)
    await expect(
      removeFirefoxTempWindowDownloadBlockRule(77),
    ).resolves.toBeUndefined()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to remove Firefox temp-window download block listener",
      expect.any(Error),
    )
  })
})
