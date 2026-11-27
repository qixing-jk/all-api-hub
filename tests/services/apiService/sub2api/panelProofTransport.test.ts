import { createHash, webcrypto } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  discoverSub2ApiPanelProof,
  hasSub2ApiPanelBinding,
  hasSub2ApiPanelProof,
} from "~/services/apiService/sub2api/auth/panelProofCapability"
import {
  getSub2ApiPanelKeyThumbprint,
  readSub2ApiPanelTokenBinding,
} from "~/services/apiService/sub2api/auth/panelProofProtocol"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const { storedKeys, storageFailure } = vi.hoisted(() => ({
  storedKeys: new Map(),
  storageFailure: { active: false },
}))
vi.mock("~/services/apiService/sub2api/auth/panelProofStore", () => ({
  getSub2ApiPanelSigningKey: async (origin: string) => {
    if (!storedKeys.has(origin))
      storedKeys.set(
        origin,
        await crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["sign", "verify"],
        ),
      )
    return storedKeys.get(origin)
  },
  readSub2ApiPanelSigningKey: async (origin: string) => {
    if (storageFailure.active) throw new Error("IndexedDB unavailable")
    return storedKeys.get(origin)
  },
}))

describe("Sub2API background panel proof transport", () => {
  it.each([
    "",
    "opaque",
    "e30.@@.signature",
    "e30.bnVsbA.signature",
    "e30.e30.signature",
  ])(
    "does not infer panel ownership from invalid token claims: %s",
    (token) => {
      expect(readSub2ApiPanelTokenBinding(token)).toBeUndefined()
    },
  )
  it("reports optional capability storage failure as unconfirmed", async () => {
    storageFailure.active = true
    await expect(
      hasSub2ApiPanelProof("https://unavailable.example"),
    ).resolves.toBe(false)
  })
  it("skips discovery for a previously confirmed origin", async () => {
    storedKeys.set("https://confirmed.example", {})
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    await expect(
      discoverSub2ApiPanelProof("https://confirmed.example"),
    ).resolves.toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("does not replay a malformed unauthorized response", async () => {
    const fetch = vi.fn(async () => new Response("not JSON", { status: 401 }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://malformed.example",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "opaque" },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/auth/me" },
      ),
    ).resolves.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it("calibrates a newly discovered proof key once and uses the admin request marker", async () => {
    const serverTime = Math.floor(Date.now() / 1000) + 700
    const fetch = vi
      .fn<(_url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json(
          { code: 401, reason: "PANEL_PROOF_INVALID" },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { code: 401, reason: "PANEL_PROOF_TIME" },
          { status: 401, headers: { "X-Panel-Time": String(serverTime) } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ code: 0 }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://new-clock.example",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "opaque" },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/admin/users" },
      ),
    ).resolves.toMatchObject({ status: 200 })
    expect(fetch).toHaveBeenCalledTimes(3)
    const headers = new Headers(fetch.mock.calls[2]![1].headers)
    expect(headers.get("X-Admin-UI-Request")).toBe("1")
    expect(headers.has("X-User-UI-Request")).toBe(false)
    const proof = headers.get("X-Panel-Proof")!
    expect(
      JSON.parse(Buffer.from(proof.split(".")[1]!, "base64url").toString()).iat,
    ).toBeGreaterThanOrEqual(serverTime)
    expect(fetch.mock.calls[2]![1].redirect).toBe("error")
  })
  it("discovers and uses the API-origin key for a split-origin dashboard", async () => {
    const baseUrl = "https://ai-router.dev"
    const apiOrigin = "https://api.ai-router.dev"
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(new URL(url).origin).toBe(apiOrigin)
      if (!new Headers(init.headers).has("X-Panel-Proof"))
        return Response.json(
          { code: 401, reason: "PANEL_PROOF_INVALID" },
          { status: 401 },
        )
      return Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(discoverSub2ApiPanelProof(baseUrl)).resolves.toBe(true)
    expect(storedKeys.has(baseUrl)).toBe(false)
    await expect(hasSub2ApiPanelProof(baseUrl)).resolves.toBe(true)
    const jkt = await getSub2ApiPanelKeyThumbprint(storedKeys.get(apiOrigin))
    const accessToken = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt } })).toString("base64url")}.signature`
    await expect(hasSub2ApiPanelBinding(baseUrl, accessToken)).resolves.toBe(
      true,
    )
    fetch.mockClear()
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/auth/me" },
      ),
    ).resolves.toMatchObject({ status: 200 })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it("retains forced page policy for an ordinary cnf token", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: "unrelated" } })).toString("base64url")}.signature`
    const fetch = vi.fn(async () => Response.json({ code: 0 }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://ordinary-page.example",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: token },
          forceTempWindow: true,
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/auth/me" },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    "leaves an ordinary cnf bearer unchanged when optional storage is unavailable: %s",
    async (unavailable) => {
      storageFailure.active = unavailable
      const token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: "unrelated-binding" } })).toString("base64url")}.signature`
      const fetch = vi.fn(async (_url: string, init: RequestInit) => {
        expect(new Headers(init.headers).has("X-Panel-Proof")).toBe(false)
        return Response.json({ code: 0, data: { id: 42 } })
      })
      vi.stubGlobal("fetch", fetch)
      await expect(
        fetchApiResponse(
          {
            siteType: SITE_TYPES.SUB2API,
            baseUrl: "https://ordinary-cnf.example",
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: token },
            directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
          },
          { endpoint: "/api/v1/auth/me" },
        ),
      ).resolves.toMatchObject({ status: 200 })
      expect(fetch).toHaveBeenCalledOnce()
      expect(storedKeys.has("https://ordinary-cnf.example")).toBe(false)
    },
  )
  it("keeps an unsigned deployment usable when signing storage cannot be read", async () => {
    storageFailure.active = true
    const fetch = vi.fn(async () =>
      Response.json({ code: 0, data: { id: 42 } }),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://unsigned.example",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "ordinary-token",
          },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/auth/me" },
      ),
    ).resolves.toMatchObject({ status: 200 })
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each(["network", "business", "proof"])(
    "never replays an uncertain write and bounds explicit proof rejection (%s)",
    async (kind) => {
      const fetch = vi.fn(async () => {
        if (kind === "network")
          throw new TypeError("Connection lost after dispatch")
        return Response.json(
          {
            code: 401,
            reason:
              kind === "proof" ? "PANEL_PROOF_INVALID" : "BUSINESS_REJECTED",
          },
          { status: 401 },
        )
      })
      vi.stubGlobal("fetch", fetch)
      const pending = fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://replay.example",
          auth: { authType: AuthTypeEnum.None },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        {
          endpoint: "/api/v1/auth/login",
          options: { method: "POST", body: "{}" },
        },
      )
      if (kind === "business")
        await expect(pending).resolves.toMatchObject({ status: 401 })
      else await expect(pending).rejects.toBeTruthy()
      expect(fetch).toHaveBeenCalledTimes(kind === "proof" ? 2 : 1)
    },
  )
  it("cancels before admitting a proof retry", async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async () => {
      controller.abort()
      return Response.json(
        { code: 401, reason: "PANEL_PROOF_INVALID" },
        { status: 401 },
      )
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://cancel-proof.example",
          auth: { authType: AuthTypeEnum.None },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
          abortSignal: controller.signal,
        },
        {
          endpoint: "/api/v1/auth/login",
          options: { method: "POST", body: "{}" },
        },
      ),
    ).rejects.toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()
  })
  it("does not mark auth POSTs as dashboard requests", async () => {
    storedKeys.set(
      "https://login-markers.example",
      await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign", "verify"],
      ),
    )
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).has("X-User-UI-Request")).toBe(false)
      return Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://login-markers.example",
        auth: { authType: AuthTypeEnum.None },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      },
      {
        endpoint: "/api/v1/auth/login",
        options: { method: "POST", body: "{}" },
      },
    )
  })
  beforeEach(() => {
    storageFailure.active = false
    vi.stubGlobal("crypto", webcrypto)
    storedKeys.clear()
  })

  it("recovers an explicit missing-proof rejection with a verifiable background signature", async () => {
    let attempts = 0
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      attempts++
      const proof = new Headers(init.headers).get("X-Panel-Proof")
      if (!proof)
        return Response.json(
          {
            code: 401,
            message: "Invalid browser request proof",
            reason: "PANEL_PROOF_INVALID",
          },
          { status: 401 },
        )
      const [header, payload, signature] = proof.split(".") as [
        string,
        string,
        string,
      ]
      const decodedHeader = JSON.parse(
        Buffer.from(header, "base64url").toString(),
      )
      const decodedPayload = JSON.parse(
        Buffer.from(payload, "base64url").toString(),
      )
      expect(decodedHeader).toMatchObject({
        alg: "ES256",
        typ: "sub2api-panel-pop+jwt",
        jwk: { kty: "EC", crv: "P-256" },
      })
      expect(decodedPayload).toMatchObject({
        v: 2,
        htm: "GET",
        htu: "/api/v1/auth/me?timezone=Asia%2FSingapore",
      })
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        decodedHeader.jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      )
      expect(
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          publicKey,
          Buffer.from(signature, "base64url"),
          new TextEncoder().encode(`${header}.${payload}`),
        ),
      ).toBe(true)
      expect(init.credentials).toBe("omit")
      return Response.json({ code: 0, data: { id: 42 } })
    })
    vi.stubGlobal("fetch", fetch)
    const result = await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://proof.example",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "valid-token",
          userId: "42",
        },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      },
      { endpoint: "/api/v1/auth/me?timezone=Asia%2FSingapore" },
    )
    expect(result.status).toBe(200)
    expect(attempts).toBe(2)
  })

  it("signs with the existing extension key on the first request for a bound token", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )
    storedKeys.set("https://bound.example", pair)
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
    const thumbprint = createHash("sha256")
      .update(JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }))
      .digest("base64url")
    const token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: thumbprint } })).toString("base64url")}.signature`
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("X-Panel-Proof")).toBeTruthy()
      return Response.json({ code: 0, data: { id: 42 } })
    })
    vi.stubGlobal("fetch", fetch)
    await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://bound.example",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: token,
          userId: "42",
        },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      },
      { endpoint: "/api/v1/auth/me" },
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("requires fresh credentials instead of dispatching a token bound to another key", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: "another-browser-key" } })).toString("base64url")}.signature`
    const fetch = vi.fn(async () =>
      Response.json(
        { code: 401, reason: "PANEL_PROOF_INVALID" },
        { status: 401 },
      ),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchApiResponse(
        {
          siteType: SITE_TYPES.SUB2API,
          baseUrl: "https://foreign-key.example",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: token },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        },
        { endpoint: "/api/v1/auth/me" },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      upstreamCode: "PANEL_PROOF_KEY_MISMATCH",
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("re-signs once with server time after an explicit clock rejection", async () => {
    storedKeys.set(
      "https://clock.example",
      await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign", "verify"],
      ),
    )
    const serverTime = Math.floor(Date.now() / 1000) + 500
    const nonces: string[] = []
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const proof = new Headers(init.headers).get("X-Panel-Proof")!
      const payload = JSON.parse(
        Buffer.from(proof.split(".")[1]!, "base64url").toString(),
      )
      nonces.push(payload.jti)
      return payload.iat < serverTime
        ? Response.json(
            { code: 401, reason: "PANEL_PROOF_TIME" },
            { status: 401, headers: { "X-Panel-Time": String(serverTime) } },
          )
        : Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    const response = await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://clock.example",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "valid-token",
        },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      },
      { endpoint: "/api/v1/auth/me" },
    )
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(new Set(nonces).size).toBe(2)
  })

  it("signs the final body and credential-owned headers rather than their defaults", async () => {
    storedKeys.set(
      "https://headers.example",
      await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign", "verify"],
      ),
    )
    const body = JSON.stringify({ name: "中文 key" })
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      const proof = headers.get("X-Panel-Proof")!
      const payload = JSON.parse(
        Buffer.from(proof.split(".")[1]!, "base64url").toString(),
      )
      expect(payload.ct).toBe("text/plain; charset=utf-8")
      expect(payload.rm).toBe("rotate")
      expect(payload.ath).toBe(
        createHash("sha256").update("effective-token").digest("base64url"),
      )
      expect(payload.bht).toBe(
        createHash("sha256").update(body).digest("base64url"),
      )
      expect(await new Response(init.body).text()).toBe(body)
      return Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl: "https://headers.example",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "default-token",
        },
        requestHeaders: {
          "content-type": "text/plain; charset=utf-8",
          authorization: "Bearer effective-token",
          "X-Panel-Refresh-Mode": "rotate",
        },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      },
      { endpoint: "/api/v1/keys", options: { method: "POST", body } },
    )
  })

  it("keeps a bound extension credential in the background even when a page context was retained", async () => {
    const origin = "https://retained-page.example"
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )
    storedKeys.set(origin, pair)
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
    const jkt = createHash("sha256")
      .update(JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }))
      .digest("base64url")
    const token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt } })).toString("base64url")}.signature`
    const fetch = vi.fn(async () => Response.json({ code: 0 }))
    vi.stubGlobal("fetch", fetch)
    const response = await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: token },
        forceTempWindow: true,
        fetchContext: { kind: "current-tab", tabId: 77, origin },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      },
      { endpoint: "/api/v1/auth/me" },
    )
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
