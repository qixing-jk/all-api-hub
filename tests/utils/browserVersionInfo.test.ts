import { afterEach, describe, expect, it, vi } from "vitest"

import { getBrowserVersionInfo } from "~/utils/browser/userAgent"

afterEach(() => vi.unstubAllGlobals())

describe("browser version information", () => {
  it("marks a client-hint value that contains only the major version", async () => {
    vi.stubGlobal("browser", { runtime: {} })
    vi.stubGlobal("navigator", {
      userAgent: "Chrome/130.0.0.0",
      userAgentData: {
        getHighEntropyValues: vi.fn().mockResolvedValue({
          fullVersionList: [{ brand: "Google Chrome", version: "130" }],
        }),
      },
    })
    expect(await getBrowserVersionInfo()).toBe(
      "Chrome 130 (major version only)",
    )
  })

  it.each(["withheld", "engine-only"])(
    "keeps Edge's reported major version when hints are %s",
    async (mode) => {
      vi.stubGlobal("browser", { runtime: {} })
      vi.stubGlobal("navigator", {
        userAgent: "Chrome/130.0.0.0 Edg/130.0.0.0",
        userAgentData: {
          getHighEntropyValues:
            mode === "withheld"
              ? vi.fn().mockRejectedValue(new Error("denied"))
              : vi.fn().mockResolvedValue({
                  fullVersionList: [
                    { brand: "Chromium", version: "130.0.6723.91" },
                  ],
                }),
        },
      })
      expect(await getBrowserVersionInfo()).toBe(
        "Microsoft Edge 130 (major version only)",
      )
    },
  )

  it("returns no browser information when APIs and user agent are unavailable", async () => {
    vi.stubGlobal("browser", undefined)
    vi.stubGlobal("navigator", undefined)
    expect(await getBrowserVersionInfo()).toBeUndefined()
  })
  it("reads the Chromium product's full version from client hints instead of its reduced UA", async () => {
    vi.stubGlobal("browser", { runtime: {} })
    const getHighEntropyValues = vi.fn().mockResolvedValue({
      fullVersionList: [
        { brand: "Not A(Brand", version: "99" },
        { brand: "Chromium", version: "130.0.6723.91" },
        { brand: "Microsoft Edge", version: "130.0.2849.46" },
      ],
    })
    vi.stubGlobal("navigator", {
      userAgent: "Chrome/130.0.0.0 Edg/130.0.0.0",
      userAgentData: { getHighEntropyValues },
    })
    expect(await getBrowserVersionInfo()).toBe("Microsoft Edge 130.0.2849.46")
    expect(getHighEntropyValues).toHaveBeenCalledWith(["fullVersionList"])
  })
  it("uses Firefox runtime metadata without copying the full user agent", async () => {
    vi.stubGlobal("browser", {
      runtime: {
        getBrowserInfo: vi.fn().mockResolvedValue({
          name: "Firefox",
          version: "132.0.2",
          vendor: "Mozilla",
          buildID: "private-build",
        }),
      },
    })
    vi.stubGlobal("navigator", { userAgent: "private-platform Firefox/132.0" })
    expect(await getBrowserVersionInfo()).toBe("Firefox 132.0.2")
  })

  it.each([
    ["private-platform Firefox/132.0", "Firefox 132.0"],
    [
      "Chrome/130.0.0.0 Edg/130.0.0.0",
      "Microsoft Edge 130 (major version only)",
    ],
    ["Chrome/130.0.0.0", "Chrome 130 (major version only)"],
    ["Chrome/130.0.6723.91", "Chrome 130.0.6723.91"],
    ["Chrome/130.0.0.0 OPR/115.0.5322.68", "Opera 115.0.5322.68"],
    ["Version/18.1 Safari/605.1.15", "Safari 18.1"],
    ["UnknownBrowser/1.0", undefined],
  ])(
    "falls back to exposed UA version without inventing precision: %s",
    async (userAgent, expected) => {
      vi.stubGlobal("browser", {
        runtime: {
          getBrowserInfo: vi.fn().mockRejectedValue(new Error("unsupported")),
        },
      })
      vi.stubGlobal("navigator", { userAgent })
      expect(await getBrowserVersionInfo()).toBe(expected)
    },
  )
})
