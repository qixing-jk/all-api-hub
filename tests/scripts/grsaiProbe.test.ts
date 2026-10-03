import { afterEach, describe, expect, it, vi } from "vitest"

import { runGrsaiProbe } from "~~/scripts/suites/grsai/probe.mjs"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Minimal stand-in for the console's `{ code, data, msg }` envelope, plus the
 * plain JSON `/api/status` the "not a New API backend" check reads.
 */
const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
})

/** The console answers an unauthenticated console call with this envelope. */
const UNAUTHENTICATED = { code: -10000, data: null, msg: "" }

/** True when the request carried an `authorization` header. */
const isAuthorized = (init?: RequestInit) =>
  Boolean(
    init?.headers && (init.headers as Record<string, string>).authorization,
  )

describe("Grsai console probe", () => {
  it("does not pass an exclusion check when its request fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/status")) throw new Error("offline")
        return jsonResponse(UNAUTHENTICATED)
      }),
    )
    await expect(runGrsaiProbe({})).resolves.toMatchObject({
      ok: false,
      notNewApi: false,
    })
  })
  it("rejects an issued guest token without authenticated reads", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/status")) {
        return jsonResponse({}, 404)
      }
      if (String(url).endsWith("/getConfig")) {
        return jsonResponse({
          code: 0,
          data: { token: "guest", isAuth: false },
        })
      }
      return jsonResponse(UNAUTHENTICATED)
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await runGrsaiProbe({ token: "expired" })
    expect(result.sessionOk).toBe(false)
    expect(result.ok).toBe(false)
    expect(
      fetchMock.mock.calls.some(([url]) => url.endsWith("/getAPIKeyList")),
    ).toBe(false)
  })

  it("treats the -10000 envelope as the console fingerprint and rejects a New API backend", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/status")) {
        // A New API backend would answer a version/system payload here.
        return jsonResponse({
          data: { version: "v1.0.0", system_name: "New API" },
        })
      }
      return isAuthorized(init)
        ? jsonResponse({ code: 0, data: { id: "acct", credits: 1 } })
        : jsonResponse(UNAUTHENTICATED)
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await runGrsaiProbe({ token: "" })

    expect(result.consoleEnvelopeOk).toBe(true)
    expect(result.notNewApi).toBe(false)
    // A New API-shaped origin must not be accepted even if the envelope matches.
    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
  })

  it("accepts a credential-free run when the origin is the console and not New API", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith("/api/status")
        ? jsonResponse({ message: "not found" }, 404)
        : jsonResponse(UNAUTHENTICATED),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await runGrsaiProbe({ token: "" })

    expect(result.consoleEnvelopeOk).toBe(true)
    expect(result.notNewApi).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.sessionOk).toBe(false)
  })

  it("reports a dead session instead of claiming the reads succeeded", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string) => {
      const target = String(url)
      if (target.endsWith("/api/status")) {
        return jsonResponse({ message: "not found" }, 404)
      }
      if (target.endsWith("/client/common/getConfig")) {
        // An expired or refused session: no issued token comes back.
        return jsonResponse({ code: 0, data: { isAuth: false }, msg: "" })
      }
      return jsonResponse(UNAUTHENTICATED)
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await runGrsaiProbe({ token: "expired-session" })

    expect(result.sessionOk).toBe(false)
    // The origin is still the console, so the structural check stands; the
    // session failure is what gates the expensive read assertions.
    expect(result.consoleEnvelopeOk).toBe(true)
    expect(result.notNewApi).toBe(true)
    expect(result.accountOk).toBe(false)
    expect(result.keysOk).toBe(false)
    expect(result.ok).toBe(false)
  })

  it("reads account, keys and models through the exchanged session token", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url)
      if (target.endsWith("/api/status")) {
        return jsonResponse({ message: "not found" }, 404)
      }
      if (target.endsWith("/client/common/getConfig")) {
        return jsonResponse({
          code: 0,
          data: {
            token: "issued-session-token",
            kis: "kis",
            ra1: "ra1",
            ra2: "ra2",
            random: 123456,
            isAuth: true,
          },
        })
      }
      // Anonymous console calls answer -10000; authenticated ones succeed.
      // getConfig carries the token in its body, every read in the header.
      if (!isAuthorized(init)) {
        return jsonResponse(UNAUTHENTICATED)
      }
      if (target.endsWith("/client/grsai/getUserInfo")) {
        return jsonResponse({
          code: 0,
          data: { id: "acct", mail: "a@b.invalid", credits: 5000 },
        })
      }
      if (target.endsWith("/client/grsai/getDashboardData")) {
        return jsonResponse({
          code: 0,
          data: { credits: 5000, todayConsumed: 10, totalConsumed: 100 },
        })
      }
      if (target.endsWith("/client/grsai/getAPIKeyList")) {
        return jsonResponse({
          code: 0,
          data: {
            total: 1,
            list: [{ id: "k1", key: "sk-0123456789abcdef0123456789abcdef" }],
          },
        })
      }
      if (target.endsWith("/client/serverGrsai/getModelList")) {
        return jsonResponse({
          code: 0,
          data: [{ id: 1, model: "gpt-4o", credits: 100 }],
        })
      }
      return jsonResponse({ code: 0, data: {} })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await runGrsaiProbe({ token: "valid-session" })
    expect(result.ok).toBe(true)

    expect(result.sessionOk).toBe(true)
    expect(result.accountOk).toBe(true)
    expect(result.keysOk).toBe(true)
    expect(result.modelsOk).toBe(true)
    expect(result.modelCount).toBe(1)
    expect(result.plaintextKeyCount).toBe(1)
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls)
    expect(logs).not.toContain("a@b.invalid")
    expect(logs).not.toContain('"id":"acct"')
    expect(logs).not.toContain("sk-0123456789abcdef0123456789abcdef")
    expect(result.ok).toBe(true)
  })

  it("does not create or delete a key just to check connectivity", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url)
      if (target.endsWith("/api/status")) {
        return jsonResponse({ message: "not found" }, 404)
      }
      if (target.endsWith("/client/common/getConfig")) {
        return jsonResponse({
          code: 0,
          data: {
            token: "t",
            isAuth: true,
            kis: "k",
            ra1: "a",
            ra2: "b",
            random: 1,
          },
        })
      }
      if (!isAuthorized(init)) return jsonResponse(UNAUTHENTICATED)
      if (target.endsWith("/client/grsai/getUserInfo")) {
        return jsonResponse({ code: 0, data: { id: "acct", credits: 1 } })
      }
      if (target.endsWith("/client/grsai/getAPIKeyList")) {
        return jsonResponse({ code: 0, data: { total: 0, list: [] } })
      }
      if (target.endsWith("/client/serverGrsai/getModelList")) {
        return jsonResponse({
          code: 0,
          data: { list: [{ id: 1, model: "m" }] },
        })
      }
      return jsonResponse({ code: 0, data: {} })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await runGrsaiProbe({ token: "valid-session" })
    expect(result.ok).toBe(true)

    const mutating = fetchMock.mock.calls.filter((args) => {
      const target = String(args[0])
      return (
        target.includes("createAPIKey") ||
        target.includes("updateAPIKeyInfo") ||
        target.includes("deleteAPIKey")
      )
    })
    expect(mutating).toHaveLength(0)
  })
})
