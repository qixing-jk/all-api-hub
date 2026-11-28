import { http, HttpResponse } from "msw"
import { afterEach, expect, it, vi } from "vitest"

import {
  PMPLAN_ENDPOINTS,
  PMPLAN_PROGRAM_NAME,
} from "~/services/apiService/pmplan/constants"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { server } from "~~/tests/msw/server"

afterEach(() => vi.restoreAllMocks())

it("identifies a self-hosted PM-Plan from its public health protocol without login", async () => {
  const origin = "https://custom-plan.example"
  server.use(
    http.get(`${origin}${PMPLAN_ENDPOINTS.Health}`, ({ request }) => {
      // Independently pin the upstream health route while fixtures reuse its owner.
      expect(request.url).toBe(`${origin}/api/health`)
      expect(request.credentials).toBe("omit")
      expect(request.headers.get("authorization")).toBeNull()
      return HttpResponse.json({
        ok: true,
        name: PMPLAN_PROGRAM_NAME,
        version: "0.1.0",
        time: "2026-11-28T00:00:00Z",
      })
    }),
    http.get(
      `${origin}/*`,
      () =>
        new HttpResponse("<title>My gateway</title>", {
          headers: { "content-type": "text/html" },
        }),
    ),
  )
  await expect(getAccountSiteType(`${origin}/#/keys`)).resolves.toBe("pmplan")
})

it.each([
  { ok: true, name: "Other", version: "1", time: "2026-11-28T00:00:00Z" },
  {
    ok: false,
    name: PMPLAN_PROGRAM_NAME,
    version: "1",
    time: "2026-11-28T00:00:00Z",
  },
  { ok: true, name: PMPLAN_PROGRAM_NAME },
  { ok: true, name: PMPLAN_PROGRAM_NAME, version: "", time: "invalid" },
])("ignores incomplete or foreign health responses: %j", async (body) => {
  server.use(
    http.get(`https://custom-plan.example${PMPLAN_ENDPOINTS.Health}`, () =>
      HttpResponse.json(body),
    ),
    http.get(
      "https://custom-plan.example/*",
      () =>
        new HttpResponse("<title>new-api</title>", {
          headers: { "content-type": "text/html" },
        }),
    ),
  )
  expect(await getAccountSiteType("https://custom-plan.example")).toBe(
    "new-api",
  )
})

it.each(["html", "error", "redirect"])(
  "preserves other family detection after health %s",
  async (failure) => {
    server.use(
      http.get(`https://custom-plan.example${PMPLAN_ENDPOINTS.Health}`, () =>
        failure === "redirect"
          ? new HttpResponse(null, {
              status: 302,
              headers: {
                location: `https://plan.pmcat.top${PMPLAN_ENDPOINTS.Health}`,
              },
            })
          : failure === "html"
            ? new HttpResponse("<title>PM-Plan</title>", {
                headers: { "content-type": "text/html" },
              })
            : HttpResponse.error(),
      ),
      http.get(
        "https://custom-plan.example/*",
        () =>
          new HttpResponse("<title>new-api</title>", {
            headers: { "content-type": "text/html" },
          }),
      ),
    )
    expect(await getAccountSiteType("https://custom-plan.example")).toBe(
      "new-api",
    )
  },
)

it("keeps the hosted hostname shortcut without network probes", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  expect(await getAccountSiteType("https://plan.pmcat.top/#/keys")).toBe(
    "pmplan",
  )
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  [
    "/api/status",
    { success: true, data: { ShellApiLogOptimizerEnabled: false } },
    200,
  ],
  ["/api/status", { success: true, data: { rix_version_message: "6" } }, 200],
  ["/api/user/info", { code: 0, data: { basicBalance: "1" } }, 200],
  [
    "/api/v1/auth/me",
    { code: "UNAUTHORIZED", message: "Authorization header is required" },
    401,
  ],
])(
  "rejects a conflicting protocol signature at %s",
  async (endpoint, body, status) => {
    const origin = "https://custom-plan.example"
    server.use(
      http.get(`${origin}${PMPLAN_ENDPOINTS.Health}`, () =>
        HttpResponse.json({
          ok: true,
          name: PMPLAN_PROGRAM_NAME,
          version: "0.1.0",
          time: "2026-11-28T00:00:00Z",
        }),
      ),
      http.get(`${origin}${endpoint}`, () =>
        HttpResponse.json(body, { status }),
      ),
      http.get(`${origin}/*`, () => new HttpResponse(null, { status: 404 })),
    )
    expect(await getAccountSiteType(origin)).toBe("unknown")
  },
)
