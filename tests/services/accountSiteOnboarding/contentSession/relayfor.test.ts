import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { relayForContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/relayfor"

const TOKEN_KEY = "relayfor_token"
const LEGACY_TOKEN_KEY = "topublic_proxy_token"

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

describe("relayForContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  const storeSession = (values: Record<string, string | null>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
  }

  it("extracts account token and verifies identity via /api/user/self", async () => {
    storeSession({
      [TOKEN_KEY]: "test-relayfor-token",
    })

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 42,
        username: "relayuser",
        quota: 500000,
        role: 1,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const context = { url: "https://relayfor.xyz/console/" }
    expect(relayForContentSessionExtractor.canExtract(context)).toBe(true)

    const result = await relayForContentSessionExtractor.extract(context)
    expect(result).toEqual({
      userId: 42,
      user: {
        id: 42,
        username: "relayuser",
      },
      accessToken: "test-relayfor-token",
      siteTypeHint: SITE_TYPES.RELAYFOR,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://relayfor.xyz/api/user/self",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-relayfor-token",
        }),
      }),
    )
  })

  it("extracts legacy topublic_proxy_token if relayfor_token is absent", async () => {
    storeSession({
      [TOKEN_KEY]: null,
      [LEGACY_TOKEN_KEY]: "legacy-token-123",
    })

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 100,
        username: "legacyuser",
        quota: 1000000,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const context = { url: "https://relayfor.xyz" }
    expect(relayForContentSessionExtractor.canExtract(context)).toBe(true)

    const result = await relayForContentSessionExtractor.extract(context)
    expect(result?.accessToken).toBe("legacy-token-123")
    expect(result?.userId).toBe(100)
  })

  it("returns null when /api/user/self fails", async () => {
    storeSession({
      [TOKEN_KEY]: "invalid-token",
    })

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
    })
    vi.stubGlobal("fetch", fetchMock)

    const context = { url: "https://relayfor.xyz" }
    expect(relayForContentSessionExtractor.canExtract(context)).toBe(true)

    const result = await relayForContentSessionExtractor.extract(context)
    expect(result).toBeNull()
  })

  it("rejects non-RelayFor origins and missing URLs even when tokens exist", async () => {
    storeSession({
      [TOKEN_KEY]: "test-token",
    })

    expect(
      relayForContentSessionExtractor.canExtract({ url: "https://other.xyz" }),
    ).toBe(false)
    expect(relayForContentSessionExtractor.canExtract({})).toBe(false)
  })
})
