import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { newApiAuthBundleContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/newApiAuthBundle"

const NOW_SECONDS = 1_800_000_000
const PAGE_ORIGIN = "https://panel.example.invalid"
const INVALID_AUTH_BUNDLE_ERROR =
  "New API dashboard session response is invalid"

function createAuthBundle(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      access_token: "dashboard-token-placeholder",
      token_type: "Bearer",
      access_expires_at: NOW_SECONDS + 900,
      user: {
        id: 42,
        username: "example-user",
      },
      session: {
        sid: "session-placeholder",
        current: true,
      },
      ...overrides,
    },
  }
}

function createResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

function createLocalStorageMock() {
  return {
    clear: vi.fn(),
    getItem: vi.fn().mockReturnValue(null),
    key: vi.fn().mockReturnValue(null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
    length: 0,
  }
}

describe("newApiAuthBundleContentSessionExtractor", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.spyOn(Date, "now").mockReturnValue(NOW_SECONDS * 1000)
    vi.stubGlobal("location", { origin: PAGE_ORIGIN })
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  it("extracts known New API sites or an explicitly enabled unknown-site probe", () => {
    expect(
      newApiAuthBundleContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).toBe(true)
    expect(
      newApiAuthBundleContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.ONE_API,
      }),
    ).toBe(false)
    expect(
      newApiAuthBundleContentSessionExtractor.canExtract({
        siteTypeHint: SITE_TYPES.VELOERA,
      }),
    ).toBe(false)
    expect(
      newApiAuthBundleContentSessionExtractor.canExtract({
        allowNewApiAuthProbe: true,
      }),
    ).toBe(true)
    expect(newApiAuthBundleContentSessionExtractor.canExtract({})).toBe(false)
  })

  it("extracts a future, current AuthBundle from the actual page origin without writing storage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createResponse(createAuthBundle()))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        url: "https://message-origin.example.invalid/console",
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).resolves.toEqual({
      userId: "42",
      user: {
        id: 42,
        username: "example-user",
      },
      siteTypeHint: SITE_TYPES.NEW_API,
      transientAuth: {
        kind: "new_api_dashboard_bearer",
        token: "dashboard-token-placeholder",
        expiresAt: NOW_SECONDS + 900,
        sessionId: "session-placeholder",
        origin: PAGE_ORIGIN,
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `${PAGE_ORIGIN}/api/user/auth/refresh`,
      {
        credentials: "include",
        method: "POST",
      },
    )
    expect(localStorage.setItem).not.toHaveBeenCalled()
    expect(localStorage.removeItem).not.toHaveBeenCalled()
    expect(localStorage.clear).not.toHaveBeenCalled()
  })

  it.each([
    ["a non-object envelope", null],
    ["an unsuccessful envelope", { success: false, data: {} }],
    ["an unrelated object", { success: true, data: { greeting: "hello" } }],
    [
      "an unrelated generic user",
      { success: true, data: { user: { id: "example-user" } } },
    ],
    [
      "an unrelated generic session",
      { success: true, data: { session: { state: "active" } } },
    ],
  ])("returns null for %s", async (_description, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createResponse(body)))

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).resolves.toBeNull()
  })

  it.each([
    [
      "an incomplete token-marked response",
      { success: true, data: { access_token: "token-placeholder" } },
    ],
    [
      "an incomplete session-signature response",
      { success: true, data: { session: { sid: "session-placeholder" } } },
    ],
    ["a non-Bearer token type", createAuthBundle({ token_type: "bearer" })],
    ["a blank access token", createAuthBundle({ access_token: "   " })],
    [
      "a non-finite access expiry",
      createAuthBundle({ access_expires_at: Number.NaN }),
    ],
    [
      "an expired access token",
      createAuthBundle({ access_expires_at: NOW_SECONDS }),
    ],
    ["a user without identity", createAuthBundle({ user: { name: "No ID" } })],
    ["a blank session id", createAuthBundle({ session: { sid: " " } })],
    [
      "a non-current session",
      createAuthBundle({
        session: { sid: "session-placeholder", current: false },
      }),
    ],
  ])("rejects %s", async (_description, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createResponse(body)))

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).rejects.toThrow(INVALID_AUTH_BUNDLE_ERROR)
  })

  it("rejects a successful response that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
      }),
    )

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).rejects.toThrow(INVALID_AUTH_BUNDLE_ERROR)
  })

  it("throws a controlled error when the refresh request is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("sensitive transport details")),
    )

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).rejects.toEqual(new Error("New API session refresh request failed"))
  })

  it("throws a controlled error for other non-legacy HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse(
          {
            message: "must-not-leak-server-details",
            access_token: "must-not-leak-token",
          },
          500,
        ),
      ),
    )

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).rejects.toEqual(new Error("New API session refresh failed (500)"))
  })

  it("falls back to status details when a controlled error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")),
      }),
    )

    await expect(
      newApiAuthBundleContentSessionExtractor.extract({
        siteTypeHint: SITE_TYPES.NEW_API,
      }),
    ).rejects.toEqual(new Error("New API session refresh failed (401)"))
  })

  it.each([
    ["only a code", { code: "AUTH_REQUIRED" }, "AUTH_REQUIRED"],
    [
      "only a message",
      { message: "Session unavailable" },
      "Session unavailable",
    ],
    [
      "no public fields",
      { success: false },
      "New API session refresh failed (409)",
    ],
  ])(
    "keeps useful upstream diagnostics for a controlled response with %s",
    async (_description, body, expectedMessage) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(createResponse(body, 409)),
      )

      await expect(
        newApiAuthBundleContentSessionExtractor.extract({
          siteTypeHint: SITE_TYPES.NEW_API,
        }),
      ).rejects.toEqual(new Error(expectedMessage))
    },
  )

  it.each([404, 405])(
    "returns null for legacy-compatible HTTP %i responses",
    async (status) => {
      const response = createResponse({ unexpected: "body" }, status)
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

      await expect(
        newApiAuthBundleContentSessionExtractor.extract({
          siteTypeHint: SITE_TYPES.NEW_API,
        }),
      ).resolves.toBeNull()
      expect(response.json).not.toHaveBeenCalled()
    },
  )

  it.each([
    [401, "AUTH_UNAUTHORIZED", "Unauthorized"],
    [409, "AUTH_SESSION_MISMATCH", "Conflict"],
    [429, "AUTH_SESSION_ISSUANCE_LIMIT", "Too Many Requests"],
  ])(
    "throws a controlled safe error for HTTP %i",
    async (status, code, message) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          createResponse(
            {
              success: false,
              code,
              message,
              data: {
                access_token: "must-not-leak-token",
                session: { sid: "must-not-leak-session" },
              },
            },
            status,
          ),
        ),
      )

      let caught: unknown
      try {
        await newApiAuthBundleContentSessionExtractor.extract({
          siteTypeHint: SITE_TYPES.NEW_API,
        })
      } catch (error) {
        caught = error
      }

      expect(caught).toEqual(new Error(`${code}: ${message}`))
      expect((caught as Error).message).not.toContain("must-not-leak-token")
      expect((caught as Error).message).not.toContain("must-not-leak-session")
    },
  )
})
