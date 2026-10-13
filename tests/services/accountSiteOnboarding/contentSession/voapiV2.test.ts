import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { CONTENT_SESSION_REQUEST_TIMEOUT_MS } from "~/services/accountSiteOnboarding/contentSession/network"
import { voApiV2ContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/voapiV2"
import { ContentSessionProtocolError } from "~/services/accountSiteOnboarding/contracts"

const jwtWithUserId =
  "eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjQyLCJleHAiOjQxMDI0NDQ4MDB9.signature"

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value))
    }),
    get length() {
      return store.size
    },
  }
}

describe("voApiV2ContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", createLocalStorageMock())
    vi.stubGlobal("location", { origin: "https://voapi.example" })
  })

  it("extracts the dashboard JWT from userStore.auth.token", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({
        auth: {
          token: jwtWithUserId,
          email: "owner@example.invalid",
        },
      }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 42,
        username: "owner",
        display_name: "Owner",
        email: "owner@example.invalid",
        access_token: null,
      }),
    )

    await expect(
      voApiV2ContentSessionExtractor.extract({
        url: "https://example.invalid",
      }),
    ).resolves.toEqual({
      userId: 42,
      user: {
        id: 42,
        username: "owner",
        display_name: "Owner",
        email: "owner@example.invalid",
      },
      accessToken: jwtWithUserId,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    })
  })

  it("only directly extracts the stored user for a known VoAPI site type", () => {
    expect(voApiV2ContentSessionExtractor.canExtract({})).toBe(false)

    localStorage.setItem("userStore", JSON.stringify({ auth: {} }))

    expect(
      voApiV2ContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.VO_API_V2,
      }),
    ).toBe(true)
    expect(voApiV2ContentSessionExtractor.canExtract({})).toBe(false)
    expect(
      voApiV2ContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).toBe(false)
  })

  it("probes the same-origin user info endpoint with the raw JWT and extracts a matching identity", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42, username: "owner" }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { id: 42, username: "owner" } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      voApiV2ContentSessionExtractor.probe?.({
        url: "https://voapi.example",
        allowSessionProbe: true,
      }),
    ).resolves.toMatchObject({
      userId: 42,
      accessToken: jwtWithUserId,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]!
    expect((url as URL).href).toBe("https://voapi.example/api/user/info")
    expect(options).toMatchObject({
      method: "GET",
      credentials: "omit",
      headers: { Authorization: jwtWithUserId },
      redirect: "error",
    })
    expect(options.signal).toBeDefined()
  })

  it("does not probe when the server identity does not match stored and JWT identity", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { id: 99 } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "https://voapi.example" }),
    ).resolves.toBeNull()
  })

  it("rejects malformed probe URLs before requesting account data", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "not a URL" }),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not extract if the token snapshot changes during the probe", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        localStorage.setItem(
          "userStore",
          JSON.stringify({ auth: { token: "changed.token.value" } }),
        )
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: { id: 42 } }),
        }
      }),
    )
    const extractSpy = vi.spyOn(voApiV2ContentSessionExtractor, "extract")

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "https://voapi.example" }),
    ).resolves.toBeNull()
    expect(extractSpy).not.toHaveBeenCalled()
  })

  it("does not extract if the page origin changes during the probe", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    const locationMock = { origin: "https://voapi.example" }
    vi.stubGlobal("location", locationMock)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        locationMock.origin = "https://other.example"
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: { id: 42 } }),
        }
      }),
    )
    const extractSpy = vi.spyOn(voApiV2ContentSessionExtractor, "extract")

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "https://voapi.example" }),
    ).resolves.toBeNull()
    expect(extractSpy).not.toHaveBeenCalled()
  })

  it("treats an identity cache change after server verification as authoritative", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        localStorage.setItem("user", JSON.stringify({ id: 99 }))
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: { id: 42 } }),
        }
      }),
    )

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "https://voapi.example" }),
    ).rejects.toBeInstanceOf(ContentSessionProtocolError)
  })

  it("rejects when the extracted VoAPI identity changes after verification", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 42 } }),
      }),
    )
    vi.spyOn(voApiV2ContentSessionExtractor, "extract").mockResolvedValue({
      userId: 99,
      user: { id: 99 },
      accessToken: jwtWithUserId,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    })

    const result = voApiV2ContentSessionExtractor.probe?.({
      url: "https://voapi.example",
    })
    await expect(result).rejects.toBeInstanceOf(ContentSessionProtocolError)
    await expect(result).rejects.toThrow(
      "VoAPI session identity changed after verification",
    )
  })

  it("wraps unexpected extraction failures after VoAPI identity verification", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 42 }))
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 42 } }),
      }),
    )
    vi.spyOn(voApiV2ContentSessionExtractor, "extract").mockRejectedValue(
      new Error("unexpected failure"),
    )

    const result = voApiV2ContentSessionExtractor.probe?.({
      url: "https://voapi.example",
    })
    await expect(result).rejects.toBeInstanceOf(ContentSessionProtocolError)
    await expect(result).rejects.toThrow("VoAPI session extraction failed")
  })

  it("rejects a 503 probe instead of returning null and masking a cached fallback", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: 503, data: null }),
      }),
    )

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "https://voapi.example" }),
    ).rejects.toThrow("VoAPI session probe request failed")
  })

  it("times out a hanging response body", async () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem(
        "userStore",
        JSON.stringify({ auth: { token: jwtWithUserId } }),
      )
      localStorage.setItem("user", JSON.stringify({ id: 42 }))
      let resolveBody!: (value: unknown) => void
      const pendingBody = new Promise<unknown>((resolve) => {
        resolveBody = resolve
      })
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => pendingBody,
      })
      vi.stubGlobal("fetch", fetchMock)
      const probe = voApiV2ContentSessionExtractor.probe?.({
        url: "https://voapi.example",
      })
      const failure = expect(probe).rejects.toThrow(
        "VoAPI session probe request failed",
      )
      await vi.advanceTimersByTimeAsync(CONTENT_SESSION_REQUEST_TIMEOUT_MS)
      await failure
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
      resolveBody({ code: 0, data: { id: 42 } })
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("propagates request failures instead of returning an unsupported result", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      voApiV2ContentSessionExtractor.probe?.({ url: "https://voapi.example" }),
    ).rejects.toThrow("VoAPI session probe request failed")
  })

  it("falls back to JWT userId when localStorage.user has no id", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ access_token: null }))

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result?.userId).toBe(42)
    expect(result?.accessToken).toBe(jwtWithUserId)
  })

  it("does not let a stale stored user identity override the JWT identity", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem("user", JSON.stringify({ id: 7, username: "stale" }))

    await expect(
      voApiV2ContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.VO_API_V2,
      }),
    ).resolves.toBeNull()
  })

  it("does not use localStorage.user.access_token", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: jwtWithUserId } }),
    )
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 42, access_token: "wrong-token" }),
    )

    const result = await voApiV2ContentSessionExtractor.extract({})

    expect(result?.accessToken).toBe(jwtWithUserId)
    expect(result?.accessToken).not.toBe("wrong-token")
  })

  it("returns null when userStore is absent or malformed", async () => {
    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()

    localStorage.setItem("userStore", "{")
    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()
  })

  it("returns null when the dashboard JWT payload is malformed and no stored user id exists", async () => {
    localStorage.setItem(
      "userStore",
      JSON.stringify({ auth: { token: "not-a.jwt" } }),
    )

    await expect(voApiV2ContentSessionExtractor.extract({})).resolves.toBeNull()
  })
})
