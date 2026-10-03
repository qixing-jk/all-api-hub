import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { grsaiContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/grsai"
import { server } from "~~/tests/msw/server"

const TOKEN_KEY = "Token"

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

describe("grsaiContentSessionExtractor", () => {
  it("ignores malformed console URLs", async () => {
    await expect(
      grsaiContentSessionExtractor.extract({ url: "not a URL" }),
    ).resolves.toBeNull()
  })

  it("ignores malformed console response bodies", async () => {
    storeToken("session-token")
    server.use(
      http.post(
        "https://eb.grsaiapi.com/client/grsai/getUserInfo",
        () => new HttpResponse("not JSON"),
      ),
    )
    await expect(
      grsaiContentSessionExtractor.extract({
        url: "https://grsai.com/dashboard",
      }),
    ).resolves.toBeNull()
  })
  beforeEach(() => {
    server.resetHandlers()
    vi.unstubAllGlobals()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  const storeToken = (value: string) => localStorage.setItem(TOKEN_KEY, value)

  const answerWithUserInfo = () =>
    http.post(
      "https://eb.grsaiapi.com/client/grsai/getUserInfo",
      ({ request }) => {
        if (request.headers.get("authorization") !== "session-token") {
          return HttpResponse.json({ code: -10000, data: null, msg: "" })
        }
        return HttpResponse.json({
          code: 0,
          msg: "success",
          data: {
            id: "6aba891720c8e541cff9d0e3",
            mail: "example@example.invalid",
            credits: 5000,
          },
        })
      },
    )

  it("ignores other sites even when a token is present", () => {
    storeToken("session-token")

    expect(
      grsaiContentSessionExtractor.canExtract({ url: "https://grsai.invalid" }),
    ).toBe(false)
    expect(
      grsaiContentSessionExtractor.canExtract({
        url: "https://example.invalid",
      }),
    ).toBe(false)
  })

  it("does not claim a console page without the stored token", () => {
    expect(
      grsaiContentSessionExtractor.canExtract({
        url: "https://grsai.com/dashboard",
      }),
    ).toBe(false)
  })

  it("reads the account identity through the console API", async () => {
    storeToken("session-token")
    server.use(answerWithUserInfo())

    await expect(
      grsaiContentSessionExtractor.extract({
        url: "https://grsai.com/dashboard/api-keys",
      }),
    ).resolves.toEqual({
      userId: "6aba891720c8e541cff9d0e3",
      user: {
        id: "6aba891720c8e541cff9d0e3",
        username: "example@example.invalid",
      },
      accessToken: "session-token",
      siteTypeHint: "grsai",
    })
  })

  it("extracts from the second console domain too", async () => {
    storeToken("session-token")
    server.use(answerWithUserInfo())

    await expect(
      grsaiContentSessionExtractor.extract({
        url: "https://grsai.ai/dashboard",
      }),
    ).resolves.toMatchObject({ accessToken: "session-token" })
  })

  it("returns null when the console rejects the stored token", async () => {
    storeToken("stale-token")
    server.use(answerWithUserInfo())

    await expect(
      grsaiContentSessionExtractor.extract({
        url: "https://grsai.com/dashboard",
      }),
    ).resolves.toBeNull()
  })

  it("returns null when the console is unreachable", async () => {
    storeToken("session-token")
    server.use(
      http.post(
        "https://eb.grsaiapi.com/client/grsai/getUserInfo",
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    await expect(
      grsaiContentSessionExtractor.extract({
        url: "https://grsai.com/dashboard",
      }),
    ).resolves.toBeNull()
  })
})
