import { describe, expect, it, vi } from "vitest"

import { NATIVE_CHECK_IN_PAGE_SOURCES } from "~/services/checkin/discovery/evidence/scanTypes"
import {
  discoverNativeCheckInPage,
  exploreNativeCheckInPages,
} from "~/services/checkin/discovery/nativePageDiscovery"

describe("native check-in page fallback", () => {
  it("restores the original page before scanning after a stale hint and an unverified link", async () => {
    const pageUrl = "https://site.test/profile"
    let current = pageUrl
    const navigate = vi.fn(async (url: string) => {
      current = url
      if (url.endsWith("/stale")) throw new Error("Page was removed")
    })
    const scan = vi.fn(async () => {
      expect(current).toBe(pageUrl)
      return {
        candidates: [
          { path: "/daily", sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Script] },
        ],
        complete: true,
      }
    })
    expect(
      await discoverNativeCheckInPage({
        pageUrl,
        learnedPath: "/stale",
        navigate,
        inspect: async () => ({
          success: true,
          pageUrl: current,
          hasTarget: current.endsWith("/daily"),
          candidates: current === pageUrl ? ["/invite"] : [],
        }),
        scan,
      }),
    ).toBe("https://site.test/daily")
    expect(navigate.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/stale",
      "/profile",
      "/invite",
      "/profile",
      "/daily",
      "/profile",
      "/daily",
    ])
  })

  it("refuses a result when an alternative redirects off-site", async () => {
    const pageUrl = "https://site.test/profile"
    let current = pageUrl
    const found = await discoverNativeCheckInPage({
      pageUrl,
      navigate: async (url) => {
        current = url
      },
      inspect: async () => ({
        success: true,
        hasTarget: current !== pageUrl,
        pageUrl: current.endsWith("/external")
          ? "https://other.test/daily"
          : current,
        candidates: ["/external", "/daily"],
      }),
    })
    expect(found).toBeNull()
    expect(current).toBe(pageUrl)
  })

  it("refuses a unique page when another candidate has ambiguous native actions", async () => {
    let pageUrl = "https://site.test/profile"
    expect(
      await discoverNativeCheckInPage({
        pageUrl,
        navigate: async (url) => {
          pageUrl = url
        },
        inspect: async () => ({
          success: true,
          hasTarget: pageUrl.endsWith("/daily"),
          hasCheckInArea: pageUrl.endsWith("/invite"),
          hasAmbiguousTarget: pageUrl.endsWith("/invite"),
          candidates: ["/daily", "/invite"],
          pageUrl,
        }),
      }),
    ).toBeNull()
    expect(pageUrl).toBe("https://site.test/profile")
  })
  it("keeps a restored configured destination ahead of its learned fallback", async () => {
    let pageUrl = "https://site.test/configured"
    const navigate = vi.fn(async (url: string) => {
      pageUrl = url
    })
    expect(
      await discoverNativeCheckInPage({
        pageUrl,
        learnedPath: "/old-fallback",
        navigate,
        inspect: async () => ({
          success: true,
          hasTarget: true,
          candidates: [],
          pageUrl,
        }),
      }),
    ).toBe("https://site.test/configured")
    expect(navigate).not.toHaveBeenCalled()
  })
  it("revalidates a learned destination before scanning an oversized navigation set", async () => {
    let current = "https://site.test/broken"
    const navigate = vi.fn(async (url: string) => {
      current = url
    })
    const scan = vi.fn()
    const inspect = vi.fn(async () => ({
      success: true,
      hasTarget: current.endsWith("/invite"),
      candidates: ["/one", "/two", "/three", "/four"],
    }))
    expect(
      await discoverNativeCheckInPage({
        pageUrl: current,
        learnedPath: "/invite",
        navigate,
        inspect,
        scan,
      }),
    ).toBe("https://site.test/invite")
    expect(scan).not.toHaveBeenCalled()
    expect(inspect).toHaveBeenCalledTimes(2)
  })
  it("offers a checked page area for configuration without making it an execution target", async () => {
    const input = {
      pageUrl: "https://site.test/profile",
      navigate: vi.fn(),
      inspect: vi.fn(async () => ({
        success: true,
        hasTarget: false,
        hasCheckInArea: true,
        candidates: [],
      })),
      scan: vi.fn(),
    }
    expect(await exploreNativeCheckInPages(input)).toEqual({
      complete: true,
      candidates: [{ path: "/profile", sources: ["area"], state: "area" }],
    })
    expect(await discoverNativeCheckInPage(input)).toBeNull()
    expect(input.scan).not.toHaveBeenCalled()
    expect(input.navigate).not.toHaveBeenCalled()
  })
  it("verifies a script route when the current page has no action or navigation clue", async () => {
    let page = "https://site.test/broken"
    const navigate = vi.fn(async (url: string) => {
      page = url
    })
    const scan = vi.fn(async () => ({
      candidates: [
        { path: "/invite", sources: [NATIVE_CHECK_IN_PAGE_SOURCES.Script] },
      ],
      complete: true,
    }))
    const inspect = vi.fn(async () => ({
      success: true,
      hasTarget: page.endsWith("/invite"),
      candidates: [],
    }))
    expect(
      await discoverNativeCheckInPage({
        pageUrl: page,
        navigate,
        inspect,
        scan,
      }),
    ).toBe("https://site.test/invite")
    expect(scan).toHaveBeenCalledOnce()
  })
  it("restores the default page if inspecting an alternative throws", async () => {
    const navigate = vi.fn()
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        hasTarget: false,
        candidates: ["/daily"],
      })
      .mockRejectedValueOnce(new Error("Disconnected"))
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBeNull()
    expect(navigate).toHaveBeenLastCalledWith("https://site.test/profile")
  })
  it("does not choose a candidate from a truncated navigation scan", async () => {
    const navigate = vi.fn()
    const inspect = vi.fn().mockResolvedValue({
      success: true,
      hasTarget: false,
      candidates: ["/daily"],
      candidatesComplete: false,
    })
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
  it("keeps existing page behavior if an older content script cannot inspect", async () => {
    const navigate = vi.fn()
    const inspect = vi.fn().mockRejectedValue(new Error("No receiver"))
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBe("https://site.test/profile")
    expect(navigate).not.toHaveBeenCalled()
  })
  it("does not continue after cancellation during inspection", async () => {
    const controller = new AbortController()
    const navigate = vi.fn()
    const inspect = vi.fn(async () => {
      controller.abort()
      return { success: true, hasTarget: true, candidates: [] }
    })
    await expect(
      discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
        signal: controller.signal,
      }),
    ).rejects.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })
  it("restores the theme page when multiple candidate pages have actions", async () => {
    const navigate = vi.fn()
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        hasTarget: false,
        candidates: ["/invite", "/daily"],
      })
      .mockResolvedValue({ success: true, hasTarget: true, candidates: [] })
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBeNull()
    expect(navigate).toHaveBeenLastCalledWith("https://site.test/profile")
  })
  it("does not explore an incomplete candidate set or recursively follow links", async () => {
    const navigate = vi.fn()
    const inspect = vi.fn().mockResolvedValue({
      success: true,
      hasTarget: false,
      candidates: ["/one", "/two", "/three", "/four"],
    })
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
  it("retains the existing page when its inspection is unavailable", async () => {
    const navigate = vi.fn()
    const inspect = vi
      .fn()
      .mockResolvedValue({ success: false, hasTarget: false, candidates: [] })
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBe("https://site.test/profile")
    expect(navigate).not.toHaveBeenCalled()
  })
  it("uses the theme page without exploring candidates when its target exists", async () => {
    const navigate = vi.fn()
    const inspect = vi.fn().mockResolvedValue({
      success: true,
      hasTarget: true,
      candidates: ["/invite"],
    })
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBe("https://site.test/profile")
    expect(navigate).not.toHaveBeenCalled()
    expect(inspect).toHaveBeenCalledOnce()
  })
  it("falls back to the sole verified same-site candidate without saving a route", async () => {
    const navigate = vi.fn()
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        hasTarget: false,
        candidates: ["/invite", "https://other.test/rewards", "/daily"],
      })
      .mockResolvedValueOnce({ success: true, hasTarget: true, candidates: [] })
      .mockResolvedValueOnce({
        success: true,
        hasTarget: false,
        candidates: [],
      })
    expect(
      await discoverNativeCheckInPage({
        pageUrl: "https://site.test/profile",
        navigate,
        inspect,
      }),
    ).toBe("https://site.test/invite")
    expect(navigate.mock.calls.map(([url]) => url)).toEqual([
      "https://site.test/invite",
      "https://site.test/daily",
      "https://site.test/profile",
      "https://site.test/invite",
    ])
  })
})
