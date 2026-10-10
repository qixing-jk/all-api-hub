import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createKey,
  deleteKey,
  fetchKeys,
  updateKey,
  type CubenceKey,
} from "~/services/apiService/cubence/keys"
import { readCubenceResponse } from "~/services/apiService/cubence/transport"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const { pageFetch } = vi.hoisted(() => ({ pageFetch: vi.fn() }))
vi.mock("~/utils/browser/index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/index")>()),
  isExtensionBackground: () => false,
}))
vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()),
  sendRuntimeMessage: pageFetch,
}))

const origin = "https://cubence.com"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
  protectionBypassExecution: createUserCommandProtectionBypassExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
    PROTECTION_BYPASS_SURFACES.Options,
  ),
}
const key: CubenceKey = {
  id: 17,
  user_id: 7,
  key: "sk-example-secret",
  name: "Example",
  status: "active",
  share_type: "public",
  share_group_id: 72,
  quota_limit: 10000000,
  quota_used: 20,
  usage_count: 1,
  last_used_at: null,
}

describe("Cubence key protocol", () => {
  beforeEach(() => {
    installCookieTransport()
    pageFetch.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  beforeEach(() =>
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({
          user: { id: 7, username: "example", active: true },
        }),
      ),
    ),
  )

  it("reads plaintext inventory and the full native editor baseline", async () => {
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: [key] }),
      ),
    )
    await expect(fetchKeys(request)).resolves.toEqual([key])
  })

  it("retains the Firefox page transport for writes without capturing Chromium Cookie credentials", async () => {
    vi.stubEnv("BROWSER", "firefox")
    pageFetch.mockResolvedValue({
      success: true,
      status: 200,
      data: { success: true },
    })
    await expect(
      readCubenceResponse(request, "/api/v1/user/apikeys", { method: "POST" }),
    ).resolves.toEqual({ success: true })
    expect(pageFetch).toHaveBeenCalledOnce()
    expect(browser.cookies.getAll).not.toHaveBeenCalled()
    expect(
      browser.declarativeNetRequest.updateSessionRules,
    ).not.toHaveBeenCalled()
  })

  it.each(["POST", "PATCH", "DELETE"])(
    "sends %s directly with the site Origin on its first attempt",
    async (method) => {
      const origins: (string | null)[] = []
      server.use(
        http.all(`${origin}/api/v1/user/apikeys`, ({ request }) => {
          origins.push(request.headers.get("origin"))
          return HttpResponse.json(
            { success: request.headers.get("origin") === origin },
            { status: request.headers.get("origin") === origin ? 200 : 403 },
          )
        }),
      )
      await expect(
        readCubenceResponse(request, "/api/v1/user/apikeys", { method }),
      ).resolves.toEqual({ success: true })
      expect(origins).toEqual([origin])
      expect(pageFetch).not.toHaveBeenCalled()
    },
  )

  it("rejects an inventory owned by a different user", async () => {
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: [{ ...key, user_id: 8 }] }),
      ),
    )
    await expect(fetchKeys(request)).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
  })

  it("creates only the verified fields with a required explicit group", async () => {
    const input = { ...key, share_type: "private" }
    server.use(
      http.post(`${origin}/api/v1/user/apikeys`, async ({ request }) => {
        expect(await request.json()).toEqual({
          name: "Example",
          quota_limit: 10000000,
          share_type: "public",
          share_group_id: 72,
        })
        return HttpResponse.json({ success: true, data: key })
      }),
    )
    await expect(createKey(request, input)).resolves.toEqual(key)
  })

  it.each([
    { quota_used: -1 },
    { usage_count: -1 },
    { quota_limit: -2 },
    { usage_count: 0.5 },
  ])("rejects invalid native key counters %o", async (invalid) => {
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: [{ ...key, ...invalid }] }),
      ),
    )
    await expect(fetchKeys(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("updates only changed native fields and confirms the final state", async () => {
    let current = { ...key }
    const calls: string[] = []
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: [current] }),
      ),
      http.patch(
        `${origin}/api/v1/user/apikeys/17/:field`,
        async ({ request, params }) => {
          calls.push(String(params.field))
          const body = (await request.json()) as object
          expect(Object.keys(body)).toHaveLength(1)
          current = { ...current, ...body }
          return HttpResponse.json({ success: true })
        },
      ),
    )
    await expect(
      updateKey(request, key, {
        quota_limit: -1,
        share_group_id: 5,
        status: "disabled",
      }),
    ).resolves.toMatchObject({
      name: "Example",
      key: "sk-example-secret",
      quota_limit: -1,
      share_group_id: 5,
      status: "disabled",
    })
    expect(calls).toEqual(["quota", "share-group", "status"])
  })

  it("rejects conflicting edits before any write", async () => {
    const patch = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({
          success: true,
          data: [{ ...key, quota_limit: 20000000 }],
        }),
      ),
      http.patch(`${origin}/api/v1/user/apikeys/17/:field`, patch),
    )
    await expect(
      updateKey(request, key, {
        quota_limit: 30000000,
        share_group_id: 72,
        status: "active",
      }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(patch).not.toHaveBeenCalled()
  })

  it("stops after a failed second field without replaying the first write", async () => {
    const calls: string[] = []
    let current = { ...key }
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: [current] }),
      ),
      http.patch(
        `${origin}/api/v1/user/apikeys/17/:field`,
        async ({ request, params }) => {
          calls.push(String(params.field))
          if (params.field === "quota") {
            current = { ...current, ...((await request.json()) as object) }
            return HttpResponse.json({ success: true })
          }
          return HttpResponse.json(
            { error: "temporarily unavailable" },
            { status: 503 },
          )
        },
      ),
    )
    await expect(
      updateKey(request, key, {
        quota_limit: -1,
        share_group_id: 5,
        status: "disabled",
      }),
    ).rejects.toThrow()
    expect(calls).toEqual(["quota", "share-group"])
    expect(current).toMatchObject({
      quota_limit: -1,
      share_group_id: 72,
      status: "active",
    })
  })

  it("requires deletion readback rather than trusting a success response", async () => {
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: [key] }),
      ),
      http.delete(`${origin}/api/v1/user/apikeys/17`, () =>
        HttpResponse.json({ success: true }),
      ),
    )
    await expect(deleteKey(request, "17")).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
  })

  it("does not delete or edit arbitrary resource paths", async () => {
    await expect(deleteKey(request, "../another-user")).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
})
