import { afterEach, describe, expect, it, vi } from "vitest"

import {
  E2E_ACCESS_TOKEN_NAME,
  revokeStaleE2eAccessTokens,
} from "~~/e2e/utils/realSite/newApiAccessTokens"

const ORIGIN = "https://panel.example.invalid"
const NOW = new Date("2026-10-01T12:00:00Z").getTime()
const HOUR_SECONDS = 3_600

const config = {
  baseUrl: ORIGIN,
  username: "example-user",
  password: "example-password",
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const tokenRow = (
  id: number,
  name: string,
  ageSeconds: number,
): Record<string, unknown> => ({
  id,
  name,
  created_at: Math.floor(NOW / 1000) - ageSeconds,
})

const stubSite = (
  rows: Record<string, unknown>[],
  overrides: {
    loginStatus?: number
    listStatus?: number
    proofStatus?: number
    deleteStatus?: number
  } = {},
) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.endsWith("/api/user/login")) {
        return jsonResponse(
          {
            success: true,
            data: { access_token: "dashboard-session" },
          },
          overrides.loginStatus ?? 200,
        )
      }

      if (
        url.endsWith("/api/user/access_tokens") &&
        init?.method !== "DELETE"
      ) {
        if (overrides.listStatus && overrides.listStatus !== 200) {
          return jsonResponse({ success: false }, overrides.listStatus)
        }
        return jsonResponse({ success: true, data: { items: rows } })
      }

      if (url.endsWith("/api/verify")) {
        if (overrides.proofStatus && overrides.proofStatus !== 200) {
          return jsonResponse({ success: false }, overrides.proofStatus)
        }
        return jsonResponse({ success: true, data: { proof_token: "proof" } })
      }

      return jsonResponse(
        { success: !overrides.deleteStatus || overrides.deleteStatus === 200 },
        overrides.deleteStatus ?? 200,
      )
    },
  )

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("revokeStaleE2eAccessTokens", () => {
  it("deletes a token an earlier run left behind", async () => {
    const fetchMock = stubSite([
      tokenRow(7, E2E_ACCESS_TOKEN_NAME, 2 * HOUR_SECONDS),
    ])

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([7])

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    )
    expect(deleteCall?.[0]).toBe(`${ORIGIN}/api/user/access_tokens/7`)
    expect(
      (deleteCall?.[1]?.headers as Record<string, string>)?.[
        "X-Security-Proof"
      ],
    ).toBe("proof")
  })

  it("asks for the revoke proof of the token it is deleting", async () => {
    const fetchMock = stubSite([
      tokenRow(7, E2E_ACCESS_TOKEN_NAME, 2 * HOUR_SECONDS),
    ])

    await revokeStaleE2eAccessTokens(config, NOW)

    const verifyCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/verify"),
    )
    expect(JSON.parse(String(verifyCall?.[1]?.body))).toMatchObject({
      method: "password",
      scope: "access_token.revoke",
      context: { token_id: 7 },
      password: config.password,
    })
  })

  it("keeps a token a concurrently running job may still be using", async () => {
    const fetchMock = stubSite([
      tokenRow(8, E2E_ACCESS_TOKEN_NAME, 60),
      tokenRow(7, E2E_ACCESS_TOKEN_NAME, 2 * HOUR_SECONDS),
    ])

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([7])

    const deletedIds = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([url]) => String(url))
    expect(deletedIds).toEqual([`${ORIGIN}/api/user/access_tokens/7`])
  })

  it("keeps tokens that are not the flow's own", async () => {
    const fetchMock = stubSite([
      tokenRow(9, "Operator console", 30 * HOUR_SECONDS),
    ])

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([])
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false)
  })

  it("leaves an older deployment alone", async () => {
    const fetchMock = stubSite([], { listStatus: 404 })

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([])
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false)
  })

  it("stops when the deployment refuses the login", async () => {
    const fetchMock = stubSite(
      [tokenRow(7, E2E_ACCESS_TOKEN_NAME, 2 * HOUR_SECONDS)],
      { loginStatus: 401 },
    )

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([])
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false)
  })

  it("keeps a token whose revoke proof was refused", async () => {
    const fetchMock = stubSite(
      [tokenRow(7, E2E_ACCESS_TOKEN_NAME, 2 * HOUR_SECONDS)],
      { proofStatus: 403 },
    )

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([])
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false)
  })

  it("keeps a token whose delete was refused", async () => {
    stubSite([tokenRow(7, E2E_ACCESS_TOKEN_NAME, 2 * HOUR_SECONDS)], {
      deleteStatus: 403,
    })

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([])
  })

  it("survives a transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down")
      }),
    )

    await expect(revokeStaleE2eAccessTokens(config, NOW)).resolves.toEqual([])
  })
})
