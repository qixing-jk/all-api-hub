import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  handleTempWindowFetch: vi.fn(),
  handleTempWindowGetRenderedTitle: vi.fn(),
}))

vi.mock("~/services/ldohSiteLookup/cache", () => ({
  writeLdohSiteListCache: vi.fn(),
}))

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/utils/protectionBypass", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/protectionBypass")>()
  return {
    ...actual,
    isProtectionBypassFirefoxEnv: () => false,
  }
})

vi.mock("~/services/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/userPreferences")>()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: vi.fn(),
    },
  }
})

describe("ldohSiteLookup background refresh", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("does not invoke temp-window fallback for HTTP 401", async () => {
    vi.resetModules()

    const { userPreferences } = await import("~/services/userPreferences")
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
        tempContextMode: "composite",
      },
    })

    const { sendRuntimeMessage } = await import("~/utils/browserApi")
    vi.mocked(sendRuntimeMessage).mockImplementation(() => {
      throw new Error("temp-window fallback invoked")
    })

    const { writeLdohSiteListCache } = await import(
      "~/services/ldohSiteLookup/cache"
    )
    const { refreshLdohSiteListCache } = await import(
      "~/services/ldohSiteLookup/background"
    )

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })) as any,
    )

    const result = await refreshLdohSiteListCache()

    expect(result.success).toBe(false)
    expect((result as any).unauthenticated).toBe(true)
    expect(vi.mocked(sendRuntimeMessage)).not.toHaveBeenCalled()
    expect(vi.mocked(writeLdohSiteListCache)).not.toHaveBeenCalled()
  })

  it("does not invoke temp-window fallback for HTTP 429", async () => {
    vi.resetModules()

    const { userPreferences } = await import("~/services/userPreferences")
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
        tempContextMode: "composite",
      },
    })

    const { sendRuntimeMessage } = await import("~/utils/browserApi")
    vi.mocked(sendRuntimeMessage).mockImplementation(() => {
      throw new Error("temp-window fallback invoked")
    })

    const { writeLdohSiteListCache } = await import(
      "~/services/ldohSiteLookup/cache"
    )
    const { refreshLdohSiteListCache } = await import(
      "~/services/ldohSiteLookup/background"
    )

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 429 })) as any,
    )

    const result = await refreshLdohSiteListCache()

    expect(result.success).toBe(false)
    expect((result as any).unauthenticated).toBeUndefined()
    expect(vi.mocked(sendRuntimeMessage)).not.toHaveBeenCalled()
    expect(vi.mocked(writeLdohSiteListCache)).not.toHaveBeenCalled()
  })

  it("invokes temp-window fallback for HTTP 403", async () => {
    vi.resetModules()

    const { userPreferences } = await import("~/services/userPreferences")
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
        tempContextMode: "composite",
      },
    })

    const { sendRuntimeMessage } = await import("~/utils/browserApi")
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      status: 200,
      data: {
        success: true,
        message: "ok",
        data: {
          sites: [{ id: "site-1", apiBaseUrl: "https://api.example.com" }],
        },
      },
    })

    const { writeLdohSiteListCache } = await import(
      "~/services/ldohSiteLookup/cache"
    )
    vi.mocked(writeLdohSiteListCache).mockResolvedValue({
      version: 1,
      fetchedAt: 1,
      expiresAt: 2,
      items: [{ id: "site-1", apiBaseUrl: "https://api.example.com" }],
    })

    const { refreshLdohSiteListCache } = await import(
      "~/services/ldohSiteLookup/background"
    )

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 403 })) as any,
    )

    const result = await refreshLdohSiteListCache()

    expect(result.success).toBe(true)
    expect((result as any).cachedCount).toBe(1)

    expect(vi.mocked(sendRuntimeMessage)).toHaveBeenCalled()
    const call = vi.mocked(sendRuntimeMessage).mock.calls[0]?.[0] as any
    expect(call?.action).toBe(RuntimeActionIds.TempWindowFetch)

    expect(vi.mocked(writeLdohSiteListCache)).toHaveBeenCalledWith([
      { id: "site-1", apiBaseUrl: "https://api.example.com" },
    ])
  })
})
