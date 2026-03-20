import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"

const defineContentScriptMock = vi.fn((config) => config)
const setupRedemptionAssistContentMock = vi.fn()
const setupWebAiApiCheckContentMock = vi.fn()
const setupContentMessageHandlersMock = vi.fn()
const setContentScriptContextMock = vi.fn()
const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
}

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

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

describe("content entrypoint", () => {
  const storageGetMock = vi.fn()
  const addStorageChangedListenerMock = vi.fn()
  const removeStorageChangedListenerMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()

    defineContentScriptMock.mockClear()
    setupRedemptionAssistContentMock.mockReset()
    setupWebAiApiCheckContentMock.mockReset()
    setupContentMessageHandlersMock.mockReset()
    setContentScriptContextMock.mockReset()
    logger.debug.mockReset()
    logger.warn.mockReset()

    storageGetMock.mockReset()
    addStorageChangedListenerMock.mockReset()
    removeStorageChangedListenerMock.mockReset()
    ;(globalThis as any).browser = {
      runtime: {
        id: "test-extension-id",
      },
      storage: {
        local: {
          get: storageGetMock,
        },
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
      .mockResolvedValueOnce({
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: initialPreferences,
      })
      .mockResolvedValueOnce({
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: initialPreferences,
      })
      .mockResolvedValueOnce({
        [USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]: updatedPreferences,
      })

    const module = await import("~/entrypoints/content/index")
    const onInvalidated = vi.fn()
    const ctx = { onInvalidated } as any

    await module.default.main(ctx)

    expect(setContentScriptContextMock).toHaveBeenCalledWith(ctx)
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
        enableDetection: false,
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
})
