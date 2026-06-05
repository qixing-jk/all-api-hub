import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"

const defineContentScriptMock = vi.fn((config) => config)
const setupRedemptionAssistContentMock = vi.fn()
const setupWebAiApiCheckContentMock = vi.fn()
const setupContentMessageHandlersMock = vi.fn()
const setContentScriptContextMock = vi.fn()
const ensureContentI18nReadyMock = vi.fn()
const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
}
const storageGetMock = vi.fn()
const StorageMock = vi.fn(function Storage() {
  return {
    get: storageGetMock,
  }
})

vi.mock("@plasmohq/storage", () => ({
  Storage: StorageMock,
}))

vi.mock("wxt/utils/define-content-script", () => ({
  defineContentScript: defineContentScriptMock,
}))

vi.mock("~/entrypoints/content/redemptionAssist", () => ({
  setupRedemptionAssistContent: setupRedemptionAssistContentMock,
}))

vi.mock("~/entrypoints/content/webAiApiCheck", () => ({
  setupWebAiApiCheckContent: setupWebAiApiCheckContentMock,
}))

vi.mock("~/entrypoints/content/messageHandlers", () => ({
  setupContentMessageHandlers: setupContentMessageHandlersMock,
}))

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  setContentScriptContext: setContentScriptContextMock,
}))

vi.mock("~/utils/i18n/content", () => ({
  ensureContentI18nReady: ensureContentI18nReadyMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

describe("content entrypoint", () => {
  const addStorageChangedListenerMock = vi.fn()
  const removeStorageChangedListenerMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()

    defineContentScriptMock.mockClear()
    setupRedemptionAssistContentMock.mockReset()
    setupWebAiApiCheckContentMock.mockReset()
    setupContentMessageHandlersMock.mockReset()
    setupContentMessageHandlersMock.mockReturnValue(vi.fn())
    setContentScriptContextMock.mockReset()
    ensureContentI18nReadyMock.mockReset()
    ensureContentI18nReadyMock.mockResolvedValue(undefined)
    logger.debug.mockReset()
    logger.warn.mockReset()

    StorageMock.mockClear()
    storageGetMock.mockReset()
    addStorageChangedListenerMock.mockReset()
    removeStorageChangedListenerMock.mockReset()
    ;(globalThis as any).browser = {
      runtime: {
        id: "test-extension-id",
      },
      storage: {
        onChanged: {
          addListener: addStorageChangedListenerMock,
          removeListener: removeStorageChangedListenerMock,
        },
      },
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("syncs content feature listeners with stored preferences and storage updates", async () => {
    const initialPreferences = {
      redemptionAssist: {
        enabled: false,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: false },
        autoDetect: { enabled: true },
      },
    }
    const updatedPreferences = {
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: false },
      },
      webAiApiCheck: {
        enabled: false,
        contextMenu: { enabled: true },
        autoDetect: { enabled: true },
      },
    }

    const firstRedemptionCleanup = vi.fn()
    const secondRedemptionCleanup = vi.fn()
    const firstApiCheckCleanup = vi.fn()
    const secondApiCheckCleanup = vi.fn()

    setupRedemptionAssistContentMock
      .mockReturnValueOnce(firstRedemptionCleanup)
      .mockReturnValueOnce(secondRedemptionCleanup)
    setupWebAiApiCheckContentMock
      .mockReturnValueOnce(firstApiCheckCleanup)
      .mockReturnValueOnce(secondApiCheckCleanup)
    storageGetMock
      .mockResolvedValueOnce(initialPreferences)
      .mockResolvedValueOnce(initialPreferences)
      .mockResolvedValueOnce(updatedPreferences)

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()
    const ctx = { onInvalidated } as any

    await module.default.main(ctx)

    expect(setContentScriptContextMock).toHaveBeenCalledWith(ctx)
    expect(ensureContentI18nReadyMock).toHaveBeenCalledTimes(1)
    expect(setupContentMessageHandlersMock).toHaveBeenCalledTimes(1)
    expect(onInvalidated).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledWith({
        enableDetection: false,
        enableContextMenu: false,
      })
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledWith({
        enableDetection: true,
        enableContextMenu: false,
      })
    })

    const handleStorageChanged =
      addStorageChangedListenerMock.mock.calls[0]?.[0]
    expect(handleStorageChanged).toBeTypeOf("function")

    handleStorageChanged({}, "sync")
    expect(storageGetMock).toHaveBeenCalledTimes(1)

    handleStorageChanged(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: initialPreferences,
        },
      },
      "local",
    )

    await waitFor(() => expect(storageGetMock).toHaveBeenCalledTimes(2))
    expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
    expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)

    handleStorageChanged(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: updatedPreferences,
        },
      },
      "local",
    )

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(2)
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(2)
    })

    expect(setupRedemptionAssistContentMock).toHaveBeenLastCalledWith({
      enableDetection: true,
      enableContextMenu: false,
    })
    expect(setupWebAiApiCheckContentMock).toHaveBeenLastCalledWith({
      enableDetection: false,
      enableContextMenu: false,
    })

    expect(firstRedemptionCleanup).toHaveBeenCalledTimes(1)
    expect(firstApiCheckCleanup).toHaveBeenCalledTimes(1)

    const cleanup = onInvalidated.mock.calls[0]?.[0]
    expect(cleanup).toBeTypeOf("function")

    cleanup()

    expect(removeStorageChangedListenerMock).toHaveBeenCalledWith(
      handleStorageChanged,
    )
    expect(secondRedemptionCleanup).toHaveBeenCalledTimes(1)
    expect(secondApiCheckCleanup).toHaveBeenCalledTimes(1)
  })

  it("cleans up message handlers when the content context is invalidated", async () => {
    const cleanupMessageHandlers = vi.fn()
    const cleanupRedemption = vi.fn()
    const cleanupApiCheck = vi.fn()

    setupContentMessageHandlersMock.mockReturnValue(cleanupMessageHandlers)
    setupRedemptionAssistContentMock.mockReturnValue(cleanupRedemption)
    setupWebAiApiCheckContentMock.mockReturnValue(cleanupApiCheck)
    storageGetMock.mockResolvedValueOnce({
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: true },
        autoDetect: { enabled: true },
      },
    })

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()

    await module.default.main({ onInvalidated } as any)

    const cleanup = onInvalidated.mock.calls[0]?.[0]
    expect(cleanup).toBeTypeOf("function")

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)
    })

    cleanup()

    expect(cleanupMessageHandlers).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(cleanupRedemption).toHaveBeenCalledTimes(1)
      expect(cleanupApiCheck).toHaveBeenCalledTimes(1)
    })
  })

  it("falls back to default feature preferences when storage lookup fails", async () => {
    const redemptionCleanup = vi.fn()
    const apiCheckCleanup = vi.fn()

    setupRedemptionAssistContentMock.mockReturnValue(redemptionCleanup)
    setupWebAiApiCheckContentMock.mockReturnValue(apiCheckCleanup)
    storageGetMock.mockRejectedValueOnce(new Error("storage unavailable"))

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()

    await module.default.main({ onInvalidated } as any)

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledWith({
        enableDetection: true,
        enableContextMenu: true,
      })
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledWith({
        enableDetection: true,
        enableContextMenu: true,
      })
    })

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to read content feature preferences",
      expect.any(Error),
    )

    const cleanup = onInvalidated.mock.calls[0]?.[0]
    cleanup()

    expect(redemptionCleanup).toHaveBeenCalledTimes(1)
    expect(apiCheckCleanup).toHaveBeenCalledTimes(1)
  })

  it("logs and continues when content i18n initialization fails", async () => {
    const initError = new Error("i18n unavailable")

    ensureContentI18nReadyMock.mockRejectedValueOnce(initError)
    setupRedemptionAssistContentMock.mockReturnValue(vi.fn())
    setupWebAiApiCheckContentMock.mockReturnValue(vi.fn())
    storageGetMock.mockResolvedValueOnce({
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: true },
        autoDetect: { enabled: true },
      },
    })

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()

    await module.default.main({ onInvalidated } as any)

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        "Content i18n initialization failed",
        initError,
      )
    })
    expect(setupContentMessageHandlersMock).toHaveBeenCalledTimes(1)
    expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
    expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)

    onInvalidated.mock.calls[0]?.[0]()
  })

  it("ignores unrelated local storage changes that do not include user preferences", async () => {
    const preferences = {
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: false,
        contextMenu: { enabled: true },
        autoDetect: { enabled: false },
      },
    }

    setupRedemptionAssistContentMock.mockReturnValue(vi.fn())
    setupWebAiApiCheckContentMock.mockReturnValue(vi.fn())
    storageGetMock.mockResolvedValueOnce(preferences)

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()

    await module.default.main({ onInvalidated } as any)

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)
    })

    const handleStorageChanged =
      addStorageChangedListenerMock.mock.calls[0]?.[0]
    expect(handleStorageChanged).toBeTypeOf("function")

    handleStorageChanged(
      {
        unrelatedKey: {
          newValue: { enabled: false },
        },
      },
      "local",
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(storageGetMock).toHaveBeenCalledTimes(1)
    expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
    expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)

    onInvalidated.mock.calls[0]?.[0]()
  })

  it("ignores user-preference changes from non-local storage areas", async () => {
    const preferences = {
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: false,
        contextMenu: { enabled: true },
        autoDetect: { enabled: false },
      },
    }

    setupRedemptionAssistContentMock.mockReturnValue(vi.fn())
    setupWebAiApiCheckContentMock.mockReturnValue(vi.fn())
    storageGetMock.mockResolvedValueOnce(preferences)

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()

    await module.default.main({ onInvalidated } as any)

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)
    })

    const handleStorageChanged =
      addStorageChangedListenerMock.mock.calls[0]?.[0]
    expect(handleStorageChanged).toBeTypeOf("function")

    handleStorageChanged(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: {
            redemptionAssist: {
              enabled: false,
            },
          },
        },
      },
      "sync",
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(storageGetMock).toHaveBeenCalledTimes(1)
    expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
    expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)

    onInvalidated.mock.calls[0]?.[0]()
  })

  it("does not apply preferences after cleanup when a pending read resolves late", async () => {
    const onInvalidated = vi.fn()
    let resolveStorageRead:
      | ((value: Record<string, unknown>) => void)
      | undefined

    storageGetMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStorageRead = resolve
        }),
    )

    const module = await import("~/entrypoints/content/index")

    await module.default.main({ onInvalidated } as any)

    const handleStorageChanged =
      addStorageChangedListenerMock.mock.calls[0]?.[0]
    const cleanup = onInvalidated.mock.calls[0]?.[0]

    expect(handleStorageChanged).toBeTypeOf("function")
    expect(cleanup).toBeTypeOf("function")

    cleanup()

    resolveStorageRead?.({
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: true },
        autoDetect: { enabled: true },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(setupRedemptionAssistContentMock).not.toHaveBeenCalled()
    expect(setupWebAiApiCheckContentMock).not.toHaveBeenCalled()
    expect(removeStorageChangedListenerMock).toHaveBeenCalledWith(
      handleStorageChanged,
    )
  })

  it("applies only the latest overlapping preference refresh when storage updates race", async () => {
    const initialPreferences = {
      redemptionAssist: {
        enabled: false,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: false,
        contextMenu: { enabled: true },
        autoDetect: { enabled: false },
      },
    }
    const stalePreferences = {
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: true },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: true },
        autoDetect: { enabled: true },
      },
    }
    const latestPreferences = {
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: false },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: false },
        autoDetect: { enabled: true },
      },
    }

    const firstRedemptionCleanup = vi.fn()
    const secondRedemptionCleanup = vi.fn()
    const firstApiCheckCleanup = vi.fn()
    const secondApiCheckCleanup = vi.fn()
    let resolveStaleRead: ((value: Record<string, unknown>) => void) | undefined
    let resolveLatestRead:
      | ((value: Record<string, unknown>) => void)
      | undefined

    setupRedemptionAssistContentMock
      .mockReturnValueOnce(firstRedemptionCleanup)
      .mockReturnValueOnce(secondRedemptionCleanup)
    setupWebAiApiCheckContentMock
      .mockReturnValueOnce(firstApiCheckCleanup)
      .mockReturnValueOnce(secondApiCheckCleanup)

    storageGetMock
      .mockResolvedValueOnce(initialPreferences)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleRead = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLatestRead = resolve
          }),
      )

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()

    await module.default.main({ onInvalidated } as any)

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(1)
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(1)
    })

    const handleStorageChanged =
      addStorageChangedListenerMock.mock.calls[0]?.[0]
    expect(handleStorageChanged).toBeTypeOf("function")

    handleStorageChanged(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: stalePreferences,
        },
      },
      "local",
    )
    handleStorageChanged(
      {
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: {
          newValue: latestPreferences,
        },
      },
      "local",
    )

    await waitFor(() => {
      expect(storageGetMock).toHaveBeenCalledTimes(3)
    })

    resolveLatestRead?.(latestPreferences)

    await waitFor(() => {
      expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(2)
      expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(2)
    })

    expect(setupRedemptionAssistContentMock).toHaveBeenLastCalledWith({
      enableDetection: true,
      enableContextMenu: false,
    })
    expect(setupWebAiApiCheckContentMock).toHaveBeenLastCalledWith({
      enableDetection: true,
      enableContextMenu: false,
    })
    expect(firstRedemptionCleanup).toHaveBeenCalledTimes(1)
    expect(firstApiCheckCleanup).toHaveBeenCalledTimes(1)

    resolveStaleRead?.(stalePreferences)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(setupRedemptionAssistContentMock).toHaveBeenCalledTimes(2)
    expect(setupWebAiApiCheckContentMock).toHaveBeenCalledTimes(2)
    expect(secondRedemptionCleanup).not.toHaveBeenCalled()
    expect(secondApiCheckCleanup).not.toHaveBeenCalled()

    onInvalidated.mock.calls[0]?.[0]()

    expect(secondRedemptionCleanup).toHaveBeenCalledTimes(1)
    expect(secondApiCheckCleanup).toHaveBeenCalledTimes(1)
  })
})
