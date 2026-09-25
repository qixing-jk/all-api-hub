import { beforeEach, describe, expect, it, vi } from "vitest"

import { rightCodeContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/rightcode"

const USER_TOKEN_KEY = "userToken"
const AUTH_STORAGE_KEY = "auth-storage"

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

describe("rightCodeContentSessionExtractor", () => {
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

  it("extracts the account token and identity from the console's own storage", async () => {
    storeSession({
      [USER_TOKEN_KEY]: "account-token",
      [AUTH_STORAGE_KEY]: JSON.stringify({
        state: {
          user: {
            id: 7,
            username: "example-user",
            email: "example@example.invalid",
            user_token: "account-token",
          },
          token: "account-token",
          isAuthenticated: true,
        },
        version: 0,
      }),
    })

    expect(rightCodeContentSessionExtractor.canExtract({})).toBe(true)
    await expect(rightCodeContentSessionExtractor.extract({})).resolves.toEqual(
      {
        userId: 7,
        user: {
          id: 7,
          username: "example-user",
          email: "example@example.invalid",
        },
        accessToken: "account-token",
        siteTypeHint: "RightCode",
      },
    )
  })

  it("does not claim a page that only happens to use the generic auth-storage key", async () => {
    storeSession({
      [USER_TOKEN_KEY]: null,
      [AUTH_STORAGE_KEY]: JSON.stringify({
        state: { user: { id: 1 }, token: "other-site-token" },
        version: 0,
      }),
    })

    expect(rightCodeContentSessionExtractor.canExtract({})).toBe(true)
    await expect(
      rightCodeContentSessionExtractor.extract({}),
    ).resolves.toBeNull()
  })

  it("stays idle on a signed-out console", async () => {
    storeSession({ [USER_TOKEN_KEY]: null, [AUTH_STORAGE_KEY]: null })

    expect(rightCodeContentSessionExtractor.canExtract({})).toBe(false)
    await expect(
      rightCodeContentSessionExtractor.extract({}),
    ).resolves.toBeNull()
  })

  it("ignores a corrupt auth store instead of failing detection", async () => {
    storeSession({
      [USER_TOKEN_KEY]: "account-token",
      [AUTH_STORAGE_KEY]: "{not json",
    })

    await expect(
      rightCodeContentSessionExtractor.extract({}),
    ).resolves.toBeNull()
  })

  it("logs nothing while reading the session", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    storeSession({
      [USER_TOKEN_KEY]: "account-token",
      [AUTH_STORAGE_KEY]: JSON.stringify({
        state: { user: { id: 7, username: "example-user" } },
        version: 0,
      }),
    })

    await rightCodeContentSessionExtractor.extract({})

    expect(logSpy).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })
})
