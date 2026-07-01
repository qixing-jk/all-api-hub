import { beforeEach, describe, expect, it, vi } from "vitest"

import { octopusAuthManager } from "~/services/apiService/octopus/auth"

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => `translated:${key}`),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: mockT,
}))

describe("Octopus auth manager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    octopusAuthManager.clearAllCache()
  })

  it("logs in against the normalized Octopus endpoint and returns the token payload", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            token: "jwt-token",
            expire_at: "2026-03-29T01:00:00.000Z",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await octopusAuthManager.login(
      "https://octopus.example.com/",
      {
        username: "alice",
        password: "secret",
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://octopus.example.com/api/v1/user/login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    )
    expect(result).toEqual({
      token: "jwt-token",
      expire_at: "2026-03-29T01:00:00.000Z",
    })
  })

  it("includes the Octopus CORS hint when login returns HTTP 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Forbidden by proxy" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    await expect(
      octopusAuthManager.login("https://octopus.example.com", {
        username: "alice",
        password: "secret",
      }),
    ).rejects.toThrow(
      "Forbidden by proxy\ntranslated:messages:octopus.corsError",
    )
  })

  it("surfaces plain-text HTTP failures when the server does not return JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("gateway down", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    )

    await expect(
      octopusAuthManager.login("https://octopus.example.com", {
        username: "alice",
        password: "secret",
      }),
    ).rejects.toThrow("HTTP 500 - gateway down")
  })

  it("passes the caller abort signal to Octopus login requests", async () => {
    const controller = new AbortController()
    let loginSignal: AbortSignal | undefined

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        loginSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          if (!init?.signal) {
            reject(new Error("missing abort signal"))
            return
          }

          init.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      }),
    )

    const login = octopusAuthManager.login(
      "https://octopus.example.com",
      {
        username: "alice",
        password: "secret",
      },
      { signal: controller.signal },
    )
    const expectation = expect(login).rejects.toThrow(/aborted/i)

    await vi.waitFor(() => expect(loginSignal).toBe(controller.signal))
    controller.abort()

    expect(loginSignal?.aborted).toBe(true)
    await expectation
  })

  it("uses the upstream login message when a 200 response still reports login failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 500,
            message: "invalid credentials",
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    await expect(
      octopusAuthManager.login("https://octopus.example.com", {
        username: "alice",
        password: "secret",
      }),
    ).rejects.toThrow("invalid credentials")
  })

  it("reuses cached tokens and refreshes again when they are close to expiry", async () => {
    const nowSpy = vi.spyOn(Date, "now")
    nowSpy.mockReturnValue(1_700_000_000_000)

    const loginSpy = vi
      .spyOn(octopusAuthManager, "login")
      .mockResolvedValueOnce({
        token: "first-token",
        expire_at: new Date(1_700_000_600_000).toISOString(),
      })
      .mockResolvedValueOnce({
        token: "second-token",
        expire_at: new Date(1_700_001_200_000).toISOString(),
      })

    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("first-token")

    nowSpy.mockReturnValue(1_700_000_120_000)
    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("first-token")

    nowSpy.mockReturnValue(1_700_000_560_000)
    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("second-token")

    expect(loginSpy).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it("falls back to the default TTL when the server returns an invalid expire_at", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const loginSpy = vi
      .spyOn(octopusAuthManager, "login")
      .mockResolvedValueOnce({
        token: "fallback-token",
        expire_at: "invalid-date",
      })

    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("fallback-token")

    nowSpy.mockReturnValue(1_700_000_600_000)
    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("fallback-token")

    expect(loginSpy).toHaveBeenCalledTimes(1)

    nowSpy.mockRestore()
  })

  it("returns a validation error message instead of throwing", async () => {
    const loginSpy = vi
      .spyOn(octopusAuthManager, "login")
      .mockRejectedValueOnce(new Error("bad credentials"))

    const result = await octopusAuthManager.validateConfig({
      baseUrl: "https://octopus.example.com",
      username: "alice",
      password: "wrong",
    })

    expect(result).toEqual({
      success: false,
      error: "bad credentials",
    })
    expect(loginSpy).toHaveBeenCalledTimes(1)
  })

  it("returns success when validateConfig can obtain a valid token", async () => {
    const tokenSpy = vi
      .spyOn(octopusAuthManager, "getValidToken")
      .mockResolvedValueOnce("cached-token")

    await expect(
      octopusAuthManager.validateConfig({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toEqual({ success: true })

    expect(tokenSpy).toHaveBeenCalledTimes(1)
  })

  it("clearCache invalidates only the targeted cached credential", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const loginSpy = vi
      .spyOn(octopusAuthManager, "login")
      .mockResolvedValueOnce({
        token: "alice-token",
        expire_at: new Date(1_700_000_900_000).toISOString(),
      })
      .mockResolvedValueOnce({
        token: "bob-token",
        expire_at: new Date(1_700_000_900_000).toISOString(),
      })
      .mockResolvedValueOnce({
        token: "alice-token-2",
        expire_at: new Date(1_700_001_200_000).toISOString(),
      })

    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("alice-token")
    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "bob",
        password: "secret",
      }),
    ).resolves.toBe("bob-token")

    octopusAuthManager.clearCache("https://octopus.example.com", "alice")

    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toBe("alice-token-2")
    await expect(
      octopusAuthManager.getValidToken({
        baseUrl: "https://octopus.example.com",
        username: "bob",
        password: "secret",
      }),
    ).resolves.toBe("bob-token")

    expect(loginSpy).toHaveBeenCalledTimes(3)

    nowSpy.mockRestore()
  })
})
