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

  it("normalizes the legacy Octopus token login contract", async () => {
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
      mode: "bearer",
      token: "jwt-token",
      expireAt: new Date("2026-03-29T01:00:00.000Z").getTime(),
    })
  })

  it("accepts a successful tokenless Octopus login as a cookie session", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 200,
          message: "success",
          data: "signed in",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      octopusAuthManager.login("https://octopus.example.com", {
        username: "alice",
        password: "secret",
      }),
    ).resolves.toEqual({
      mode: "cookie",
      expireAt: 1_700_000_900_000,
      confirmed: false,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://octopus.example.com/api/v1/user/login",
      expect.objectContaining({ credentials: "include" }),
    )
  })

  it("rejects a malformed legacy token response instead of treating it as a cookie session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: { token: "", expire_at: "invalid" },
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
    ).rejects.toThrow("Invalid legacy token response")
  })

  it.each([null, [], "success"])(
    "rejects a non-object login envelope: %j",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )

      await expect(
        octopusAuthManager.login("https://octopus.example.com", {
          username: "alice",
          password: "secret",
        }),
      ).rejects.toThrow("Login failed")
    },
  )

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
          const signal = init?.signal
          if (!signal) {
            reject(new Error("missing abort signal"))
            return
          }

          signal.addEventListener("abort", () => {
            reject(
              signal.reason ??
                new DOMException("The operation was aborted", "AbortError"),
            )
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
    const abortReason = new Error("caller cancelled")
    abortReason.name = "AbortError"
    const expectation = expect(login).rejects.toBe(abortReason)

    await vi.waitFor(() => expect(loginSignal).toBe(controller.signal))
    controller.abort(abortReason)

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
        mode: "bearer",
        token: "first-token",
        expireAt: 1_700_000_600_000,
      })
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "second-token",
        expireAt: 1_700_001_200_000,
      })

    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "first-token" })

    nowSpy.mockReturnValue(1_700_000_120_000)
    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "first-token" })

    nowSpy.mockReturnValue(1_700_000_560_000)
    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "second-token" })

    expect(loginSpy).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it("falls back to the default TTL when the server returns an invalid expire_at", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const loginSpy = vi.spyOn(octopusAuthManager, "login")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            data: { token: "fallback-token", expire_at: "invalid-date" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toEqual({
      mode: "bearer",
      token: "fallback-token",
      expireAt: 1_700_000_900_000,
    })

    nowSpy.mockReturnValue(1_700_000_600_000)
    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "fallback-token" })

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
      .spyOn(octopusAuthManager, "getValidSession")
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "cached-token",
        expireAt: 1_700_000_900_000,
      })

    await expect(
      octopusAuthManager.validateConfig({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toEqual({ success: true })

    expect(tokenSpy).toHaveBeenCalledTimes(1)
  })

  it("does not validate changed credentials from a cached session", async () => {
    const config = {
      baseUrl: "https://octopus.example.com",
      username: "alice",
      password: "old-secret",
    }
    const loginSpy = vi
      .spyOn(octopusAuthManager, "login")
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "cached-token",
        expireAt: 1_700_000_900_000,
      })
      .mockRejectedValueOnce(new Error("bad credentials"))

    await octopusAuthManager.getValidSession(config)

    await expect(
      octopusAuthManager.validateConfig({
        ...config,
        password: "wrong-secret",
      }),
    ).resolves.toEqual({
      success: false,
      error: "bad credentials",
    })
    expect(loginSpy).toHaveBeenCalledTimes(2)
  })

  it("clearCache invalidates only the targeted cached credential", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
    const loginSpy = vi
      .spyOn(octopusAuthManager, "login")
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "alice-token",
        expireAt: 1_700_000_900_000,
      })
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "bob-token",
        expireAt: 1_700_000_900_000,
      })
      .mockResolvedValueOnce({
        mode: "bearer",
        token: "alice-token-2",
        expireAt: 1_700_001_200_000,
      })

    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "alice-token" })
    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "bob",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "bob-token" })

    octopusAuthManager.clearCache("https://octopus.example.com", "alice")

    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "alice",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "alice-token-2" })
    await expect(
      octopusAuthManager.getValidSession({
        baseUrl: "https://octopus.example.com",
        username: "bob",
        password: "secret",
      }),
    ).resolves.toMatchObject({ mode: "bearer", token: "bob-token" })

    expect(loginSpy).toHaveBeenCalledTimes(3)

    nowSpy.mockRestore()
  })
})
