import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  LDOH_ORIGIN,
  LDOH_SITES_ENDPOINT,
} from "~/services/integrations/ldohSiteLookup/constants"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { server } from "~/tests/msw/server"
import { buildTempWindowPrefs } from "~/tests/test-utils/factories"

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  handleTempWindowFetch: vi.fn(),
  handleTempWindowGetRenderedTitle: vi.fn(),
}))

vi.mock("~/services/integrations/ldohSiteLookup/cache", () => ({
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

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: vi.fn(),
    },
  }
})

describe("ldohSiteLookup background refresh", () => {
  const ldohSitesUrl = `${LDOH_ORIGIN}${LDOH_SITES_ENDPOINT}`

  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("does not invoke temp-window fallback for HTTP 401", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      tempWindowFallback: buildTempWindowPrefs(),
    })

    const { sendRuntimeMessage } = await import("~/utils/browserApi")
    vi.mocked(sendRuntimeMessage).mockImplementation(() => {
      throw new Error("temp-window fallback invoked")
    })

    const { writeLdohSiteListCache } = await import(
      "~/services/integrations/ldohSiteLookup/cache"
    )
    const { refreshLdohSiteListCache } = await import(
      "~/services/integrations/ldohSiteLookup/background"
    )

    server.use(
      http.get(ldohSitesUrl, () => {
        return new HttpResponse("", { status: 401 })
      }),
    )

    const result = await refreshLdohSiteListCache()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.unauthenticated).toBe(true)
    }
    expect(vi.mocked(sendRuntimeMessage)).not.toHaveBeenCalled()
    expect(vi.mocked(writeLdohSiteListCache)).not.toHaveBeenCalled()
  })

  it("does not invoke temp-window fallback for HTTP 429", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      tempWindowFallback: buildTempWindowPrefs(),
    })

    const { sendRuntimeMessage } = await import("~/utils/browserApi")
    vi.mocked(sendRuntimeMessage).mockImplementation(() => {
      throw new Error("temp-window fallback invoked")
    })

    const { writeLdohSiteListCache } = await import(
      "~/services/integrations/ldohSiteLookup/cache"
    )
    const { refreshLdohSiteListCache } = await import(
      "~/services/integrations/ldohSiteLookup/background"
    )

    server.use(
      http.get(ldohSitesUrl, () => {
        return new HttpResponse("", { status: 429 })
      }),
    )

    const result = await refreshLdohSiteListCache()

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.unauthenticated).toBeUndefined()
    }
    expect(vi.mocked(sendRuntimeMessage)).not.toHaveBeenCalled()
    expect(vi.mocked(writeLdohSiteListCache)).not.toHaveBeenCalled()
  })

  it("invokes temp-window fallback for HTTP 403", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      tempWindowFallback: buildTempWindowPrefs(),
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
      "~/services/integrations/ldohSiteLookup/cache"
    )
    vi.mocked(writeLdohSiteListCache).mockResolvedValue({
      version: 1,
      fetchedAt: 1,
      expiresAt: 2,
      items: [{ id: "site-1", apiBaseUrl: "https://api.example.com" }],
    })

    const { refreshLdohSiteListCache } = await import(
      "~/services/integrations/ldohSiteLookup/background"
    )

    server.use(
      http.get(ldohSitesUrl, () => {
        return new HttpResponse("", { status: 403 })
      }),
    )

    const result = await refreshLdohSiteListCache()

    expect(result.success).toBe(true)
    if (result.success === true) {
      expect(result.cachedCount).toBe(1)
    }

    expect(vi.mocked(sendRuntimeMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ action: RuntimeActionIds.TempWindowFetch }),
    )

    expect(vi.mocked(writeLdohSiteListCache)).toHaveBeenCalledWith([
      { id: "site-1", apiBaseUrl: "https://api.example.com" },
    ])
  })
})
