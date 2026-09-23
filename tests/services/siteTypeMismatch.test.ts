import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { checkSiteTypeMismatch } from "~/services/siteDetection/siteTypeMismatch"
import { server } from "~~/tests/msw/server"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()

  return {
    ...actual,
    canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
    tempWindowFetch: vi.fn(),
  }
})

describe("checkSiteTypeMismatch", () => {
  const addDefaultUnsupportedProtectedProbeHandlers = () => {
    server.use(
      http.get(/\/api\/user\/info$/, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
      http.get(/\/api\/v1\/auth\/me$/, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
      http.get(/\/api\/status$/, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    )
  }

  const serveShellTitle = (origin: string, title: string) =>
    http.get(origin, () =>
      HttpResponse.html(`<html><title>${title}</title></html>`),
    )

  const serveStatusName = (origin: string, systemName: string) =>
    http.get(`${origin}/api/status`, () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: { system_name: systemName },
      }),
    )

  beforeEach(() => {
    server.resetHandlers()
    addDefaultUnsupportedProtectedProbeHandlers()
  })

  it("reports the type the site itself resolves to when it differs from the stored type", async () => {
    server.use(
      // A stock shell title that the stored type agrees with.
      serveShellTitle("https://example.com", "New API"),
      // The site brands itself as another registered type.
      serveStatusName("https://example.com", "Veloera"),
    )

    await expect(
      checkSiteTypeMismatch({
        siteUrl: "https://example.com",
        storedSiteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({
      outcome: "mismatch",
      mismatch: {
        storedSiteType: SITE_TYPES.NEW_API,
        suggestedSiteType: SITE_TYPES.VELOERA,
      },
    })
  })

  it("reports agreement when the site resolves to the stored type", async () => {
    server.use(
      serveShellTitle("https://example.com", "New API"),
      serveStatusName("https://example.com", "New API"),
    )

    await expect(
      checkSiteTypeMismatch({
        siteUrl: "https://example.com",
        storedSiteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({ outcome: "agrees" })
  })

  it("reports no reading when the site resolves to no registered type at all", async () => {
    server.use(
      serveShellTitle("https://example.com", "Unbranded Console"),
      http.get("https://example.com/api/user/self", () =>
        HttpResponse.json(
          { success: false, message: "error: completely unmatched identifier" },
          { status: 400 },
        ),
      ),
    )

    await expect(
      checkSiteTypeMismatch({
        siteUrl: "https://example.com",
        storedSiteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({ outcome: "undetermined" })
  })

  it("reports no reading without a site URL, and reads nothing", async () => {
    let fetched = false
    server.use(
      http.get("https://example.com", () => {
        fetched = true
        return HttpResponse.html("<html><title>Veloera</title></html>")
      }),
    )

    await expect(
      checkSiteTypeMismatch({
        siteUrl: "   ",
        storedSiteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({ outcome: "undetermined" })
    expect(fetched).toBe(false)
  })

  it("reports no reading when detection itself fails", async () => {
    server.use(http.get("https://example.com", () => HttpResponse.error()))

    await expect(
      checkSiteTypeMismatch({
        siteUrl: "https://example.com",
        storedSiteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({ outcome: "undetermined" })
  })
})
