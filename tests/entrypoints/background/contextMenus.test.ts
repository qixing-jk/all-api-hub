import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const { startProductAnalyticsActionMock, trackerCompleteMock } = vi.hoisted(
  () => ({
    startProductAnalyticsActionMock: vi.fn(),
    trackerCompleteMock: vi.fn(),
  }),
)

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

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
    startProductAnalyticsActionMock.mockReset()
    trackerCompleteMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackerCompleteMock,
    })
    trackerCompleteMock.mockResolvedValue(undefined)
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.TriggerApiCredentialCheckFromContextMenu,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith()
  })

  it("reports a skipped redemption context-menu action when no text is selected", async () => {
    const { refreshContextMenus } = await import(
      "~/entrypoints/background/contextMenus"
    )

    await refreshContextMenus({
      redemptionAssist: { enabled: true, contextMenu: { enabled: true } },
      webAiApiCheck: { enabled: true, contextMenu: { enabled: true } },
    } as any)

    await Promise.all(
      listeners.map((listener) =>
        listener(
          {
            menuItemId: "redemption-assist-context-menu",
            selectionText: "   ",
            pageUrl: "https://example.com",
          },
          { id: 123, url: "https://example.com" },
        ),
      ),
    )

    expect(tabsSendMessage).not.toHaveBeenCalled()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.TriggerRedemptionAssistFromContextMenu,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
  })

  it("reports a failed AI API Check context-menu action when forwarding fails", async () => {
    tabsSendMessage.mockRejectedValueOnce(new Error("content unavailable"))
    const { refreshContextMenus } = await import(
      "~/entrypoints/background/contextMenus"
    )

    await refreshContextMenus({
      redemptionAssist: { enabled: true, contextMenu: { enabled: true } },
      webAiApiCheck: { enabled: true, contextMenu: { enabled: true } },
    } as any)

    await Promise.all(
      listeners.map((listener) =>
        listener(
          {
            menuItemId: "ai-api-check-context-menu",
            selectionText: "sk-test",
            pageUrl: "https://example.com",
          },
          { id: 123, url: "https://example.com" },
        ),
      ),
    )

    expect(tabsSendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        action: RuntimeActionIds.ApiCheckContextMenuTrigger,
      }),
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.TriggerApiCredentialCheckFromContextMenu,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("does not classify tracker completion failures as forwarding failures", async () => {
    trackerCompleteMock.mockRejectedValueOnce(
      new Error("analytics unavailable"),
    )
    const { refreshContextMenus } = await import(
      "~/entrypoints/background/contextMenus"
    )

    await refreshContextMenus({
      redemptionAssist: { enabled: true, contextMenu: { enabled: true } },
      webAiApiCheck: { enabled: true, contextMenu: { enabled: true } },
    } as any)

    await Promise.all(
      listeners.map((listener) =>
        listener(
          {
            menuItemId: "ai-api-check-context-menu",
            selectionText: "sk-test",
            pageUrl: "https://example.com",
          },
          { id: 123, url: "https://example.com" },
        ),
      ),
    )

    expect(tabsSendMessage).toHaveBeenCalledTimes(1)
    expect(trackerCompleteMock).toHaveBeenCalledTimes(1)
    expect(trackerCompleteMock).toHaveBeenCalledWith()
  })
})
