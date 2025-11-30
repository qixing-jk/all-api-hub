import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  joinUrl,
  navigateToAnchor,
  parseTabFromUrl,
  updateUrlWithTab
} from "~/utils/url"

describe("joinUrl", () => {
  it("should join base and path with single slash", () => {
    expect(joinUrl("https://example.com", "api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should remove trailing slash from base", () => {
    expect(joinUrl("https://example.com/", "api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should remove leading slash from path", () => {
    expect(joinUrl("https://example.com", "/api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should handle both trailing and leading slashes", () => {
    expect(joinUrl("https://example.com/", "/api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should handle multiple trailing slashes", () => {
    expect(joinUrl("https://example.com///", "api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should handle multiple leading slashes", () => {
    expect(joinUrl("https://example.com", "///api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should handle both multiple slashes", () => {
    expect(joinUrl("https://example.com///", "///api/users")).toBe(
      "https://example.com/api/users"
    )
  })

  it("should handle empty path", () => {
    expect(joinUrl("https://example.com", "")).toBe("https://example.com/")
  })

  it("should handle path with query parameters", () => {
    expect(joinUrl("https://example.com", "api?key=value")).toBe(
      "https://example.com/api?key=value"
    )
  })

  it("should handle path with hash", () => {
    expect(joinUrl("https://example.com", "page#section")).toBe(
      "https://example.com/page#section"
    )
  })

  it("should handle nested paths", () => {
    expect(joinUrl("https://example.com/api", "v1/users")).toBe(
      "https://example.com/api/v1/users"
    )
  })
})

describe("parseTabFromUrl", () => {
  beforeEach(() => {
    // Reset location mock before each test
    delete (window as any).location
    ;(window as any).location = {
      hash: "",
      search: "",
      href: "https://example.com"
    }
  })

  describe("Query parameter parsing", () => {
    it("should parse tab from query parameter", () => {
      window.location.search = "?tab=settings"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("settings")
      expect(result.anchor).toBeNull()
      expect(result.isHeadingAnchor).toBe(false)
    })

    it("should handle multiple query parameters", () => {
      window.location.search = "?page=1&tab=profile&sort=desc"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("profile")
    })

    it("should return null when no tab parameter", () => {
      window.location.search = "?page=1&sort=desc"
      const result = parseTabFromUrl()
      expect(result.tab).toBeNull()
    })
  })

  describe("Hash-based tab parsing", () => {
    it("should parse tab from hash with tab= prefix", () => {
      window.location.hash = "#tab=dashboard"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("dashboard")
    })

    it("should parse tab from hash query parameters", () => {
      window.location.hash = "#page?tab=settings"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("settings")
    })

    it("should prioritize search tab over hash tab", () => {
      window.location.search = "?tab=search-tab"
      window.location.hash = "#tab=hash-tab"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("search-tab")
    })
  })

  describe("Anchor parsing", () => {
    it("should detect heading anchor", () => {
      window.location.hash = "#section-heading"
      const result = parseTabFromUrl()
      expect(result.anchor).toBe("section-heading")
      expect(result.isHeadingAnchor).toBe(true)
    })

    it("should ignore anchors in ignoreAnchors list", () => {
      window.location.hash = "#ignored"
      const result = parseTabFromUrl({ ignoreAnchors: ["ignored"] })
      expect(result.anchor).toBeNull()
      expect(result.isHeadingAnchor).toBe(false)
    })

    it("should ignore defaultHashPage", () => {
      window.location.hash = "#home"
      const result = parseTabFromUrl({ defaultHashPage: "home" })
      expect(result.anchor).toBeNull()
      expect(result.isHeadingAnchor).toBe(false)
    })

    it("should not treat tab= pattern as anchor", () => {
      window.location.hash = "#tab=settings"
      const result = parseTabFromUrl()
      expect(result.anchor).toBeNull()
      expect(result.isHeadingAnchor).toBe(false)
    })

    it("should handle empty hash", () => {
      window.location.hash = ""
      const result = parseTabFromUrl()
      expect(result.anchor).toBeNull()
      expect(result.isHeadingAnchor).toBe(false)
    })

    it("should handle hash with only #", () => {
      window.location.hash = "#"
      const result = parseTabFromUrl()
      expect(result.anchor).toBeNull()
      expect(result.isHeadingAnchor).toBe(false)
    })
  })

  describe("Combined scenarios", () => {
    it("should handle tab in search and anchor in hash", () => {
      window.location.search = "?tab=settings"
      window.location.hash = "#security-section"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("settings")
      expect(result.anchor).toBe("security-section")
      expect(result.isHeadingAnchor).toBe(true)
    })

    it("should handle complex hash with tab and anchor", () => {
      window.location.hash = "#page?tab=advanced"
      const result = parseTabFromUrl()
      expect(result.tab).toBe("advanced")
      // "page" is treated as an anchor (heading ID) since it's in hashPath
      expect(result.anchor).toBe("page")
      expect(result.isHeadingAnchor).toBe(true)
    })

    it("should handle whitespace in hash", () => {
      window.location.hash = "#  section-id  "
      const result = parseTabFromUrl()
      expect(result.anchor).toBe("section-id")
      expect(result.isHeadingAnchor).toBe(true)
    })
  })
})

describe("updateUrlWithTab", () => {
  beforeEach(() => {
    delete (window as any).location
    delete (window as any).history
    ;(window as any).location = {
      href: "https://example.com/page",
      search: "",
      hash: ""
    }
    ;(window as any).history = {
      replaceState: vi.fn(),
      pushState: vi.fn()
    }
  })

  it("should add tab parameter to URL", () => {
    updateUrlWithTab("settings")
    expect(window.history.replaceState).toHaveBeenCalled()
    const call = vi.mocked(window.history.replaceState).mock.calls[0]
    const url = call[2] as string
    expect(url).toContain("tab=settings")
  })

  it("should use replaceState by default", () => {
    updateUrlWithTab("profile")
    expect(window.history.replaceState).toHaveBeenCalled()
    expect(window.history.pushState).not.toHaveBeenCalled()
  })

  it("should use pushState when replaceHistory is false", () => {
    updateUrlWithTab("profile", { replaceHistory: false })
    expect(window.history.pushState).toHaveBeenCalled()
    expect(window.history.replaceState).not.toHaveBeenCalled()
  })

  it("should add hash with hashPage option", () => {
    updateUrlWithTab("settings", { hashPage: "config" })
    const call = vi.mocked(window.history.replaceState).mock.calls[0]
    const url = call[2] as string
    expect(url).toContain("#config")
    expect(url).toContain("?tab=settings")
  })

  it("should preserve existing search parameters", () => {
    // Need to set full href for URL constructor to work properly
    ;(window.location as any).href = "https://example.com/page?page=1"
    ;(window.location as any).search = "?page=1"
    updateUrlWithTab("profile")
    const call = vi.mocked(window.history.replaceState).mock.calls[0]
    const url = call[2] as string
    expect(url).toContain("page=1")
    expect(url).toContain("tab=profile")
  })
})

describe("navigateToAnchor", () => {
  beforeEach(() => {
    delete (window as any).location
    delete (window as any).history
    delete (window as any).document
    ;(window as any).location = {
      href: "https://example.com/page",
      search: "",
      hash: ""
    }
    ;(window as any).history = {
      replaceState: vi.fn(),
      pushState: vi.fn()
    }

    const mockElement = {
      scrollIntoView: vi.fn()
    }

    ;(window as any).document = {
      getElementById: vi.fn(() => mockElement)
    }

    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should scroll to element by anchor", async () => {
    navigateToAnchor("section-id")

    // Wait for requestAnimationFrame and setTimeout
    await vi.runAllTimersAsync()

    const mockElement = document.getElementById("section-id")
    expect(mockElement?.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    })
  })

  it("should update tab before scrolling", async () => {
    navigateToAnchor("section-id", "settings")

    await vi.runAllTimersAsync()

    expect(window.history.replaceState).toHaveBeenCalled()
    const mockElement = document.getElementById("section-id")
    expect(mockElement?.scrollIntoView).toHaveBeenCalled()
  })

  it("should handle custom delay", async () => {
    navigateToAnchor("section-id", undefined, { delay: 500 })

    // Advance by 100ms - should not scroll yet
    await vi.advanceTimersByTimeAsync(100)
    let mockElement = document.getElementById("section-id")
    expect(mockElement?.scrollIntoView).not.toHaveBeenCalled()

    // Advance remaining time
    await vi.runAllTimersAsync()
    mockElement = document.getElementById("section-id")
    expect(mockElement?.scrollIntoView).toHaveBeenCalled()
  })

  it("should handle hashPage option with tab", async () => {
    navigateToAnchor("section-id", "settings", { hashPage: "config" })

    await vi.runAllTimersAsync()

    expect(window.history.replaceState).toHaveBeenCalled()
    const call = vi.mocked(window.history.replaceState).mock.calls[0]
    const url = call[2] as string
    expect(url).toContain("#config")
    expect(url).toContain("?tab=settings")
  })

  it("should handle element not found gracefully", async () => {
    ;(document.getElementById as any).mockReturnValue(null)

    expect(() => {
      navigateToAnchor("non-existent")
    }).not.toThrow()

    await vi.runAllTimersAsync()
  })

  it("should not update tab if tab parameter is undefined", async () => {
    navigateToAnchor("section-id")

    await vi.runAllTimersAsync()

    expect(window.history.replaceState).not.toHaveBeenCalled()
  })
})
