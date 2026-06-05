import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_STORAGE_KEYS } from "~/services/accounts/accountStorage"

const {
  mockGetAllAccounts,
  mockCheckCookieInterceptorRequirement,
  mockRegisterWebRequestInterceptor,
  mockSetupWebRequestInterceptor,
  mockOnPermissionsAdded,
  mockOnPermissionsRemoved,
  mockLogger,
} = vi.hoisted(() => ({
  mockGetAllAccounts: vi.fn(),
  mockCheckCookieInterceptorRequirement: vi.fn(),
  mockRegisterWebRequestInterceptor: vi.fn(),
  mockSetupWebRequestInterceptor: vi.fn(),
  mockOnPermissionsAdded: vi.fn(),
  mockOnPermissionsRemoved: vi.fn(),
  mockLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/accounts/accountStorage", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/services/accounts/accountStorage")

  return {
    ...actual,
    accountStorage: {
      ...actual.accountStorage,
      getAllAccounts: mockGetAllAccounts,
    },
  }
})

vi.mock("~/utils/browser/cookieHelper", () => ({
  checkCookieInterceptorRequirement: mockCheckCookieInterceptorRequirement,
  registerWebRequestInterceptor: mockRegisterWebRequestInterceptor,
  setupWebRequestInterceptor: mockSetupWebRequestInterceptor,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/utils/browser/browserApi")

  return {
    ...actual,
    onPermissionsAdded: mockOnPermissionsAdded,
    onPermissionsRemoved: mockOnPermissionsRemoved,
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => mockLogger),
}))

const storageChangeListeners: Array<
  (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => Promise<void> | void
> = []
const permissionAddedListeners: Array<() => Promise<void> | void> = []
const permissionRemovedListeners: Array<() => Promise<void> | void> = []

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("cookieInterceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.useRealTimers()

    storageChangeListeners.length = 0
    permissionAddedListeners.length = 0
    permissionRemovedListeners.length = 0

    mockCheckCookieInterceptorRequirement.mockResolvedValue(true)
    mockGetAllAccounts.mockResolvedValue([])
    mockOnPermissionsAdded.mockImplementation((listener) => {
      permissionAddedListeners.push(listener)
      return vi.fn()
    })
    mockOnPermissionsRemoved.mockImplementation((listener) => {
      permissionRemovedListeners.push(listener)
      return vi.fn()
    })

    vi.stubGlobal("browser", {
      storage: {
        onChanged: {
          addListener: vi.fn((listener) => {
            storageChangeListeners.push(listener)
          }),
          removeListener: vi.fn(),
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("skips initialization when cookie interception is not required", async () => {
    mockCheckCookieInterceptorRequirement.mockResolvedValue(false)

    const { initializeCookieInterceptors } = await import(
      "~/entrypoints/background/cookieInterceptor"
    )

    await initializeCookieInterceptors()

    expect(mockGetAllAccounts).not.toHaveBeenCalled()
    expect(mockSetupWebRequestInterceptor).not.toHaveBeenCalled()
  })

  it("initializes with deduped valid account origins and ignores invalid URLs", async () => {
    mockGetAllAccounts.mockResolvedValue([
      {
        site_name: "Alpha",
        site_url: "https://alpha.example.com/path",
      },
      {
        site_name: "Alpha Duplicate",
        site_url: "https://alpha.example.com/other",
      },
      {
        site_name: "Broken",
        site_url: "not-a-url",
      },
    ])

    const { initializeCookieInterceptors } = await import(
      "~/entrypoints/background/cookieInterceptor"
    )

    await initializeCookieInterceptors()

    expect(mockSetupWebRequestInterceptor).toHaveBeenCalledWith([
      "https://alpha.example.com/*",
    ])
    expect(mockLogger.warn).toHaveBeenCalledWith("账户 URL 无效", {
      siteName: "Broken",
      url: "not-a-url",
    })
  })

  it("tracks temporary origins, ignores blank or invalid URLs, and removes expired patterns", async () => {
    vi.useFakeTimers()
    mockGetAllAccounts.mockResolvedValue([
      {
        site_name: "Saved",
        site_url: "https://saved.example.com/account",
      },
    ])

    const { trackCookieInterceptorUrl } = await import(
      "~/entrypoints/background/cookieInterceptor"
    )

    await trackCookieInterceptorUrl("", 5)
    await trackCookieInterceptorUrl("invalid-url", 5)

    expect(mockRegisterWebRequestInterceptor).not.toHaveBeenCalled()

    await trackCookieInterceptorUrl("https://temp.example.com/page", 5)

    expect(mockRegisterWebRequestInterceptor).toHaveBeenNthCalledWith(1, [
      "https://saved.example.com/*",
      "https://temp.example.com/*",
    ])

    await vi.runAllTimersAsync()

    expect(mockRegisterWebRequestInterceptor).toHaveBeenNthCalledWith(2, [
      "https://saved.example.com/*",
    ])
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Temporary cookie interceptor pattern tracked",
      {
        pattern: "https://temp.example.com/*",
        ttlMs: 5,
      },
    )
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Temporary cookie interceptor pattern expired",
      {
        pattern: "https://temp.example.com/*",
      },
    )
  })

  it("refreshes only when storage patterns or permissions require it", async () => {
    mockGetAllAccounts.mockResolvedValue([
      {
        site_name: "Refreshed",
        site_url: "https://refresh.example.com/a",
      },
    ])

    const { setupCookieInterceptorListeners } = await import(
      "~/entrypoints/background/cookieInterceptor"
    )

    setupCookieInterceptorListeners()

    expect(storageChangeListeners).toHaveLength(1)
    expect(permissionAddedListeners).toHaveLength(1)
    expect(permissionRemovedListeners).toHaveLength(1)

    mockCheckCookieInterceptorRequirement.mockResolvedValueOnce(false)
    await storageChangeListeners[0]?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: { accounts: [] },
          newValue: { accounts: [{ site_url: "https://ignored.example.com" }] },
        },
      } as Record<string, browser.storage.StorageChange>,
      "local",
    )
    expect(mockRegisterWebRequestInterceptor).not.toHaveBeenCalled()

    mockCheckCookieInterceptorRequirement.mockResolvedValueOnce(true)
    await storageChangeListeners[0]?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: { accounts: [{ site_url: "https://same.example.com/a" }] },
          newValue: { accounts: [{ site_url: "https://same.example.com/b" }] },
        },
      } as Record<string, browser.storage.StorageChange>,
      "local",
    )
    await flushMicrotasks()
    expect(mockRegisterWebRequestInterceptor).not.toHaveBeenCalled()

    mockCheckCookieInterceptorRequirement.mockResolvedValueOnce(true)
    await storageChangeListeners[0]?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: "{",
          newValue: {
            accounts: [
              { site_url: "https://changed.example.com/path" },
              { site_url: "invalid-url" },
            ],
          },
        },
      } as Record<string, browser.storage.StorageChange>,
      "local",
    )
    await flushMicrotasks()

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "解析变更数据失败",
      expect.any(SyntaxError),
    )
    expect(mockLogger.warn).toHaveBeenCalledWith("无效的 URL", {
      url: "invalid-url",
    })
    expect(mockLogger.info).toHaveBeenCalledWith(
      "账户 URL 已变更，正在更新拦截器",
    )
    expect(mockRegisterWebRequestInterceptor).toHaveBeenCalledWith([
      "https://refresh.example.com/*",
    ])

    await permissionAddedListeners[0]?.()
    await permissionRemovedListeners[0]?.()

    expect(mockRegisterWebRequestInterceptor).toHaveBeenCalledTimes(3)
  })
})
