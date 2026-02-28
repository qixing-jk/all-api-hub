import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn(),
  },
}))

const originalBrowser = (globalThis as any).browser

describe("background context menu refresh", () => {
  const listeners: Array<(info: any, tab: any) => unknown> = []

  const contextMenusCreate = vi.fn()
  const contextMenusRemove = vi.fn().mockResolvedValue(undefined)
  const contextMenusAddListener = vi.fn(
    (listener: (info: any, tab: any) => unknown) => {
      listeners.push(listener)
    },
  )
  const tabsSendMessage = vi.fn().mockResolvedValue(undefined)

  vi.stubGlobal("browser", {
    contextMenus: {
      create: contextMenusCreate,
      remove: contextMenusRemove,
      onClicked: {
        addListener: contextMenusAddListener,
      },
    },
    tabs: {
      sendMessage: tabsSendMessage,
    },
    i18n: {
      getMessage: vi.fn(() => undefined),
    },
  })

  beforeEach(() => {
    vi.resetModules()
    listeners.length = 0
    contextMenusCreate.mockClear()
    contextMenusRemove.mockClear()
    contextMenusAddListener.mockClear()
    tabsSendMessage.mockClear()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    ;(globalThis as any).browser = originalBrowser
  })

  it("creates both context menu entries by default", async () => {
    const { refreshContextMenus } = await import(
      "~/entrypoints/background/contextMenus"
    )

    await refreshContextMenus({
      redemptionAssist: { enabled: true, contextMenu: { enabled: true } },
      webAiApiCheck: { enabled: true, contextMenu: { enabled: true } },
    } as any)

    expect(contextMenusCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "redemption-assist-context-menu" }),
    )
    expect(contextMenusCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ai-api-check-context-menu" }),
    )
  })

  it("skips AI API Check menu creation when visibility is disabled", async () => {
    const { refreshContextMenus } = await import(
      "~/entrypoints/background/contextMenus"
    )

    await refreshContextMenus({
      redemptionAssist: { enabled: true, contextMenu: { enabled: true } },
      webAiApiCheck: { enabled: true, contextMenu: { enabled: false } },
    } as any)

    expect(contextMenusCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "redemption-assist-context-menu" }),
    )
    expect(contextMenusCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "ai-api-check-context-menu" }),
    )
  })

  it("keeps click handling idempotent across multiple refreshes", async () => {
    const { refreshContextMenus } = await import(
      "~/entrypoints/background/contextMenus"
    )

    const preferences = {
      redemptionAssist: { enabled: true, contextMenu: { enabled: true } },
      webAiApiCheck: { enabled: true, contextMenu: { enabled: true } },
    }

    await refreshContextMenus(preferences as any)
    await refreshContextMenus(preferences as any)

    expect(listeners).toHaveLength(1)

    const clickInfo = {
      menuItemId: "ai-api-check-context-menu",
      selectionText: "sk-test",
      pageUrl: "https://example.com",
    }
    const tab = { id: 123, url: "https://example.com" }

    await Promise.all(listeners.map((listener) => listener(clickInfo, tab)))

    expect(tabsSendMessage).toHaveBeenCalledTimes(1)
    expect(tabsSendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        action: RuntimeActionIds.ApiCheckContextMenuTrigger,
      }),
    )
  })
})
