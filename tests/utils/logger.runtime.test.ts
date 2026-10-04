import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"

const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log,
}

const flushMicrotasks = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

type ChangeListener = (
  changes: Record<string, { newValue?: unknown }> | undefined,
  areaName?: string,
) => void

function createPromiseStorageApi(storedValue: unknown) {
  let listener: ChangeListener | undefined

  const addListener = vi.fn((next: ChangeListener) => {
    listener = next
  })
  const removeListener = vi.fn()
  const get = vi.fn().mockResolvedValue({
    [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: storedValue,
  })

  return {
    api: {
      runtime: {},
      storage: {
        onChanged: {
          addListener,
          removeListener,
        },
        local: {
          get,
        },
      },
    },
    get,
    addListener,
    removeListener,
    getListener: () => listener,
  }
}

function createCallbackStorageApi(
  storedValue: unknown,
  options?: { throws?: boolean },
) {
  let listener: ChangeListener | undefined

  const addListener = vi.fn((next: ChangeListener) => {
    listener = next
  })
  const removeListener = vi.fn()
  const get = vi.fn((key: string, callback?: (result: unknown) => void) => {
    if (!callback) {
      throw new Error("promise form unavailable")
    }
    if (options?.throws) {
      throw new Error("callback form unavailable")
    }
    callback({
      [key]: storedValue,
    })
    return undefined
  })

  return {
    api: {
      runtime: {},
      storage: {
        onChanged: {
          addListener,
          removeListener,
        },
        local: {
          get,
        },
      },
    },
    get,
    addListener,
    removeListener,
    getListener: () => listener,
  }
}

async function importFreshLogger(options?: {
  browserApi?: unknown
  chromeApi?: unknown
  document?: unknown
  location?: Partial<Location>
}) {
  vi.resetModules()
  vi.unstubAllGlobals()

  if (typeof options?.browserApi !== "undefined") {
    vi.stubGlobal("browser", options.browserApi)
  }

  if (typeof options?.chromeApi !== "undefined") {
    vi.stubGlobal("chrome", options.chromeApi)
  }

  if (typeof options?.document !== "undefined") {
    vi.stubGlobal("document", options.document)
  }

  if (typeof options?.location !== "undefined") {
    vi.stubGlobal("location", {
      protocol: "",
      pathname: "",
      ...options.location,
    })
  }

  const module = await import("~/utils/core/logger")
  await flushMicrotasks()
  return module
}

describe("unified logger runtime/bootstrap behavior", () => {
  it("reads Plasmo-serialized logging preferences on startup and storage changes", async () => {
    const storage = createPromiseStorageApi(
      JSON.stringify({ logging: { consoleEnabled: true, level: "info" } }),
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { createLogger } = await importFreshLogger({
      browserApi: storage.api,
    })
    const logger = createLogger("SerializedPreferences")
    logger.warn("enabled from persisted JSON")
    expect(warn).toHaveBeenCalledTimes(1)
    storage.getListener()?.(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: JSON.stringify({
            logging: { consoleEnabled: false, level: "debug" },
          }),
        },
      },
      "local",
    )
    logger.warn("disabled by serialized update")
    expect(warn).toHaveBeenCalledTimes(1)
  })
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    ;(console as any).debug = originalConsole.debug
    ;(console as any).info = originalConsole.info
    ;(console as any).warn = originalConsole.warn
    ;(console as any).error = originalConsole.error
    ;(console as any).log = originalConsole.log
  })

  it("loads promise-based preferences, detects background context, and reacts only to relevant storage changes", async () => {
    const storage = createPromiseStorageApi({
      logging: {
        consoleEnabled: true,
        level: "error",
      },
    })
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { createLogger } = await importFreshLogger({
      browserApi: storage.api,
    })

    const logger = createLogger("   ")
    logger.warn("suppressed by initial level")
    logger.error("background failure")

    expect(storage.addListener).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Background][Unknown] background failure"),
    )
    expect(warnSpy).not.toHaveBeenCalled()

    storage.getListener()?.(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: {
            logging: {
              consoleEnabled: true,
              level: "debug",
            },
          },
        },
      },
      "sync",
    )
    logger.debug("still suppressed")
    expect(debugSpy).not.toHaveBeenCalled()

    storage.getListener()?.(
      {
        unrelated: {
          newValue: {
            logging: {
              consoleEnabled: true,
              level: "debug",
            },
          },
        },
      },
      "local",
    )
    logger.debug("still unrelated")
    expect(debugSpy).not.toHaveBeenCalled()

    storage.getListener()?.(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: {
            logging: {
              consoleEnabled: true,
              level: "debug",
            },
          },
        },
      },
      "local",
    )
    logger.debug("now enabled")

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Background][Unknown] now enabled"),
    )
  })

  it("falls back to callback-style storage reads and resets to default preferences when logging config disappears", async () => {
    const storage = createCallbackStorageApi({
      logging: {
        consoleEnabled: true,
        level: "warn",
      },
    })
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { createLogger } = await importFreshLogger({
      browserApi: storage.api,
      document: {},
      location: {
        protocol: "chrome-extension:",
        pathname: "/options.html",
      },
    })

    const logger = createLogger("Settings")
    logger.info("below threshold")
    logger.warn("loaded from callback storage")

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[Options][Settings] loaded from callback storage",
      ),
    )
    expect(infoSpy).not.toHaveBeenCalled()

    storage.getListener()?.(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: {},
        },
      },
      "local",
    )
    logger.warn("default logger prefs are quiet in tests")

    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("uses default logging preferences when stored values are invalid and still detects content-script context", async () => {
    const storage = createPromiseStorageApi({
      logging: {
        consoleEnabled: "yes",
        level: "verbose",
      },
    })
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { createLogger } = await importFreshLogger({
      browserApi: storage.api,
      document: {},
      location: {
        protocol: "https:",
        pathname: "/app",
      },
    })

    const logger = createLogger("ContentScope")
    logger.warn("suppressed until local prefs arrive")
    expect(warnSpy).not.toHaveBeenCalled()

    storage.getListener()?.(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: {
            logging: {
              consoleEnabled: true,
              level: "info",
            },
          },
        },
      },
      "local",
    )

    logger.info("content logger active")
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Content][ContentScope] content logger active"),
    )
  })

  it("detects side panel context when only the chrome extension API is available", async () => {
    const storage = createPromiseStorageApi({
      logging: {
        consoleEnabled: true,
        level: "debug",
      },
    })
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})

    const { createLogger } = await importFreshLogger({
      browserApi: null,
      chromeApi: storage.api,
      document: {},
      location: {
        protocol: "ms-browser-extension:",
        pathname: "/sidepanel/index.html",
      },
    })

    createLogger("Panel").debug("side panel boot")

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[SidePanel][Panel] side panel boot"),
    )
  })

  it("detects popup and unknown contexts from extension and non-extension environments", async () => {
    const popupStorage = createPromiseStorageApi({
      logging: {
        consoleEnabled: true,
        level: "debug",
      },
    })
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})

    let loggerModule = await importFreshLogger({
      browserApi: popupStorage.api,
      document: {},
      location: {
        protocol: "chrome-extension:",
        pathname: "/dashboard.html",
      },
    })

    loggerModule.createLogger("PopupScope").debug("popup fallback path")
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Popup][PopupScope] popup fallback path"),
    )

    loggerModule = await importFreshLogger({
      browserApi: null,
      chromeApi: null,
      document: {},
      location: {
        protocol: "https:",
        pathname: "/web/page",
      },
    })

    loggerModule.setLoggingPreferences({
      consoleEnabled: true,
      level: "info",
    })
    loggerModule.createLogger("UnknownScope").info("manual unknown context")

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Unknown][UnknownScope] manual unknown context"),
    )
  })

  it("sanitizes structured runtime values including bigints, symbols, functions, dates, urls, errors, maps, and sets", async () => {
    const storage = createPromiseStorageApi({
      logging: {
        consoleEnabled: true,
        level: "debug",
      },
    })
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})

    const { createLogger } = await importFreshLogger({
      browserApi: storage.api,
    })

    const logger = createLogger("SanitizeRuntime")
    logger.info(404 as any, {
      bareUrl: "https://example.com/path?token=1#hash",
      big: 99n,
      sym: Symbol("runtime"),
      namedFn: function helperFn() {},
      when: new Date("2024-01-02T03:04:05.000Z"),
      endpoint: new URL("https://example.com/api?secret=1"),
      failure: new TypeError("boom"),
      entries: new Map<string, unknown>([
        ["alpha", 1],
        ["beta", "https://example.com/other?q=1"],
      ]),
      values: new Set(["first", "https://example.com/list?x=1"]),
    })

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Background][SanitizeRuntime] 404"),
      expect.objectContaining({
        bareUrl: "https://example.com/path",
        big: "99",
        sym: "Symbol(runtime)",
        namedFn: "[Function: helperFn]",
        when: "2024-01-02T03:04:05.000Z",
        endpoint: "https://example.com/api",
        failure: expect.objectContaining({
          name: "TypeError",
          message: "boom",
        }),
        entries: [
          ["alpha", 1],
          ["beta", "https://example.com/other"],
        ],
        values: ["first", "https://example.com/list"],
      }),
    )
  })

  it("quietly skips warn/error logs when their console sinks are unavailable", async () => {
    const storage = createPromiseStorageApi({
      logging: {
        consoleEnabled: true,
        level: "debug",
      },
    })

    const { createLogger } = await importFreshLogger({
      browserApi: storage.api,
    })

    ;(console as any).warn = undefined
    ;(console as any).error = undefined
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const logger = createLogger("NoSink")

    expect(() => logger.warn("warn sink missing")).not.toThrow()
    expect(() => logger.error("error sink missing")).not.toThrow()

    expect(logSpy).not.toHaveBeenCalled()
  })

  it("falls back to null when both promise and callback storage access fail", async () => {
    const storage = createCallbackStorageApi(null, { throws: true })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { createLogger, setLoggingPreferences } = await importFreshLogger({
      browserApi: storage.api,
    })

    setLoggingPreferences({
      consoleEnabled: true,
      level: "error",
    })
    createLogger("Fallback").error("storage failures do not break logging")

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[Background][Fallback] storage failures do not break logging",
      ),
    )
  })
})
