import { createHash, webcrypto } from "node:crypto"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { handlePerformTempWindowFetch } from "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
import { sub2ApiContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/sub2api"
import { fetchSub2ApiBrowserPanelRequest } from "~/services/apiService/sub2api/auth/browserPanelProof"
import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()),
  sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
  onRuntimeMessage: vi.fn(() => vi.fn()),
  sendTabMessageWithRetry: vi.fn(
    async (_tabId, request) =>
      new Promise((resolve) => handlePerformTempWindowFetch(request, resolve)),
  ),
}))

const origin = "https://browser-panel.example"
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("base64url")
let pair: CryptoKeyPair
let token: string
let storedPair: CryptoKeyPair | undefined
let unavailableKeyReads: number

async function perform(options: RequestInit = {}) {
  return await new Promise<any>((resolve) =>
    handlePerformTempWindowFetch(
      {
        siteType: SITE_TYPES.SUB2API,
        expectedOrigin: origin,
        fetchUrl: `${origin}/api/v1/keys`,
        fetchOptions: {
          credentials: "omit",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          ...options,
        },
        requestId: "browser-proof",
      },
      resolve,
    ),
  )
}

beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto)
  vi.stubGlobal("location", new URL(origin))
  const storage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  )
  storedPair = pair
  unavailableKeyReads = 0
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const jkt = hash(
    JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }),
  )
  token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt } })).toString("base64url")}.signature`
  // Model only the native read contract. Any creation/write is a test failure.
  vi.stubGlobal("indexedDB", {
    open: vi.fn((name) => {
      expect(name).toBe("sub2api-panel-proof-v2")
      const request: any = {
        result: {
          objectStoreNames: { contains: (name: string) => name === "keys" },
          close: vi.fn(),
          transaction: (name: string, mode?: string) => {
            expect(name).toBe("keys")
            expect(mode ?? "readonly").toBe("readonly")
            return {
              objectStore: () => ({
                get: (key: string) => {
                  expect(key).toBe("browser-signing-key")
                  const read: any = {
                    result: unavailableKeyReads-- > 0 ? undefined : storedPair,
                  }
                  queueMicrotask(() => read.onsuccess())
                  return read
                },
              }),
            }
          },
        },
      }
      queueMicrotask(() => request.onsuccess())
      return request
    }),
  })
})

describe("existing website panel session", () => {
  it("keeps unsigned browser requests usable after the native key read throws", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("Storage unavailable")
      },
    })
    const handler = vi.fn(({ request }: { request: Request }) =>
      HttpResponse.json({ proof: request.headers.has("X-Panel-Proof") }),
    )
    server.use(http.get(`${origin}/api/v1/auth/me`, handler))
    const response = await fetchSub2ApiBrowserPanelRequest(
      `${origin}/api/v1/auth/me`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    await expect(response.json()).resolves.toEqual({ proof: false })
    expect(handler).toHaveBeenCalledOnce()
  })
  it("uses the default dispatcher without signing an unauthenticated public request", async () => {
    const handler = vi.fn((_info: { request: Request }) =>
      HttpResponse.json({ code: 0 }),
    )
    server.use(http.get(`${origin}/api/v1/settings/public`, handler))
    await expect(
      fetchSub2ApiBrowserPanelRequest(`${origin}/api/v1/settings/public`, {}),
    ).resolves.toMatchObject({ status: 200 })
    expect(handler).toHaveBeenCalledOnce()
    expect(
      handler.mock.calls[0]?.[0]?.request.headers.has("X-Panel-Proof"),
    ).toBe(false)
  })
  it("does not export a refresh family after middleware discovery loses its connection", async () => {
    storedPair = undefined
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
    localStorage.setItem("refresh_token", "website-refresh")
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({ code: 401 }, { status: 401 }),
      ),
      http.post(`${origin}/api/v1/auth/refresh`, () => HttpResponse.error()),
    )
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      }),
    ).rejects.toThrow()
    expect(localStorage.getItem("refresh_token")).toBe("website-refresh")
  })
  it.each([
    "rejected",
    "envelope",
    "identity",
    "token changed",
    "user changed",
  ])("rejects stale or unverified browser identity: %s", async (failure) => {
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () => {
        if (failure === "token changed")
          localStorage.setItem("auth_token", "replacement")
        if (failure === "user changed")
          localStorage.setItem("auth_user", JSON.stringify({ id: 18 }))
        return HttpResponse.json(
          {
            code: failure === "envelope" ? 1 : 0,
            data: { id: failure === "identity" ? 18 : 17 },
          },
          { status: failure === "rejected" ? 403 : 200 },
        )
      }),
    )
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      }),
    ).rejects.toThrow()
  })
  it.each([
    "missing API",
    "absent database",
    "blocked",
    "open error",
    "missing store",
    "read error",
    "transaction error",
  ])(
    "preserves ordinary token use when the optional native key is unavailable: %s",
    async (failure) => {
      const close = vi.fn()
      const abort = vi.fn()
      if (failure === "missing API") vi.stubGlobal("indexedDB", undefined)
      else
        vi.stubGlobal("indexedDB", {
          open: vi.fn(() => {
            const request: any = {
              transaction: { abort },
              error: new Error("Storage unavailable"),
              result: {
                close,
                objectStoreNames: {
                  contains: () => failure !== "missing store",
                },
                transaction: () => {
                  if (failure === "transaction error")
                    throw new Error("Transaction unavailable")
                  return {
                    objectStore: () => ({
                      get: () => {
                        const read: any = {
                          error: new Error("Read unavailable"),
                        }
                        queueMicrotask(() => read.onerror())
                        return read
                      },
                    }),
                  }
                },
              },
            }
            queueMicrotask(() => {
              if (failure === "absent database") {
                request.onupgradeneeded()
                request.onerror()
              } else if (failure === "blocked") request.onblocked()
              else if (failure === "open error") request.onerror()
              else request.onsuccess()
            })
            return request
          }),
        })
      localStorage.setItem("auth_token", token)
      localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
      const proofs: (string | null)[] = []
      server.use(
        http.get(`${origin}/api/v1/auth/me`, ({ request }) => {
          proofs.push(request.headers.get("X-Panel-Proof"))
          return HttpResponse.json({ code: 0, data: { id: 17 } })
        }),
      )
      const session = await sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      })
      expect(session).toMatchObject({ userId: 17, accessToken: token })
      expect(session.sub2apiWebsiteSessionBound).toBeUndefined()
      expect(proofs).toEqual([null])
      if (
        ["missing store", "read error", "transaction error"].includes(failure)
      )
        expect(close).toHaveBeenCalledOnce()
      if (failure === "absent database") expect(abort).toHaveBeenCalledOnce()
    },
  )
  it.each(["probe", "extract"] as const)(
    "rejects a cross-origin identity redirect during %s",
    async (operation) => {
      storedPair = undefined
      localStorage.setItem("auth_token", token)
      localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
      const foreignIdentity = vi.fn(() =>
        HttpResponse.json({ code: 0, data: { id: 17 } }),
      )
      server.use(
        http.get(`${origin}/api/v1/auth/me`, () =>
          HttpResponse.redirect("https://foreign.example/identity"),
        ),
        http.get("https://foreign.example/identity", foreignIdentity),
      )
      await expect(
        sub2ApiContentSessionExtractor[operation]!({
          siteTypeHint: SITE_TYPES.SUB2API,
          url: origin,
        }),
      ).rejects.toThrow()
      expect(foreignIdentity).toHaveBeenCalledOnce()
    },
  )

  it("accepts an identity redirect within the configured API origin", async () => {
    storedPair = undefined
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.redirect(`${origin}/identity`),
      ),
      http.get(`${origin}/identity`, () =>
        HttpResponse.json({ code: 0, data: { id: 17 } }),
      ),
    )
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      }),
    ).resolves.toMatchObject({ userId: 17 })
  })
  it("signs for the configured API origin with the dashboard's website key", async () => {
    const dashboard = "https://ai-router.dev"
    vi.stubGlobal("location", new URL(dashboard))
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
    localStorage.setItem("refresh_token", "website-owned-refresh")
    const fetch = vi.fn(async (_url: string | URL, options: RequestInit) => {
      expect(new Headers(options.headers).has("X-Panel-Proof")).toBe(true)
      return Response.json({ code: 0, data: { id: 17 } })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: dashboard,
      }),
    ).resolves.toMatchObject({ sub2apiWebsiteSessionBound: true })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      new URL("https://api.ai-router.dev/api/v1/auth/me"),
      expect.anything(),
    )
  })
  it("detects a signed website identity without a password or exporting its refresh family", async () => {
    localStorage.setItem("auth_token", token)
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 17, username: "oauth-member" }),
    )
    localStorage.setItem("refresh_token", "website-owned-refresh")
    localStorage.setItem("token_expires_at", String(Date.now() + 30_000))
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      expect(new Headers(options.headers).has("X-Panel-Proof")).toBe(true)
      expect(options.credentials).toBe("omit")
      return Response.json({
        code: 0,
        data: { id: 17, username: "oauth-member" },
      })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      sub2ApiContentSessionExtractor.probe!({
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).resolves.toMatchObject({
      userId: 17,
      accessToken: token,
      siteTypeHint: SITE_TYPES.SUB2API,
    })
    const session = await sub2ApiContentSessionExtractor.extract({
      siteTypeHint: SITE_TYPES.SUB2API,
      url: origin,
    })
    expect(session?.sub2apiAuth).toBeUndefined()
    expect(session?.sub2apiWebsiteSessionBound).toBe(true)
    expect(localStorage.getItem("refresh_token")).toBe("website-owned-refresh")
    expect(
      fetch.mock.calls.every(
        ([url]) => new URL(url).pathname === "/api/v1/auth/me",
      ),
    ).toBe(true)
  })

  it("signs the exact request with the native non-exportable key", async () => {
    const fetch = vi.fn(async (url, options: RequestInit) => {
      const proof = new Headers(options.headers).get("X-Panel-Proof")!
      expect(proof).toBeTruthy()
      const [head, payload, signature] = proof.split(".") as [
        string,
        string,
        string,
      ]
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString())
      const bytes = Buffer.from(await new Request(url, options).arrayBuffer())
      expect(claims).toMatchObject({
        v: 2,
        htm: "POST",
        htu: "/api/v1/keys",
        bht: hash(bytes),
        ath: hash(token),
      })
      expect(
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          pair.publicKey,
          new Uint8Array(Buffer.from(signature, "base64url")),
          new TextEncoder().encode(`${head}.${payload}`),
        ),
      ).toBe(true)
      return Response.json({ code: 0, data: { id: 5 } })
    })
    vi.stubGlobal("fetch", fetch)
    const result = await perform({
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    })
    expect(result.error).toBeUndefined()
    expect(result).toMatchObject({ success: true, data: { data: { id: 5 } } })
    expect(fetch).toHaveBeenCalledOnce()
    expect(pair.privateKey.extractable).toBe(false)
  })

  it("rejects a different native key before dispatch", async () => {
    storedPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )
    const fetch = vi.fn().mockResolvedValue(Response.json({ code: 0 }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: origin,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: token },
          fetchContext: { kind: "current-tab", origin, tabId: 17 },
          currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/keys" },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      upstreamCode: "PANEL_PROOF_KEY_MISMATCH",
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("leaves a generic cnf token unsigned when the website has no panel key", async () => {
    storedPair = undefined
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      expect(new Headers(options.headers).has("X-Panel-Proof")).toBe(false)
      return Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    expect(await perform()).toMatchObject({ success: true })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("does not replay a write whose response was lost", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Connection lost"))
    vi.stubGlobal("fetch", fetch)
    expect(await perform({ method: "POST", body: "{}" })).toMatchObject({
      success: false,
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: false,
      },
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("stops after an explicit proof rejection when the website key was cleared", async () => {
    storedPair = undefined
    const fetch = vi.fn(async () =>
      Response.json(
        { code: 401, reason: "PANEL_PROOF_INVALID" },
        { status: 401 },
      ),
    )
    vi.stubGlobal("fetch", fetch)
    expect(await perform()).toMatchObject({
      success: false,
      code: "REQUEST_PROOF_INVALID",
      localError: {
        statusCode: 401,
        upstreamCode: "PANEL_PROOF_BROWSER_KEY_MISSING",
      },
    })
    expect(fetch).toHaveBeenCalledOnce()
    // The mock store has no write API; the extension cannot create a native key.
  })

  it("does not export a bound session's refresh credentials after its website key is cleared", async () => {
    storedPair = undefined
    localStorage.setItem("auth_token", token)
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 17, username: "member" }),
    )
    localStorage.setItem("refresh_token", "website-refresh")
    localStorage.setItem("token_expires_at", String(Date.now() + 3600000))
    const fetch = vi.fn(async () =>
      Response.json(
        { code: 401, reason: "PANEL_PROOF_INVALID" },
        { status: 401 },
      ),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      }),
    ).rejects.toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("retains ordinary cnf session extraction when the identity endpoint accepts unsigned requests", async () => {
    storedPair = undefined
    localStorage.setItem("auth_token", token)
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 17, username: "member" }),
    )
    localStorage.setItem("refresh_token", "ordinary-refresh")
    localStorage.setItem("token_expires_at", String(Date.now() + 3600000))
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      expect(new Headers(options.headers).has("X-Panel-Proof")).toBe(false)
      return Response.json({ code: 0, data: { id: 17 } })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      }),
    ).resolves.toMatchObject({
      accessToken: token,
      sub2apiAuth: { refreshToken: "ordinary-refresh" },
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    "Refresh token is required",
    "Invalid request: Key: 'RefreshTokenRequest.RefreshToken' Error:Field validation for 'RefreshToken' failed on the 'required' tag",
  ])(
    "renews an expired ordinary cnf session after verified validation (%s)",
    async (message) => {
      storedPair = undefined
      localStorage.setItem("auth_token", token)
      localStorage.setItem(
        "auth_user",
        JSON.stringify({ id: 17, username: "member" }),
      )
      localStorage.setItem("refresh_token", "ordinary-refresh")
      localStorage.setItem("token_expires_at", String(Date.now() - 1))
      const fetch = vi.fn(async (url, options: RequestInit) => {
        expect(new Headers(options.headers).has("X-Panel-Proof")).toBe(false)
        return new URL(url).pathname === "/api/v1/auth/me"
          ? Response.json(
              { code: 401, message: "Token expired" },
              { status: 401 },
            )
          : JSON.parse(String(options.body)).refresh_token === ""
            ? Response.json({ code: 400, message }, { status: 400 })
            : Response.json({
                code: 0,
                data: {
                  access_token: "new-access",
                  refresh_token: "new-refresh",
                  expires_in: 3600,
                },
              })
      })
      vi.stubGlobal("fetch", fetch)
      await expect(
        sub2ApiContentSessionExtractor.extract({
          siteTypeHint: SITE_TYPES.SUB2API,
          url: origin,
        }),
      ).resolves.toMatchObject({
        accessToken: "new-access",
        sub2apiAuth: { refreshToken: "new-refresh" },
      })
      expect(fetch).toHaveBeenCalledTimes(3)
    },
  )

  it("does not export refresh credentials when native key access changes during extraction", async () => {
    unavailableKeyReads = 1
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
    localStorage.setItem("refresh_token", "website-only")
    const fetch = vi.fn(async (_url: string, options: RequestInit) =>
      new Headers(options.headers).has("X-Panel-Proof")
        ? Response.json({ code: 0, data: { id: 17 } })
        : Response.json(
            { code: 401, reason: "PANEL_PROOF_INVALID" },
            { status: 401 },
          ),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      sub2ApiContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.SUB2API,
        url: origin,
      }),
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    [401, "proof"],
    [503, "proof"],
    [429, "proof"],
    [403, "html"],
    [401, "generic"],
    [200, "html"],
    [400, "html"],
    [400, "generic"],
    [400, "conflicting"],
  ] as const)(
    "does not submit a refresh token after hidden proof or unavailable discovery (%s)",
    async (probeStatus, responseType) => {
      storedPair = undefined
      localStorage.setItem("auth_token", token)
      localStorage.setItem("auth_user", JSON.stringify({ id: 17 }))
      localStorage.setItem("refresh_token", "website-refresh")
      localStorage.setItem("token_expires_at", String(Date.now() - 1))
      const bodies: string[] = []
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url, options: RequestInit) => {
          if (new URL(url).pathname === "/api/v1/auth/me")
            return Response.json(
              { code: 401, reason: "INVALID_TOKEN" },
              { status: 401 },
            )
          bodies.push(JSON.parse(String(options.body)).refresh_token)
          expect(options.credentials).toBe("omit")
          expect(new Headers(options.headers).has("Authorization")).toBe(false)
          if (responseType === "html")
            return new Response("<html>Challenge</html>", {
              status: probeStatus,
              headers: { "Content-Type": "text/html" },
            })
          if (responseType === "conflicting")
            return Response.json(
              {
                code: 400,
                message: "Refresh token is required",
                reason: "PANEL_PROOF_INVALID",
              },
              { status: 400 },
            )
          return Response.json(
            responseType === "proof"
              ? { code: 401, reason: "PANEL_PROOF_INVALID" }
              : { code: probeStatus, message: "Request failed" },
            { status: probeStatus },
          )
        }),
      )
      await expect(
        sub2ApiContentSessionExtractor.extract({
          siteTypeHint: SITE_TYPES.SUB2API,
          url: origin,
        }),
      ).rejects.toBeTruthy()
      expect(bodies).toEqual([""])
      expect(localStorage.getItem("refresh_token")).toBe("website-refresh")
    },
  )

  it("re-signs only an explicit clock rejection with a fresh nonce and server time", async () => {
    const proofs: any[] = []
    const serverTime = Math.floor(Date.now() / 1000) + 600
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      const proof = new Headers(options.headers).get("X-Panel-Proof")!
      proofs.push(
        JSON.parse(Buffer.from(proof.split(".")[1]!, "base64url").toString()),
      )
      return proofs.length === 1
        ? Response.json(
            { code: 401, reason: "PANEL_PROOF_TIME" },
            { status: 401, headers: { "X-Panel-Time": String(serverTime) } },
          )
        : Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    expect(await perform({ method: "POST", body: "{}" })).toMatchObject({
      success: true,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(proofs[1].iat).toBeGreaterThanOrEqual(serverTime)
    expect(proofs[1].jti).not.toBe(proofs[0].jti)
  })
})
