import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
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

const serveShellTitle = (origin: string, title: string) =>
  http.get(origin, () => {
    return new HttpResponse(`<html><title>${title}</title></html>`, {
      headers: { "Content-Type": "text/html" },
    })
  })

const serveStatusData = (data: Record<string, unknown>) =>
  http.get("https://example.com/api/status", () => {
    return HttpResponse.json({ success: true, message: "", data })
  })

const serveUnavailableStatus = () =>
  http.get("https://example.com/api/status", () => {
    return HttpResponse.text("not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    })
  })

describe("detectSiteType RixAPI licence signature", () => {
  beforeEach(() => {
    server.resetHandlers()
    server.use(
      http.get(/\/api\/user\/info$/, () => {
        return HttpResponse.json({ message: "not found" }, { status: 404 })
      }),
      http.get(/\/api\/v1\/auth\/me$/, () => {
        return HttpResponse.json({ message: "not found" }, { status: 404 })
      }),
      http.get("https://example.com/api/user/self", () => {
        return HttpResponse.json(
          {
            success: false,
            message: "error: completely unmatched identifier",
          },
          { status: 400 },
        )
      }),
    )
  })

  it("detects RIX_API from licence fields behind a white-label brand", async () => {
    server.use(
      serveShellTitle("https://example.com", "ePhone AI"),
      serveStatusData({
        system_name: "ePhone AI",
        version: "6.5.17",
        rix_version_message: "6.5.17",
        rixapi_license_type: "premium",
        rix_license_enabled: true,
      }),
      // The real white-label deployment answers /api/user/self for a logged-in
      // browser, so no upstream auth error message is available to decode.
      http.get("https://example.com/api/user/self", () => {
        return HttpResponse.json({
          success: true,
          message: "",
          data: { username: "white-label-owner", balance: "0" },
        })
      }),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.RIX_API,
    )
  })

  it("treats any single RixAPI licence field as the signature", async () => {
    server.use(
      serveShellTitle("https://example.com", "White Label Gateway"),
      serveStatusData({ rix_version_message: "6.5.17" }),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.RIX_API,
    )
  })

  it("prefers the licence signature over a conflicting shell title", async () => {
    server.use(
      serveShellTitle("https://example.com", "New API"),
      serveStatusData({ rixapi_license_type: "premium" }),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.RIX_API,
    )
  })

  it("keeps brand-name detection unchanged when the signature is absent", async () => {
    server.use(
      serveShellTitle("https://example.com", "Veloera"),
      serveStatusData({ system_name: "Veloera", checkin_enabled: true }),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.VELOERA,
    )
  })

  it("still detects Rix-branded deployments by title when status is unavailable", async () => {
    server.use(
      serveShellTitle("https://example.com", "RixAPI"),
      serveUnavailableStatus(),
    )

    await expect(getAccountSiteType("https://example.com")).resolves.toBe(
      SITE_TYPES.RIX_API,
    )
  })
})
