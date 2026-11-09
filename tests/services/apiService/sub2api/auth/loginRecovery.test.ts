import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"
import { refreshAccountData } from "~/services/apiService/sub2api/account/accountData"
import { fetchSub2ApiData } from "~/services/apiService/sub2api/account/dashboardRequest"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { SUB2API_AUTH_PERSISTENCE_STATUSES } from "~/services/apiService/sub2api/auth/authSession"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/auth/authSession"
import {
  SUB2API_TOKEN_REFRESH_FAILURE_REASONS,
  Sub2ApiTokenRefreshError,
} from "~/services/apiService/sub2api/auth/tokenRefresh"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { createCheckInConfig } from "~~/tests/services/apiAdapters/checkInFixtures"
import { createDeferred } from "~~/tests/test-utils/deferred"

const deps = vi.hoisted(() => ({
  login: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  identity: vi.fn(),
  browser: vi.fn(),
  refresh: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", async (original) => ({
  ...(await original<typeof import("~/services/apiTransport/request")>()),
  fetchApi: deps.fetch,
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: deps.login }))
vi.mock("~/services/accounts/accountStorage/accountConfigStore", () => ({
  accountConfigStore: { read: deps.read, mutateAccount: deps.mutate },
}))
vi.mock("~/services/apiService/sub2api/auth/authIdentity", () => ({
  fetchSub2ApiAuthIdentity: deps.identity,
}))
vi.mock("~/services/apiService/sub2api/auth/browserAuth", async (original) => ({
  ...(await original<
    typeof import("~/services/apiService/sub2api/auth/browserAuth")
  >()),
  recoverSub2ApiBrowserAuth: deps.browser,
}))
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (original) => ({
    ...(await original<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: deps.refresh,
  }),
)

describe("Sub2API configured login recovery", () => {
  let account: SiteAccount
  let request: Sub2ApiAuthSessionRequest
  const unauthorized = () =>
    new ApiError("expired", 401, "/api/v1/auth/me", API_ERROR_CODES.HTTP_401)

  /** Model the persisted session independently of a caller's older snapshot. */
  function attachStoredSession() {
    request.sub2apiAuthSession = {
      async getLatestAuth() {
        return {
          accessToken: account.account_info.access_token,
          userId: account.account_info.id,
          sub2apiAuth: account.sub2apiAuth,
        }
      },
      async persistAuthUpdate(_id, update) {
        account.account_info.access_token = update.accessToken
        account.sub2apiAuth = update.refreshToken
          ? {
              refreshToken: update.refreshToken,
              tokenExpiresAt: update.tokenExpiresAt,
            }
          : undefined
        return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED }
      },
    }
  }
  beforeEach(() => {
    vi.resetAllMocks()
    account = {
      id: "saved",
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://sub2api.example",
      authType: AuthTypeEnum.AccessToken,
      account_info: { id: "17", access_token: "expired" },
      login: {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "member@example.com", password: "secret" },
        automaticRecovery: true,
      },
    } as SiteAccount
    request = {
      accountId: account.id,
      siteType: account.site_type,
      baseUrl: account.site_url,
      allowAccountCredentialRecovery: true,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "17",
        accessToken: "expired",
      },
    }
    deps.read.mockImplementation(async () => ({ accounts: [account] }))
    deps.mutate.mockImplementation(async (_id, mutation) => {
      const result = mutation(account)
      account = result.nextAccount
      return result.result
    })
    deps.browser.mockResolvedValue(null)
    deps.identity.mockResolvedValue({ identity: { userId: "17" } })
    deps.login.mockResolvedValue({
      status: BROWSER_LOGIN_STATUS.Authenticated,
      identity: "17",
      credential: {
        accessToken: "new-access",
        sub2apiAuth: {
          refreshToken: "new-refresh",
          tokenExpiresAt: 2000000000000,
        },
      },
    })
  })

  it("recovers login when the saved access token is absent and renewal is rejected before the operation starts", async () => {
    account.account_info.access_token = ""
    account.sub2apiAuth = { refreshToken: "saved-refresh", tokenExpiresAt: 1 }
    attachStoredSession()
    deps.refresh.mockRejectedValue(
      new Sub2ApiTokenRefreshError(
        SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
      ),
    )
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken !== "new-access") throw unauthorized()
      return "ok"
    })
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("ok")
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it.each([
    { accessToken: "saved-access", expiryOffset: 60000 },
    { accessToken: "saved-access", expiryOffset: -60000 },
    { accessToken: "", expiryOffset: -60000 },
  ])(
    "preserves uncertain renewal without admitting login (access token '$accessToken', expiry offset $expiryOffset)",
    async ({ accessToken, expiryOffset }) => {
      account.account_info.access_token = accessToken
      account.sub2apiAuth = {
        refreshToken: "saved-refresh",
        tokenExpiresAt: Date.now() + expiryOffset,
      }
      attachStoredSession()
      const uncertain = new Sub2ApiTokenRefreshError(
        SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
      )
      deps.refresh.mockRejectedValue(uncertain)
      const runner = vi.fn().mockResolvedValue("ok")

      await expect(
        executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
      ).rejects.toBe(uncertain)
      expect(deps.login).not.toHaveBeenCalled()
      expect(deps.mutate).not.toHaveBeenCalled()
      expect(runner).not.toHaveBeenCalled()
      expect(deps.refresh).toHaveBeenCalledTimes(1)
      expect(deps.browser).toHaveBeenCalledTimes(1)
      expect(account.account_info.access_token).toBe(accessToken)
      expect(account.sub2apiAuth?.refreshToken).toBe("saved-refresh")
    },
  )

  it.each(
    [
      "initial",
      "initial with refresh",
      "refreshed",
      "browser",
      "browser after refresh",
    ].flatMap((stage) =>
      ["html", "challenge", "unattributed"].map((kind) => ({ stage, kind })),
    ),
  )(
    "preserves $kind 401 without login at the $stage request",
    async ({ stage, kind }) => {
      const hasRefresh = stage.includes("refresh")
      if (hasRefresh) {
        account.sub2apiAuth = { refreshToken: "refresh" }
        attachStoredSession()
        deps.refresh.mockResolvedValue({
          accessToken: "rotated",
          refreshToken: "rotated-refresh",
          tokenExpiresAt: 2000000000000,
        })
      }
      if (stage.startsWith("browser")) {
        deps.browser.mockResolvedValue({
          accessToken: "browser-access",
          userId: "17",
          source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        })
      }
      const code =
        kind === "html"
          ? API_ERROR_CODES.CONTENT_TYPE_MISMATCH
          : kind === "challenge"
            ? API_ERROR_CODES.ROBOT_CHALLENGE
            : API_ERROR_CODES.HTTP_401
      const failure = new ApiError(
        "proxy or protection response",
        401,
        "/api/v1/auth/me",
        code,
      )
      if (kind === "unattributed") failure.unattributedMessage = true
      const runner = vi.fn()
      if (!stage.startsWith("initial"))
        runner.mockRejectedValueOnce(unauthorized())
      if (stage === "browser after refresh")
        runner.mockRejectedValueOnce(unauthorized())
      runner.mockRejectedValue(failure)

      await expect(
        executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
      ).rejects.toBe(failure)
      expect(deps.login).not.toHaveBeenCalled()
      expect(deps.mutate).not.toHaveBeenCalled()
      expect(deps.refresh).toHaveBeenCalledTimes(
        hasRefresh && !stage.startsWith("initial") ? 1 : 0,
      )
      expect(deps.browser).toHaveBeenCalledTimes(
        stage.startsWith("browser") ? 1 : 0,
      )
      expect(runner).toHaveBeenCalledTimes(
        stage.startsWith("initial")
          ? 1
          : stage === "browser after refresh"
            ? 3
            : 2,
      )
    },
  )

  it.each(["usable", "missing", "rejected"])(
    "tries the %s browser session before login after a refreshed token is rejected",
    async (session) => {
      account.sub2apiAuth = { refreshToken: "refresh" }
      attachStoredSession()
      deps.refresh.mockResolvedValue({
        accessToken: "rotated",
        refreshToken: "rotated-refresh",
        tokenExpiresAt: 2000000000000,
      })
      if (session !== "missing")
        deps.browser.mockResolvedValue({
          accessToken: "browser-access",
          userId: "17",
          source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        })
      const runner = vi.fn(async (next: ApiServiceRequest) => {
        const token = next.auth.accessToken
        if (
          token === "expired" ||
          token === "rotated" ||
          (token === "browser-access" && session === "rejected")
        )
          throw unauthorized()
        return token
      })
      const beforeUnauthorizedRetry = vi.fn()
      await expect(
        executeAuthenticatedSub2ApiRequest(request, "/api/v1/keys", runner, {
          beforeUnauthorizedRetry,
        }),
      ).resolves.toBe(session === "usable" ? "browser-access" : "new-access")
      expect(deps.browser).toHaveBeenCalledTimes(1)
      expect(deps.login).toHaveBeenCalledTimes(session === "usable" ? 0 : 1)
      expect(beforeUnauthorizedRetry).toHaveBeenCalledTimes(
        session === "rejected" ? 3 : 2,
      )
    },
  )

  it.each([403, 503])(
    "does not recover a refreshed request's HTTP %s failure",
    async (status) => {
      account.sub2apiAuth = { refreshToken: "refresh" }
      attachStoredSession()
      deps.refresh.mockResolvedValue({
        accessToken: "rotated",
        refreshToken: "rotated-refresh",
        tokenExpiresAt: 2000000000000,
      })
      const failure = new ApiError("request failed", status, "/api/v1/keys")
      const runner = vi
        .fn()
        .mockRejectedValueOnce(unauthorized())
        .mockRejectedValue(failure)
      await expect(
        executeAuthenticatedSub2ApiRequest(request, "/api/v1/keys", runner),
      ).rejects.toBe(failure)
      expect(deps.browser).not.toHaveBeenCalled()
      expect(deps.login).not.toHaveBeenCalled()
      expect(runner).toHaveBeenCalledTimes(2)
    },
  )

  it("honors the retry guard after browser recovery of a rejected rotated token", async () => {
    account.sub2apiAuth = { refreshToken: "refresh" }
    attachStoredSession()
    deps.refresh.mockResolvedValue({
      accessToken: "rotated",
      refreshToken: "rotated-refresh",
      tokenExpiresAt: 2000000000000,
    })
    deps.browser.mockResolvedValue({
      accessToken: "browser-access",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    const runner = vi.fn().mockRejectedValue(unauthorized())
    const beforeUnauthorizedRetry = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("check-in disabled"))
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/checkin", runner, {
        beforeUnauthorizedRetry,
      }),
    ).rejects.toThrow("check-in disabled")
    expect(runner).toHaveBeenCalledTimes(2)
    expect(deps.browser).toHaveBeenCalledTimes(1)
    expect(deps.login).not.toHaveBeenCalled()
  })

  it("starts from a manually configured access token and saves the complete login token pair", async () => {
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken === "expired") throw unauthorized()
      return next.auth
    })
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      tokenExpiresAt: 2000000000000,
    })
    expect(account.account_info.access_token).toBe("new-access")
    expect(account.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: 2000000000000,
    })
    expect(deps.login).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ captureCredential: true, attended: false }),
    )
    expect(deps.identity).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "new-access" }),
      }),
    )
    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it("logs in when the refresh token was rejected and browser recovery is empty", async () => {
    request.auth.refreshToken = "revoked-refresh"
    account.sub2apiAuth = { refreshToken: "revoked-refresh" }
    deps.refresh.mockRejectedValue(
      new Sub2ApiTokenRefreshError(
        SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
      ),
    )
    const runner = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValue("recovered")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner, {
        recoverInvalidRefreshTokenViaBrowser: true,
      }),
    ).resolves.toBe("recovered")
    expect(deps.login).toHaveBeenCalledTimes(1)
  })

  it("marks expired token health as authentication required for recovery guidance", async () => {
    request.allowAccountCredentialRecovery = false
    deps.identity.mockRejectedValue(unauthorized())
    await expect(
      refreshAccountData({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.SUB2API),
      }),
    ).resolves.toMatchObject({
      success: false,
      healthStatus: { code: "authentication_required" },
    })
  })

  it.each([
    { accessToken: "saved-access", expiryOffset: 60000 },
    { accessToken: "saved-access", expiryOffset: -60000 },
    { accessToken: "", expiryOffset: -60000 },
  ])(
    "keeps uncertain renewal health unclassified (access token '$accessToken', expiry offset $expiryOffset)",
    async ({ accessToken, expiryOffset }) => {
      account.account_info.access_token = accessToken
      account.sub2apiAuth = {
        refreshToken: "saved-refresh",
        tokenExpiresAt: Date.now() + expiryOffset,
      }
      attachStoredSession()
      deps.refresh.mockRejectedValue(
        new Sub2ApiTokenRefreshError(
          SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
        ),
      )

      const result = await refreshAccountData({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.SUB2API),
      })

      expect(result.success).toBe(false)
      expect(result.healthStatus.code).toBeUndefined()
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Unknown)
      expect(result.healthStatus.message).not.toBe(
        "messages:sub2api.refreshTokenInvalid",
      )
      expect(result.authUpdate).toBeUndefined()
      expect(deps.login).not.toHaveBeenCalled()
      expect(account.account_info.access_token).toBe(accessToken)
      expect(account.sub2apiAuth?.refreshToken).toBe("saved-refresh")
    },
  )

  it.each([
    API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
    API_ERROR_CODES.ROBOT_CHALLENGE,
    API_ERROR_CODES.HTTP_401,
  ])(
    "does not label non-authentication %s health as login required",
    async (code) => {
      const failure = new ApiError(
        "proxy or protection response",
        401,
        "/api/v1/auth/me",
        code,
      )
      if (code === API_ERROR_CODES.HTTP_401) failure.unattributedMessage = true
      deps.identity.mockRejectedValue(failure)

      const result = await refreshAccountData({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.SUB2API),
      })
      expect(result.success).toBe(false)
      expect(result.healthStatus.code).toBeUndefined()
      expect(result.healthStatus.message).not.toBe(
        "messages:sub2api.loginRequired",
      )
      expect(deps.login).not.toHaveBeenCalled()
    },
  )

  it("uses a saved refresh token before opening login", async () => {
    request.auth.refreshToken = "refresh"
    deps.refresh.mockResolvedValue({
      accessToken: "rotated",
      refreshToken: "rotated-refresh",
      tokenExpiresAt: 2000000000000,
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValue("ok")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("ok")
    expect(runner).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          accessToken: "rotated",
          refreshToken: "rotated-refresh",
        }),
      }),
    )
    expect(deps.login).not.toHaveBeenCalled()
  })

  it("uses the matching browser session before login when a refresh token is rejected with default options", async () => {
    request.auth.refreshToken = "revoked"
    deps.refresh.mockRejectedValue(
      new Sub2ApiTokenRefreshError(
        SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
      ),
    )
    deps.browser.mockResolvedValue({
      accessToken: "browser-access",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValue("ok")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/keys", runner),
    ).resolves.toBe("ok")
    expect(runner).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "browser-access" }),
      }),
    )
    expect(deps.login).not.toHaveBeenCalled()
  })

  it("keeps legacy login access tokens usable without retaining an obsolete refresh token", async () => {
    account.sub2apiAuth = { refreshToken: "obsolete", tokenExpiresAt: 1 }
    deps.login.mockResolvedValue({
      status: BROWSER_LOGIN_STATUS.Authenticated,
      identity: "17",
      credential: { accessToken: "legacy-access" },
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValue("ok")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("ok")
    expect(account.sub2apiAuth).toBeUndefined()
    expect(runner).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          accessToken: "legacy-access",
          refreshToken: undefined,
          tokenExpiresAt: undefined,
        }),
      }),
    )
  })

  it.each([
    "disabled",
    "opt-out",
    "no-method",
    "no-credentials",
    "unadmitted",
    "split-origin",
  ])("does not login for %s accounts", async (reason) => {
    if (reason === "disabled") account.disabled = true
    if (reason === "opt-out") account.login!.automaticRecovery = false
    if (reason === "no-method") account.login = undefined
    if (reason === "no-credentials") account.login!.credentials = undefined
    if (reason === "unadmitted") request.allowAccountCredentialRecovery = false
    if (reason === "split-origin") {
      account.site_url = "https://ai-router.dev"
      request.baseUrl = account.site_url
    }
    await expect(
      executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        vi.fn().mockRejectedValue(unauthorized()),
      ),
    ).rejects.toThrow()
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it.each([
    "wrong-login-identity",
    "wrong-token-identity",
    "missing-token",
    "interaction-required",
    "verification-failed",
  ])("does not persist %s login results", async (reason) => {
    if (reason === "wrong-login-identity")
      deps.login.mockResolvedValue({
        status: BROWSER_LOGIN_STATUS.Authenticated,
        identity: "18",
        credential: { accessToken: "wrong" },
      })
    if (reason === "wrong-token-identity")
      deps.identity.mockResolvedValue({ identity: { userId: "18" } })
    if (reason === "missing-token")
      deps.login.mockResolvedValue({
        status: BROWSER_LOGIN_STATUS.Authenticated,
        identity: "17",
      })
    if (reason === "interaction-required")
      deps.login.mockResolvedValue({
        status: BROWSER_LOGIN_STATUS.InteractionRequired,
      })
    if (reason === "verification-failed")
      deps.identity.mockRejectedValue(unauthorized())
    await expect(
      executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        vi.fn().mockRejectedValue(unauthorized()),
      ),
    ).rejects.toThrow()
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(account.account_info.access_token).toBe("expired")
  })

  it.each(["cancel", "login-change", "credential-change", "disabled"])(
    "rejects late recovery after %s",
    async (reason) => {
      const controller = new AbortController()
      request.abortSignal = controller.signal
      const result = await deps.login()
      deps.login.mockImplementation(async () => {
        if (reason === "cancel") controller.abort()
        if (reason === "login-change") account.login = undefined
        if (reason === "credential-change")
          account.account_info.access_token = "user-replaced"
        if (reason === "disabled") account.disabled = true
        return result
      })
      await expect(
        executeAuthenticatedSub2ApiRequest(
          request,
          "/api/v1/auth/me",
          vi.fn().mockRejectedValue(unauthorized()),
        ),
      ).rejects.toThrow()
      expect(account.account_info.access_token).not.toBe("new-access")
    },
  )

  it("serializes unsaved session recovery and releases the queue after failure", async () => {
    request.accountId = undefined
    const failure = new Error("browser unavailable")
    const blocked = createDeferred<never>()
    deps.browser.mockImplementationOnce(() => blocked.promise)
    deps.browser.mockResolvedValue({
      accessToken: "browser-access",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken === "expired") throw unauthorized()
      return next.auth.accessToken
    })
    const first = executeAuthenticatedSub2ApiRequest(
      request,
      "/api/v1/keys",
      runner,
    )
    const firstResult = expect(first).rejects.toBe(failure)
    await vi.waitFor(() => expect(deps.browser).toHaveBeenCalledTimes(1))
    const second = executeAuthenticatedSub2ApiRequest(
      request,
      "/api/v1/keys",
      runner,
    )
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(2))
    expect(deps.browser).toHaveBeenCalledTimes(1)
    blocked.reject(failure)
    await firstResult
    await expect(second).resolves.toBe("browser-access")
    expect(deps.browser).toHaveBeenCalledTimes(2)
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it("coalesces concurrent login recovery and retries each operation once", async () => {
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken === "expired") throw unauthorized()
      return "ok"
    })
    await expect(
      Promise.all([
        executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
        executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
      ]),
    ).resolves.toEqual(["ok", "ok"])
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
  })

  it("serializes token rotation behind an active login and reuses its saved pair", async () => {
    attachStoredSession()
    const loginResult = await deps.login()
    deps.login.mockClear()
    const pendingLogin = createDeferred<AccountLoginResult>()
    deps.login.mockImplementation(() => pendingLogin.promise)
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken === "expired") throw unauthorized()
      return next.auth.accessToken
    })
    const first = executeAuthenticatedSub2ApiRequest(
      request,
      "/api/v1/keys",
      runner,
    )
    await vi.waitFor(() => expect(deps.login).toHaveBeenCalledTimes(1))
    const second = executeAuthenticatedSub2ApiRequest(
      { ...request, auth: { ...request.auth, refreshToken: "older-refresh" } },
      "/api/v1/keys",
      runner,
    )
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(2))
    expect(deps.refresh).not.toHaveBeenCalled()
    pendingLogin.resolve(loginResult)
    await expect(Promise.all([first, second])).resolves.toEqual([
      "new-access",
      "new-access",
    ])
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it.each([2000000000000, undefined])(
    "reuses an access-only login without the queued request's renewal material (expiry %s)",
    async (tokenExpiresAt) => {
      account.sub2apiAuth = { refreshToken: "older-refresh", tokenExpiresAt }
      attachStoredSession()
      deps.refresh.mockRejectedValue(
        new Sub2ApiTokenRefreshError(
          SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
        ),
      )
      const pendingLogin = createDeferred<AccountLoginResult>()
      deps.login.mockImplementation(() => pendingLogin.promise)
      const runner = vi.fn(async (next: ApiServiceRequest) => {
        if (next.auth.accessToken === "expired") throw unauthorized()
        return {
          accessToken: next.auth.accessToken,
          refreshToken: next.auth.refreshToken,
          tokenExpiresAt: next.auth.tokenExpiresAt,
        }
      })
      const first = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/keys",
        runner,
      )
      await vi.waitFor(() => expect(deps.login).toHaveBeenCalledTimes(1), {
        timeout: 10000,
      })
      const queued = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/keys",
        runner,
      )
      await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(2))
      expect(deps.refresh).toHaveBeenCalledTimes(1)
      pendingLogin.resolve({
        status: BROWSER_LOGIN_STATUS.Authenticated,
        identity: "17",
        credential: { accessToken: "new-access" },
      })

      await expect(Promise.all([first, queued])).resolves.toEqual([
        {
          accessToken: "new-access",
          refreshToken: undefined,
          tokenExpiresAt: undefined,
        },
        {
          accessToken: "new-access",
          refreshToken: undefined,
          tokenExpiresAt: undefined,
        },
      ])
      expect(deps.refresh).toHaveBeenCalledTimes(1)
      expect(deps.login).toHaveBeenCalledTimes(1)
      expect(account.sub2apiAuth).toBeUndefined()
    },
  )

  it("does not loop when the recovered request is still rejected", async () => {
    const runner = vi.fn().mockRejectedValue(unauthorized())
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).rejects.toThrow()
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it("rechecks check-in admission before dispatch with login credentials", async () => {
    const runner = vi.fn().mockRejectedValue(unauthorized())
    const beforeUnauthorizedRetry = vi
      .fn()
      .mockRejectedValue(new Error("check-in disabled"))
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/checkin", runner, {
        beforeUnauthorizedRetry,
      }),
    ).rejects.toThrow("check-in disabled")
    expect(runner).toHaveBeenCalledTimes(1)
    expect(beforeUnauthorizedRetry).toHaveBeenCalledTimes(1)
  })

  it("does not admit key mutations to automatic login recovery", async () => {
    deps.fetch.mockRejectedValue(unauthorized())
    await expect(
      fetchSub2ApiData(request, "/api/v1/keys", { method: "POST", body: "{}" }),
    ).rejects.toThrow()
    expect(deps.login).not.toHaveBeenCalled()
  })
})
