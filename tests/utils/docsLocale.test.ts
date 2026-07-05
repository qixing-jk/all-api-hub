import { afterEach, describe, expect, it, vi } from "vitest"

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
)
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
)

const restoreGlobals = () => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor)
  } else {
    delete (globalThis as any).window
  }

  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor)
  } else {
    delete (globalThis as any).navigator
  }
}

describe("docsLocale", () => {
  afterEach(() => {
    vi.doUnmock("~/utils/i18n/core")
    restoreGlobals()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("prefers the explicit language argument", async () => {
    const { getDocsLocalePath } = await import("~/utils/navigation/docsLocale")

    expect(getDocsLocalePath("ja-JP")).toBe("ja/")
  })

  it("falls back to the stored language when no explicit language is provided", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: vi.fn(() => "zh-CN"),
        },
      },
    })

    const { getDocsLocalePath } = await import("~/utils/navigation/docsLocale")

    expect(getDocsLocalePath()).toBe("")
  })

  it("falls back to i18n language when storage access throws", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: vi.fn(() => {
            throw new Error("blocked")
          }),
        },
      },
    })

    vi.doMock("~/utils/i18n/core", () => ({
      default: {
        isInitialized: true,
        language: "ja",
      },
    }))

    const { getDocsLocalePath } = await import("~/utils/navigation/docsLocale")

    expect(getDocsLocalePath()).toBe("ja/")
  })

  it("falls back to navigator language when neither explicit language nor i18n language is available", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: vi.fn(() => null),
        },
      },
    })
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        language: "en-US",
      },
    })

    vi.doMock("~/utils/i18n/core", () => ({
      default: {
        isInitialized: false,
        language: "",
      },
    }))

    const { getDocsLocalePath } = await import("~/utils/navigation/docsLocale")

    expect(getDocsLocalePath()).toBe("en/")
  })

  it("falls back to english docs for latin american spanish", async () => {
    const { getDocsLocalePath } = await import("~/utils/navigation/docsLocale")

    expect(getDocsLocalePath("es-419")).toBe("en/")
  })

  it("defaults to english when no language source is available", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: vi.fn(() => null),
        },
      },
    })
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    })

    vi.doMock("~/utils/i18n/core", () => ({
      default: {
        isInitialized: false,
        language: "",
      },
    }))

    const { getDocsLocalePath } = await import("~/utils/navigation/docsLocale")

    expect(getDocsLocalePath()).toBe("en/")
  })
})
