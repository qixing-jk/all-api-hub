import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { runCompatibleRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/compatibleAccountSaveFlow"
import {
  loginToCompatibleApiRealSite,
  type CompatibleApiRealSiteConfig,
} from "~~/e2e/utils/realSite/compatibleApi"
import { loginToRealNewApiSite } from "~~/e2e/utils/realSite/newApi"

const mocks = vi.hoisted(() => ({
  saveAutoDetectedAccountFromApp: vi.fn(),
}))

vi.mock("~~/e2e/utils/accountLifecycle", () => ({
  saveAutoDetectedAccountFromApp: mocks.saveAutoDetectedAccountFromApp,
}))

const ORIGIN = "https://panel.example.invalid"
const AUTH_REFRESH_URL = `${ORIGIN}/api/user/auth/refresh`
const AUTH_LOGOUT_URL = `${ORIGIN}/api/user/auth/logout`
const AUTH_SESSION_DELETE_URL = `${ORIGIN}/api/user/sessions/session-id-placeholder`
const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 3_600

const config: CompatibleApiRealSiteConfig = {
  baseUrl: ORIGIN,
  loginUrl: `${ORIGIN}/login`,
  loginApiUrl: `${ORIGIN}/api/user/login`,
  login2faApiUrl: `${ORIGIN}/api/user/login/2fa`,
  username: "example-user",
  password: "example-password",
}

function createResponse(status: number, body: unknown) {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  }
}

function createAuthBundle(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      access_token: "access-token-placeholder",
      token_type: "Bearer",
      access_expires_at: FUTURE_EXPIRY,
      user: {
        id: 42,
        username: "example-user",
      },
      session: {
        sid: "session-id-placeholder",
        current: true,
      },
      ...overrides,
    },
  }
}

function createPage(
  post: ReturnType<typeof vi.fn>,
  options: {
    storedUser?: Record<string, unknown>
    getRequest?: ReturnType<typeof vi.fn>
    deleteRequest?: ReturnType<typeof vi.fn>
  } = {},
) {
  const evaluate = vi.fn().mockResolvedValue(undefined)
  const waitForFunction = options.storedUser
    ? vi.fn().mockResolvedValue({
        jsonValue: vi.fn().mockResolvedValue(options.storedUser),
      })
    : vi.fn().mockRejectedValue(new Error("no stored user"))

  return {
    page: {
      url: vi.fn().mockReturnValue(`${ORIGIN}/login`),
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate,
      waitForFunction,
      request: {
        post,
        get: options.getRequest ?? vi.fn(),
        delete: options.deleteRequest ?? vi.fn(),
      },
      close: vi.fn().mockResolvedValue(undefined),
    } as any,
    evaluate,
    waitForFunction,
  }
}

describe("compatible real-site login", () => {
  it("keeps legacy user responses and localStorage seeding unchanged", async () => {
    const user = { id: 7, username: "legacy-user" }
    const post = vi.fn().mockResolvedValue(
      createResponse(200, {
        success: true,
        data: user,
      }),
    )
    const { page, evaluate } = createPage(post)

    await expect(
      loginToCompatibleApiRealSite(page, config, {
        label: "Legacy API",
        envPrefix: "LEGACY_API",
      }),
    ).resolves.toEqual({ reusedSession: false, user })

    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), {
      user: JSON.stringify(user),
    })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("keeps marker-shaped legacy users unchanged for non-opt-in wrappers", async () => {
    const user = {
      id: 7,
      username: "legacy-user",
      access_token: "legacy-access-token-placeholder",
      session: { sid: "legacy-session-value", current: false },
    }
    const post = vi.fn().mockResolvedValue(
      createResponse(200, {
        success: true,
        data: user,
      }),
    )
    const { page, evaluate } = createPage(post)

    await expect(
      loginToCompatibleApiRealSite(page, config, {
        label: "Legacy API",
        envPrefix: "LEGACY_API",
      }),
    ).resolves.toEqual({ reusedSession: false, user })

    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), {
      user: JSON.stringify(user),
    })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("returns a fresh rc.22 AuthBundle without storage seeding or UI fallback", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
    const { page, evaluate, waitForFunction } = createPage(post)

    const result = await loginToRealNewApiSite(page, config)

    expect(result).toMatchObject({
      reusedSession: false,
      user: { id: 42, username: "example-user" },
      cleanupOwnedSession: expect.any(Function),
    })
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it("logs only the visible New API session counts after login", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
    const getRequest = vi.fn().mockResolvedValue(
      createResponse(200, {
        success: true,
        data: [
          { sid: "must-not-leak-current-sid", current: true },
          { sid: "must-not-leak-other-sid", current: false },
        ],
      }),
    )
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const { page } = createPage(post, { getRequest })
    let messages = ""

    try {
      await loginToRealNewApiSite(page, config)
      messages = info.mock.calls.flat().join(" ")
    } finally {
      info.mockRestore()
    }

    expect(getRequest).toHaveBeenCalledWith(
      `${ORIGIN}/api/user/sessions`,
      expect.objectContaining({
        failOnStatusCode: false,
        headers: {
          Authorization: "Bearer access-token-placeholder",
        },
      }),
    )
    expect(messages).toContain("visible_active=two")
    expect(messages).toContain("current=one")
    expect(messages).not.toContain("must-not-leak")
  })

  it("reuses an existing AuthBundle session without taking cleanup ownership", async () => {
    const post = vi
      .fn()
      .mockResolvedValue(createResponse(200, createAuthBundle()))
    const { page, evaluate, waitForFunction } = createPage(post)

    const result = await loginToRealNewApiSite(page, config)

    expect(result).toEqual({
      reusedSession: true,
      user: { id: 42, username: "example-user" },
    })
    expect(result.cleanupOwnedSession).toBeUndefined()
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("logs out only the fresh owned session with exact safe headers", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
      .mockResolvedValueOnce(createResponse(200, { success: true }))
    const { page } = createPage(post)

    const result = await loginToRealNewApiSite(page, config)
    await result.cleanupOwnedSession?.()

    expect(post).toHaveBeenLastCalledWith(AUTH_LOGOUT_URL, {
      failOnStatusCode: false,
      headers: {
        Origin: ORIGIN,
        Authorization: "Bearer access-token-placeholder",
        "X-Auth-Session": "session-id-placeholder",
      },
    })
  })

  it("revokes only the fresh owned session when logout detects a cookie mismatch", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
      .mockResolvedValueOnce(
        createResponse(409, {
          code: "AUTH_SESSION_MISMATCH",
          message: "must-not-leak-server-message",
        }),
      )
    const deleteRequest = vi.fn().mockResolvedValue(createResponse(200, {}))
    const { page } = createPage(post, { deleteRequest })

    const result = await loginToRealNewApiSite(page, config)
    await result.cleanupOwnedSession?.()

    expect(deleteRequest).toHaveBeenCalledWith(AUTH_SESSION_DELETE_URL, {
      failOnStatusCode: false,
      headers: {
        Origin: ORIGIN,
        Authorization: "Bearer access-token-placeholder",
      },
    })
    expect(
      post.mock.calls.some(([url]) =>
        String(url).includes("/api/user/sessions/revoke-others"),
      ),
    ).toBe(false)
  })

  it("logs out the fresh owned session once when downstream account saving fails", async () => {
    const saveError = new Error("account save failed")
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
      .mockResolvedValueOnce(createResponse(200, { success: true }))
    const { page: sitePage } = createPage(post)

    mocks.saveAutoDetectedAccountFromApp.mockRejectedValueOnce(saveError)

    await expect(
      runCompatibleRealSiteAccountSaveFlow({
        page: { on: vi.fn() } as any,
        extensionId: "extension-id",
        serviceWorker: {} as any,
        sitePage,
        config,
        siteType: SITE_TYPES.NEW_API,
        login: loginToRealNewApiSite,
      }),
    ).rejects.toBe(saveError)

    expect(post.mock.calls.filter(([url]) => url === AUTH_LOGOUT_URL)).toEqual([
      [
        AUTH_LOGOUT_URL,
        {
          failOnStatusCode: false,
          headers: {
            Origin: ORIGIN,
            Authorization: "Bearer access-token-placeholder",
            "X-Auth-Session": "session-id-placeholder",
          },
        },
      ],
    ])
    expect(
      post.mock.calls.some(([url]) =>
        String(url).includes("/api/user/sessions/revoke-others"),
      ),
    ).toBe(false)
    expect(sitePage.close).toHaveBeenCalledOnce()
  })

  it("uses the successful 2FA AuthBundle response as the login result", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(
        createResponse(200, { success: true, data: { require_2fa: true } }),
      )
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
    const { page, evaluate, waitForFunction } = createPage(post)

    const result = await loginToRealNewApiSite(page, {
      ...config,
      totpSecret: "JBSWY3DPEHPK3PXP",
    })

    expect(result).toMatchObject({
      reusedSession: false,
      user: { id: 42, username: "example-user" },
      cleanupOwnedSession: expect.any(Function),
    })
    expect(post).toHaveBeenNthCalledWith(3, config.login2faApiUrl, {
      data: { code: expect.stringMatching(/^\d{6}$/u) },
      failOnStatusCode: false,
    })
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  it("treats a rejected 2FA request as terminal without exposing its cause", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(
        createResponse(200, { success: true, data: { require_2fa: true } }),
      )
      .mockRejectedValueOnce(new Error("must-not-leak-transport-details"))
    const { page, evaluate, waitForFunction } = createPage(post)

    await expect(
      loginToRealNewApiSite(page, {
        ...config,
        totpSecret: "JBSWY3DPEHPK3PXP",
      }),
    ).rejects.toMatchObject({ message: "Real New API 2FA request failed." })

    expect(post).toHaveBeenCalledTimes(3)
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  it.each([
    ["a missing token type", { token_type: undefined }],
    ["a missing access expiry", { access_expires_at: undefined }],
    [
      "an expired access token",
      { access_expires_at: Math.floor(Date.now() / 1000) - 1 },
    ],
    [
      "a session without a current marker",
      { session: { sid: "session-id-placeholder" } },
    ],
    [
      "a non-current session",
      { session: { sid: "session-id-placeholder", current: false } },
    ],
  ])("treats %s as a terminal malformed refresh", async (_label, overrides) => {
    const post = vi
      .fn()
      .mockResolvedValue(createResponse(200, createAuthBundle(overrides)))
    const { page, evaluate, waitForFunction } = createPage(post)

    await expect(loginToRealNewApiSite(page, config)).rejects.toMatchObject({
      message: "Real New API auth session response is invalid.",
    })

    expect(post).toHaveBeenCalledTimes(1)
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  it.each([
    [409, "AUTH_SESSION_LIMIT"],
    [429, "AUTH_SESSION_ISSUANCE_LIMIT"],
    [503, null],
  ])(
    "treats login HTTP %i as terminal without falling back to UI",
    async (status, code) => {
      const post = vi
        .fn()
        .mockResolvedValueOnce(
          createResponse(401, { code: "AUTH_UNAUTHORIZED" }),
        )
        .mockResolvedValueOnce(
          createResponse(status, {
            success: false,
            code,
            message: "must-not-leak-server-message",
          }),
        )
      const { page, evaluate, waitForFunction } = createPage(post)

      await expect(loginToRealNewApiSite(page, config)).rejects.toMatchObject({
        message: `New API auth session request failed (HTTP ${status}${code ? `, ${code}` : ""})`,
      })
      expect(post).toHaveBeenCalledTimes(2)
      expect(evaluate).not.toHaveBeenCalled()
      expect(waitForFunction).not.toHaveBeenCalled()
    },
  )

  it("keeps a non-successful 2FA response terminal and sanitized", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(
        createResponse(200, { success: true, data: { require_2fa: true } }),
      )
      .mockResolvedValueOnce(
        createResponse(409, {
          code: "AUTH_SESSION_LIMIT",
          message: "must-not-leak-server-message",
        }),
      )
    const { page, evaluate, waitForFunction } = createPage(post)

    await expect(
      loginToRealNewApiSite(page, {
        ...config,
        totpSecret: "JBSWY3DPEHPK3PXP",
      }),
    ).rejects.toMatchObject({
      message:
        "New API auth session request failed (HTTP 409, AUTH_SESSION_LIMIT)",
    })
    expect(post).toHaveBeenCalledTimes(3)
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  it("falls back to the legacy flow for an unrelated successful refresh", async () => {
    const user = { id: 7, username: "legacy-user" }
    const post = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(200, { success: true, data: { greeting: "hello" } }),
      )
      .mockResolvedValueOnce(createResponse(200, { success: true, data: user }))
    const { page, evaluate, waitForFunction } = createPage(post)

    await expect(loginToRealNewApiSite(page, config)).resolves.toEqual({
      reusedSession: false,
      user,
    })

    expect(waitForFunction).toHaveBeenCalledTimes(1)
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), {
      user: JSON.stringify(user),
    })
  })

  it("keeps marker-bearing unsuccessful envelopes terminal on HTTP 2xx", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(200, {
          success: false,
          data: {
            access_token: "must-not-leak-token",
            session: { sid: "must-not-leak-session" },
          },
        }),
      )
      .mockResolvedValueOnce(
        createResponse(200, {
          success: true,
          data: { id: 7, username: "must-not-reach-legacy-login" },
        }),
      )
    const { page, evaluate, waitForFunction } = createPage(post)

    let caught: unknown
    try {
      await loginToRealNewApiSite(page, config)
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      message: "Real New API auth session response is invalid.",
    })
    expect((caught as Error).message).not.toContain("must-not-leak")
    expect(post).toHaveBeenCalledTimes(1)
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  it("treats a malformed successful 2FA bundle as terminal", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(
        createResponse(200, { success: true, data: { require_2fa: true } }),
      )
      .mockResolvedValueOnce(
        createResponse(200, {
          success: true,
          data: {
            id: 42,
            username: "legacy-shaped-user",
            access_token: "must-not-leak-token",
            token_type: "bearer",
            access_expires_at: FUTURE_EXPIRY,
            user: { id: 42, username: "example-user" },
            session: {
              sid: "must-not-leak-session",
              current: false,
            },
          },
        }),
      )
    const { page, evaluate, waitForFunction } = createPage(post)

    let caught: unknown
    try {
      await loginToRealNewApiSite(page, {
        ...config,
        totpSecret: "JBSWY3DPEHPK3PXP",
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      message: "Real New API auth session response is invalid.",
    })
    expect((caught as Error).message).not.toContain("must-not-leak")
    expect(post).toHaveBeenCalledTimes(3)
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
  })

  it("treats a malformed successful AuthBundle login as terminal and sanitized", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(
        createResponse(200, {
          success: true,
          data: {
            id: 42,
            username: "legacy-shaped-user",
            access_token: "must-not-leak-token",
            token_type: "bearer",
            access_expires_at: FUTURE_EXPIRY,
            user: { id: 42 },
            session: { sid: "must-not-leak-session", current: true },
          },
        }),
      )
    const { page, evaluate, waitForFunction } = createPage(post)

    let caught: unknown
    try {
      await loginToRealNewApiSite(page, config)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain("invalid")
    expect((caught as Error).message).not.toContain("must-not-leak-token")
    expect((caught as Error).message).not.toContain("must-not-leak-session")
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it("accepts a marker-shaped top-level legacy user after New API refresh fallback", async () => {
    const user = {
      id: 7,
      username: "legacy-shaped-user",
      access_token: "legacy-access-token-placeholder",
      session: { sid: "legacy-session-value", current: false },
    }
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(404, { success: false }))
      .mockResolvedValueOnce(
        createResponse(200, {
          success: true,
          data: user,
        }),
      )
    const { page, evaluate, waitForFunction } = createPage(post)

    await expect(loginToRealNewApiSite(page, config)).resolves.toEqual({
      reusedSession: false,
      user,
    })
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), {
      user: JSON.stringify(user),
    })
    expect(waitForFunction).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it.each([
    [409, "AUTH_SESSION_LIMIT"],
    [429, "AUTH_SESSION_ISSUANCE_LIMIT"],
  ])(
    "treats refresh HTTP %i as a controlled terminal error",
    async (status, code) => {
      const post = vi.fn().mockResolvedValue(
        createResponse(status, {
          success: false,
          code,
          message: "must-not-leak-server-message",
          data: {
            access_token: "must-not-leak-token",
            session: { sid: "must-not-leak-session" },
          },
        }),
      )
      const { page, evaluate, waitForFunction } = createPage(post)

      let caught: unknown
      try {
        await loginToRealNewApiSite(page, config)
      } catch (error) {
        caught = error
      }

      expect(caught).toMatchObject({
        message: `New API auth session request failed (HTTP ${status}, ${code})`,
      })
      expect((caught as Error).message).not.toContain("must-not-leak")
      expect(evaluate).not.toHaveBeenCalled()
      expect(waitForFunction).not.toHaveBeenCalled()
      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith(AUTH_REFRESH_URL, {
        failOnStatusCode: false,
        headers: { Origin: ORIGIN },
      })
    },
  )

  it("sanitizes auth refresh transport failures", async () => {
    const transportDetails = "must-not-leak-transport-details"
    const post = vi.fn().mockRejectedValue(new Error(transportDetails))
    const { page, evaluate, waitForFunction } = createPage(post)

    let caught: unknown
    try {
      await loginToRealNewApiSite(page, config)
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      message: "Real New API auth session refresh request failed.",
    })
    expect((caught as Error).message).not.toContain(transportDetails)
    expect(evaluate).not.toHaveBeenCalled()
    expect(waitForFunction).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(AUTH_REFRESH_URL, {
      failOnStatusCode: false,
      headers: { Origin: ORIGIN },
    })
  })

  it("sanitizes owned-session cleanup failures", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(createResponse(401, { code: "AUTH_UNAUTHORIZED" }))
      .mockResolvedValueOnce(createResponse(200, createAuthBundle()))
      .mockResolvedValueOnce(
        createResponse(500, {
          message: "must-not-leak-server-message",
          access_token: "must-not-leak-token",
          session: { sid: "must-not-leak-session" },
        }),
      )
    const { page } = createPage(post)
    const result = await loginToRealNewApiSite(page, config)

    let caught: unknown
    try {
      await result.cleanupOwnedSession?.()
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      message: "New API auth session cleanup failed (HTTP 500)",
    })
    expect((caught as Error).message).not.toContain("must-not-leak")
  })
})
