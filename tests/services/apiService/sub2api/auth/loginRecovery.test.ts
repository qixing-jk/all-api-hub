import { createHash, webcrypto } from "node:crypto"
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
import { SUB2API_PANEL_KEY_ERRORS } from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
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
  panelKey: vi.fn(),
}))
vi.mock("~/services/apiService/sub2api/auth/panelProofStore", () => ({
  readSub2ApiPanelSigningKey: deps.panelKey,
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
  it.each(["revoked", "network"])(
    "keeps a missing-access independent account on its own refresh family: %s",
    async (failure) => {
      account.account_info.access_token = ""
      account.sub2apiAuth = { refreshToken: "managed-refresh" }
      account.login = undefined
      deps.panelKey.mockResolvedValue({})
      attachStoredSession()
      const error =
        failure === "revoked"
          ? new Sub2ApiTokenRefreshError(
              SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
            )
          : new Error("Network unavailable")
      deps.refresh.mockRejectedValue(error)
      const runner = vi.fn()
      const pending = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        runner,
      )
      if (failure === "revoked")
        await expect(pending).rejects.toMatchObject({
          upstreamCode: "sub2api_refresh_token_invalid",
        })
      else await expect(pending).rejects.toBe(error)
      expect(deps.browser).not.toHaveBeenCalled()
      expect(runner).not.toHaveBeenCalled()
    },
  )
  it.each([
    ["uncertain_rotation", true],
    ["invalid_refresh_token", false],
  ] as const)(
    "keeps the independent-session outcome after a 401 followed by %s",
    async (reason, automaticRecovery) => {
      account.account_info.access_token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: "missing-key" } })).toString("base64url")}.signature`
      account.sub2apiAuth = { refreshToken: "managed-refresh" }
      account.login!.automaticRecovery = automaticRecovery
      attachStoredSession()
      deps.panelKey.mockResolvedValue({})
      deps.refresh.mockRejectedValue(new Sub2ApiTokenRefreshError(reason))
      const runner = vi
        .fn()
        .mockRejectedValueOnce(unauthorized())
        .mockResolvedValue("done")
      const pending = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        runner,
        {
          recoverInvalidRefreshTokenViaBrowser: true,
        },
      )
      if (automaticRecovery) {
        await expect(pending).resolves.toBe("done")
        expect(deps.login).toHaveBeenCalledOnce()
        expect(account.sub2apiAuth?.refreshToken).toBe("new-refresh")
      } else {
        await expect(pending).rejects.toMatchObject({
          upstreamCode: "PANEL_PROOF_INDEPENDENT_SESSION_REQUIRED",
        })
        expect(deps.login).not.toHaveBeenCalled()
        expect(account.sub2apiAuth?.refreshToken).toBe("managed-refresh")
      }
      expect(deps.browser).not.toHaveBeenCalled()
    },
  )

  it("uses configured automatic login after a missing website key without resyncing a tab", async () => {
    attachStoredSession()
    const error = new ApiError(
      "Website signing key missing",
      401,
      "/api/v1/auth/me",
      API_ERROR_CODES.REQUEST_PROOF_INVALID,
      "PANEL_PROOF_BROWSER_KEY_MISSING",
    )
    const runner = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("done")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("done")
    expect(deps.browser).not.toHaveBeenCalled()
    expect(deps.login).toHaveBeenCalledOnce()
  })

  it("stops after one recovery when the replacement is rejected for a signing-key mismatch", async () => {
    account.sub2apiAuth = {
      refreshToken: "saved-refresh",
      tokenExpiresAt: Date.now() - 1,
    }
    attachStoredSession()
    deps.refresh.mockResolvedValue({
      accessToken: "renewed-access",
      refreshToken: "renewed-refresh",
      tokenExpiresAt: Date.now() + 3600000,
    })
    const rejected = new ApiError(
      "Signing key mismatch",
      401,
      "/api/v1/auth/me",
      API_ERROR_CODES.HTTP_401,
      SUB2API_PANEL_KEY_ERRORS.Mismatch,
    )
    const runner = vi.fn().mockRejectedValueOnce(rejected)

    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner, {
        singleRecovery: true,
      }),
    ).rejects.toBe(rejected)
    expect(deps.refresh).toHaveBeenCalledOnce()
    expect(runner).toHaveBeenCalledOnce()
    expect(deps.browser).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
  })
  it("preserves a confirmed proof failure when refreshing a missing access token with unavailable signing storage", async () => {
    account.account_info.access_token = ""
    account.sub2apiAuth = { refreshToken: "saved-refresh" }
    attachStoredSession()
    deps.panelKey.mockRejectedValue(new Error("Signing storage unavailable"))
    const proofError = new ApiError(
      "Proof rejected",
      401,
      "/api/v1/auth/refresh",
      API_ERROR_CODES.REQUEST_PROOF_INVALID,
    )
    deps.refresh.mockRejectedValue(proofError)
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", vi.fn()),
    ).rejects.toBe(proofError)
    expect(deps.browser).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
  })
  it("keeps ordinary browser recovery usable when optional panel storage is unavailable", async () => {
    account.account_info.access_token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: "ordinary-binding" } })).toString("base64url")}.signature`
    deps.panelKey.mockRejectedValue(
      new Error("Optional panel storage unavailable"),
    )
    attachStoredSession()
    const runner = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValue("done")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("done")
    expect(deps.panelKey).toHaveBeenCalled()
    expect(deps.browser).toHaveBeenCalled()
    expect(deps.login).toHaveBeenCalledOnce()
  })
  it("recovers a browser account without a token even when another account owns an origin signing key", async () => {
    deps.panelKey.mockResolvedValue({})
    account.account_info.access_token = ""
    account.login = undefined
    deps.browser.mockResolvedValue({
      accessToken: "website-access",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    attachStoredSession()
    const runner = vi.fn().mockResolvedValue("done")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("done")
    expect(deps.browser).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: account.site_url,
        expectedUserId: "17",
      }),
    )
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "website-access" }),
      }),
    )
    expect(deps.login).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    "keeps ownership of a bound refresh family after signing-key loss (automatic login: %s)",
    async (automaticRecovery) => {
      account.account_info.access_token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: "previous-key" } })).toString("base64url")}.signature`
      account.sub2apiAuth = { refreshToken: "managed-refresh" }
      account.login!.automaticRecovery = automaticRecovery
      attachStoredSession()
      deps.browser.mockResolvedValue({
        accessToken: "website-access",
        userId: "17",
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      })
      const signingError = new ApiError(
        "Signing key changed",
        401,
        "/api/v1/auth/me",
        API_ERROR_CODES.HTTP_401,
        "PANEL_PROOF_KEY_MISMATCH",
      )
      const runner = vi
        .fn()
        .mockRejectedValueOnce(signingError)
        .mockResolvedValue("done")
      const result = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        runner,
      )
      if (automaticRecovery) {
        await expect(result).resolves.toBe("done")
        expect(account.sub2apiAuth?.refreshToken).toBe("new-refresh")
        expect(deps.login).toHaveBeenCalledOnce()
      } else {
        await expect(result).rejects.toMatchObject({
          message: "messages:sub2api.independentSessionRequired",
        })
        expect(account.sub2apiAuth?.refreshToken).toBe("managed-refresh")
        expect(deps.login).not.toHaveBeenCalled()
      }
      expect(deps.browser).not.toHaveBeenCalled()
    },
  )
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
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
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

  async function bindAccountToPanelKey() {
    vi.stubGlobal("crypto", webcrypto)
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
    const binding = createHash("sha256")
      .update(JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }))
      .digest("base64url")
    deps.panelKey.mockResolvedValue(pair)
    account.account_info.access_token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: binding } })).toString("base64url")}.signature`
  }

  it.each(["key mismatch", "proof rejected", "network"])(
    "preserves a proactive signed refresh failure without borrowing browser credentials: %s",
    async (failure) => {
      await bindAccountToPanelKey()
      account.login = undefined
      account.sub2apiAuth = {
        refreshToken: "managed-refresh",
        tokenExpiresAt: Date.now() - 1,
      }
      attachStoredSession()
      const error =
        failure === "network"
          ? new Error("Network unavailable")
          : new ApiError(
              "Proof failed",
              401,
              "/api/v1/auth/refresh",
              failure === "proof rejected"
                ? API_ERROR_CODES.REQUEST_PROOF_INVALID
                : API_ERROR_CODES.HTTP_401,
              failure === "key mismatch"
                ? SUB2API_PANEL_KEY_ERRORS.Mismatch
                : undefined,
            )
      deps.refresh.mockRejectedValue(error)
      const runner = vi.fn()
      const pending = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        runner,
      )
      if (failure === "key mismatch")
        await expect(pending).rejects.toMatchObject({
          upstreamCode: "PANEL_PROOF_INDEPENDENT_SESSION_REQUIRED",
        })
      else await expect(pending).rejects.toBe(error)
      expect(runner).not.toHaveBeenCalled()
      expect(deps.browser).not.toHaveBeenCalled()
      expect(deps.login).not.toHaveBeenCalled()
    },
  )

  it("rechecks the failed runner's binding after adopting a newer browser credential", async () => {
    await bindAccountToPanelKey()
    account.sub2apiAuth = {
      refreshToken: "old-refresh",
      tokenExpiresAt: Date.now() - 1,
    }
    account.login = undefined
    attachStoredSession()
    const getLatest = request.sub2apiAuthSession!.getLatestAuth
    request.sub2apiAuthSession!.getLatestAuth = vi
      .fn()
      .mockImplementationOnce(getLatest)
      .mockImplementation(async (...args: Parameters<typeof getLatest>) => {
        account.account_info.access_token = "newer-browser-access"
        account.sub2apiAuth = undefined
        return getLatest(...args)
      })
    deps.browser.mockResolvedValue({
      accessToken: "resynced-browser-access",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          "Browser binding changed",
          401,
          "/api/v1/auth/me",
          API_ERROR_CODES.HTTP_401,
          "SESSION_BINDING_MISMATCH",
        ),
      )
      .mockResolvedValue("done")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("done")
    expect(runner.mock.calls[0]?.[0].auth.accessToken).toBe(
      "newer-browser-access",
    )
    expect(runner.mock.calls[1]?.[0].auth.accessToken).toBe(
      "resynced-browser-access",
    )
    expect(deps.browser).toHaveBeenCalledOnce()
    expect(deps.refresh).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
  })

  it("does not borrow website auth when an extension-bound refresh token is revoked", async () => {
    await bindAccountToPanelKey()
    account.sub2apiAuth = {
      refreshToken: "revoked",
      tokenExpiresAt: Date.now() + 3600000,
    }
    attachStoredSession()
    deps.refresh.mockRejectedValue(
      new Sub2ApiTokenRefreshError(
        SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
      ),
    )
    const runner = vi
      .fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValue("ok")
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("ok")
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(deps.browser).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "attempts the current bearer after proactive panel renewal is rejected (bearer accepted: %s)",
    async (accepted) => {
      await bindAccountToPanelKey()
      account.sub2apiAuth = {
        refreshToken: "revoked",
        tokenExpiresAt: Date.now() + 1000,
      }
      account.login = undefined
      attachStoredSession()
      deps.refresh.mockRejectedValue(
        new Sub2ApiTokenRefreshError(
          SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
        ),
      )
      const runner = accepted
        ? vi.fn().mockResolvedValue("done")
        : vi.fn().mockRejectedValue(unauthorized())
      const result = executeAuthenticatedSub2ApiRequest(
        request,
        "/api/v1/auth/me",
        runner,
      )
      if (accepted) await expect(result).resolves.toBe("done")
      else
        await expect(result).rejects.toMatchObject({
          upstreamCode: "sub2api_refresh_token_invalid",
        })
      expect(runner).toHaveBeenCalledOnce()
      expect(deps.refresh).toHaveBeenCalledOnce()
      expect(deps.browser).not.toHaveBeenCalled()
      expect(deps.login).not.toHaveBeenCalled()
    },
  )

  it("uses a matching website session without configured login after a foreign-key rejection", async () => {
    account.login = undefined
    request.allowAccountCredentialRecovery = false
    deps.browser.mockResolvedValue({
      accessToken: "website-access",
      userId: "17",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      fetchContext: { kind: "current-tab", tabId: 8, origin: account.site_url },
    })
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken !== "website-access")
        throw new ApiError(
          "Key mismatch",
          401,
          "/api/v1/auth/me",
          API_ERROR_CODES.HTTP_401,
          "PANEL_PROOF_KEY_MISMATCH",
        )
      expect(next.fetchContext).toMatchObject({ tabId: 8 })
      return "ok"
    })
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("ok")
    expect(deps.browser).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUserId: "17" }),
    )
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it("falls back to configured login when the browser-bound session is unavailable", async () => {
    account.sub2apiAuth = {
      refreshToken: "browser-bound-refresh",
      tokenExpiresAt: Date.now() + 3600000,
    }
    attachStoredSession()
    deps.refresh.mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "rotated-browser-refresh",
      tokenExpiresAt: Date.now() + 3600000,
    })
    const runner = vi.fn(async (next: ApiServiceRequest) => {
      if (next.auth.accessToken !== "new-access")
        throw new ApiError(
          "Key mismatch",
          401,
          "/api/v1/auth/me",
          API_ERROR_CODES.HTTP_401,
          "PANEL_PROOF_KEY_MISMATCH",
        )
      return "ok"
    })
    await expect(
      executeAuthenticatedSub2ApiRequest(request, "/api/v1/auth/me", runner),
    ).resolves.toBe("ok")
    expect(deps.refresh).not.toHaveBeenCalled()
    expect(deps.browser).toHaveBeenCalledOnce()
    expect(deps.login).toHaveBeenCalledTimes(1)
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

  it.each([undefined, "GET", "get"])(
    "admits read requests using method %s to configured login recovery",
    async (method) => {
      deps.fetch
        .mockRejectedValueOnce(unauthorized())
        .mockResolvedValueOnce({ code: 0, message: "success", data: [] })
      await expect(
        fetchSub2ApiData(
          request,
          "/api/v1/keys",
          method ? { method } : undefined,
        ),
      ).resolves.toEqual([])
      expect(deps.login).toHaveBeenCalledOnce()
    },
  )

  it("does not admit key mutations to automatic login recovery", async () => {
    deps.fetch.mockRejectedValue(unauthorized())
    await expect(
      fetchSub2ApiData(request, "/api/v1/keys", { method: "POST", body: "{}" }),
    ).rejects.toThrow()
    expect(deps.login).not.toHaveBeenCalled()
  })
})
