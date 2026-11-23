import { delay, http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { server } from "~~/tests/msw/server"

const origin = "https://white-label.example"
const marker = "ShellApiLogOptimizerEnabled"

describe("Shell API public status detection", () => {
  beforeEach(() => {
    server.use(
      http.get(origin, () => HttpResponse.html("<title>White Label</title>")),
      http.get(origin + "/console/", () =>
        HttpResponse.html("<title>White Label</title>"),
      ),
      http.get(
        origin + "/api/user/info",
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(
        origin + "/api/v1/auth/me",
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(origin + "/api/user/self", () =>
        HttpResponse.json({ success: true, data: { id: 7 } }),
      ),
    )
  })

  const status = (body: Record<string, unknown>, code = 200) =>
    server.use(
      http.get(origin + "/api/status", () =>
        HttpResponse.json(body, { status: code }),
      ),
    )

  it.each([
    ["https://api.apiyi.com", SITE_TYPES.APIYI],
    ["https://api2.laozhang.ai", SITE_TYPES.LAOZHANG],
  ])("preserves the exact-host priority for %s", async (url, expected) => {
    // There are no network handlers for these origins.
    await expect(getAccountSiteType(url)).resolves.toBe(expected)
  })

  it("preserves LaoZhang branding on an unregistered host", async () => {
    status({
      success: true,
      data: { system_name: "LaoZhang API", [marker]: true },
    })
    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.LAOZHANG)
  })

  it.each([true, false])(
    "recognizes an own boolean marker %s without auxiliary fields",
    async (enabled) => {
      status({ success: true, data: { [marker]: enabled } })
      await expect(getAccountSiteType(origin + "/console")).resolves.toBe(
        SITE_TYPES.SHELL_API,
      )
    },
  )

  it("uses the Shell status signature when the title is unavailable", async () => {
    server.use(http.get(origin, () => new HttpResponse(null, { status: 403 })))
    status({ success: true, data: { [marker]: true } })
    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.SHELL_API)
  })

  it("keeps conflicting Shell and exact Sub2API authentication signatures unknown", async () => {
    server.use(
      http.get(origin + "/api/v1/auth/me", () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "Authorization header is required" },
          { status: 401 },
        ),
      ),
    )
    status({ success: true, data: { [marker]: true } })
    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.UNKNOWN)
  })

  it("returns the protected Sub2API match when public status stalls", async () => {
    server.use(
      http.get(origin + "/api/v1/auth/me", () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "Authorization header is required" },
          { status: 401 },
        ),
      ),
      http.get(origin + "/api/status", async () => {
        await delay("infinite")
        return HttpResponse.json({ success: true, data: { [marker]: true } })
      }),
    )

    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.SUB2API)
  }, 8_000)

  it.each([
    ["string", { [marker]: "false" }],
    ["number", { [marker]: 0 }],
    ["null marker", { [marker]: null }],
    ["array data", [{ [marker]: true }]],
    ["null data", null],
    [
      "missing marker",
      { system_name: "Shell API", CustomThemeConfig: "", CustomAppList: "[]" },
    ],
  ])("keeps an unconfirmed deployment unknown for %s", async (_label, data) => {
    status({ success: true, data })
    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.UNKNOWN)
  })

  it.each([false, "true", undefined])(
    "requires a successful envelope (%s)",
    async (success) => {
      status({ success, data: { [marker]: true } })
      await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.UNKNOWN)
    },
  )

  it("keeps unknown when the status read fails", async () => {
    status({ success: true, data: { [marker]: true } }, 503)
    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.UNKNOWN)
  })

  it.each([
    "rix_version_message",
    "rixapi_license_type",
    "rix_license_enabled",
  ])("keeps conflicting Shell and Rix signals unknown (%s)", async (field) => {
    status({ success: true, data: { [marker]: false, [field]: false } })
    await expect(getAccountSiteType(origin)).resolves.toBe(SITE_TYPES.UNKNOWN)
  })
})
