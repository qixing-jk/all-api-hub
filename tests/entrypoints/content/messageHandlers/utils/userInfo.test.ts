import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { loggerWarnMock, tMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  tMock: vi.fn((key: string) => key),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: vi.fn(),
  }),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string) => tMock(key),
}))

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value))
    }),
    get length() {
      return store.size
    },
  }
}

describe("waitForUserInfo", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("returns the parsed user as soon as a valid id appears", async () => {
    globalThis.localStorage.setItem(
      "user",
      JSON.stringify({ id: "user-1", name: "Primary User" }),
    )

    const { waitForUserInfo } = await import(
      "~/entrypoints/content/messageHandlers/utils/userInfo"
    )

    await expect(waitForUserInfo()).resolves.toEqual({
      userId: "user-1",
      user: { id: "user-1", name: "Primary User" },
    })
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it("normalizes numeric localStorage user ids to string identities", async () => {
    globalThis.localStorage.setItem(
      "user",
      JSON.stringify({ id: 42, name: "Numeric User" }),
    )

    const { waitForUserInfo } = await import(
      "~/entrypoints/content/messageHandlers/utils/userInfo"
    )

    await expect(waitForUserInfo()).resolves.toEqual({
      userId: "42",
      user: { id: 42, name: "Numeric User" },
    })
  })

  it("keeps polling after parse failures and incomplete payloads until a valid user appears", async () => {
    let attempts = 0
    vi.mocked(globalThis.localStorage.getItem).mockImplementation(
      (key: string) => {
        if (key !== "user") return null
        attempts += 1
        if (attempts === 1) return "{bad json"
        if (attempts === 2) {
          return JSON.stringify({ id: "", name: "Missing Id" })
        }
        return JSON.stringify({ id: "user-2", role: "admin" })
      },
    )

    const { waitForUserInfo } = await import(
      "~/entrypoints/content/messageHandlers/utils/userInfo"
    )

    const resultPromise = waitForUserInfo(350)

    await vi.advanceTimersByTimeAsync(200)

    await expect(resultPromise).resolves.toEqual({
      userId: "user-2",
      user: { id: "user-2", role: "admin" },
    })
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to parse localStorage user payload",
      expect.any(SyntaxError),
    )
  })

  it("rejects with the localized timeout message when no valid user becomes available", async () => {
    globalThis.localStorage.setItem(
      "user",
      JSON.stringify({ name: "Still Missing Id" }),
    )

    const { waitForUserInfo } = await import(
      "~/entrypoints/content/messageHandlers/utils/userInfo"
    )

    const resultPromise = waitForUserInfo(250)
    const rejectionExpectation = expect(resultPromise).rejects.toThrow(
      "messages:content.waitUserInfoTimeout",
    )

    await vi.advanceTimersByTimeAsync(300)

    await rejectionExpectation
    expect(tMock).toHaveBeenCalledWith("messages:content.waitUserInfoTimeout")
  })
})
