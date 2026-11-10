import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_COOKIE_VALIDATION_STATUS } from "~/constants/accountCookieValidation"
import { executeWithAccountCredentialRecovery } from "~/services/accountCredentialRecovery"
import { verifyRecoveredCredential } from "~/services/accountCredentialRecovery/result"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum, type SiteAccount } from "~/types"

const deps = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  login: vi.fn(),
  verify: vi.fn(),
}))
vi.mock("~/services/accounts/cookieValidation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/cookieValidation")
  >()),
  validateAccountCookie: deps.verify,
}))
vi.mock("~/services/accounts/accountStorage/accountConfigStore", () => ({
  accountConfigStore: { read: deps.read, mutateAccount: deps.mutate },
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: deps.login }))

describe("account credential recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
    })
  })

  it("does not persist or retry a Cookie rejected by independent verification", async () => {
    const f = fixture()
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(f.error)
      .mockResolvedValueOnce("ok")
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toMatchObject({ result: { status: "failed" } })
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it.each([
    "permission",
    "verification",
    "network",
    "invalid_response",
    "unsupported",
  ] as const)(
    "retains the %s verification cause without saving or retrying",
    async (reason) => {
      const f = fixture()
      const verification = {
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason,
      }
      deps.verify.mockResolvedValue(verification)
      const runner = vi.fn().mockRejectedValue(f.error)
      await expect(
        executeWithAccountCredentialRecovery(f.request, runner),
      ).rejects.toMatchObject({
        result: { status: "uncertain", verification },
        message:
          reason === "permission"
            ? "accountDialog:cookieValidation.permissionRequired"
            : reason === "unsupported"
              ? "accountDialog:cookieValidation.unsupported"
              : "accountDialog:cookieValidation.unavailable",
      })
      expect(deps.mutate).not.toHaveBeenCalled()
      expect(runner).toHaveBeenCalledTimes(1)
    },
  )

  function fixture() {
    let stored = {
      id: "saved",
      site_type: "anyrouter",
      site_url: "https://anyrouter.top",
      authType: AuthTypeEnum.Cookie,
      account_info: { id: "17" },
      cookieAuth: { sessionCookie: "session=expired" },
      login: { methodId: "github", automaticRecovery: true },
    } as unknown as SiteAccount
    deps.read.mockImplementation(async () => ({ accounts: [stored] }))
    deps.mutate.mockImplementation(async (_id, mutation) => {
      const out = mutation(stored)
      stored = out.nextAccount
      return out.result
    })
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential: { cookie: "session=new" },
    })
    const request = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      allowAccountCredentialRecovery: true,
      accountId: "saved",
      siteType: "anyrouter" as const,
      baseUrl: stored.site_url,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "17",
        cookie: "session=expired",
      },
    }
    const error = new ApiError(
      "expired",
      401,
      "/api/user/self",
      API_ERROR_CODES.HTTP_401,
    )
    return {
      request,
      error,
      get: () => stored,
      change: (patch: Partial<SiteAccount>) => {
        stored = { ...stored, ...patch }
      },
    }
  }

  it("recovers an account that has no saved Cookie", async () => {
    const f = fixture()
    f.get().cookieAuth = undefined
    const runner = vi
      .fn()
      .mockRejectedValueOnce(f.error)
      .mockResolvedValueOnce("ok")
    expect(await executeWithAccountCredentialRecovery(f.request, runner)).toBe(
      "ok",
    )
    expect(f.get().cookieAuth?.sessionCookie).toBe("session=new")
  })

  it.each(["new-api", "anyrouter"] as const)(
    "rejects unsupported bearer recovery for %s",
    async (site_type) => {
      expect(
        await verifyRecoveredCredential(
          {
            status: "authenticated",
            identity: "17",
            credential: { accessToken: "token" },
          },
          {
            site_type,
            site_url: "https://example.com",
            account_info: { id: "17" },
            authType: AuthTypeEnum.AccessToken,
          },
        ),
      ).toEqual({ status: "unsupported" })
      expect(deps.verify).not.toHaveBeenCalled()
    },
  )

  it("does not recover a removed account", async () => {
    const f = fixture()
    deps.read.mockResolvedValue({ accounts: [] })
    await expect(
      executeWithAccountCredentialRecovery(
        f.request,
        vi.fn().mockRejectedValue(f.error),
      ),
    ).rejects.toBe(f.error)
    expect(deps.login).not.toHaveBeenCalled()
  })

  it("notifies the operation owner only after a recovered request succeeds", async () => {
    const f = fixture()
    const onCookieRecovered = vi.fn()
    const request = {
      ...f.request,
      observer: { onDispatch: vi.fn(), onResponse: vi.fn(), onCookieRecovered },
    }
    await expect(
      executeWithAccountCredentialRecovery(
        request,
        vi.fn().mockRejectedValueOnce(f.error).mockResolvedValueOnce("ok"),
      ),
    ).resolves.toBe("ok")
    expect(onCookieRecovered).toHaveBeenCalledExactlyOnceWith(
      "session=new",
      expect.any(Number),
    )
    onCookieRecovered.mockClear()
    await expect(
      executeWithAccountCredentialRecovery(
        request,
        vi.fn().mockRejectedValue(f.error),
      ),
    ).rejects.toBe(f.error)
    expect(onCookieRecovered).not.toHaveBeenCalled()
  })

  it("preserves a successful recovered read when an optional observer throws", async () => {
    const f = fixture()
    const request = {
      ...f.request,
      observer: {
        onDispatch: vi.fn(),
        onResponse: vi.fn(),
        onCookieRecovered: () => {
          throw new Error("observer failed")
        },
      },
    }
    await expect(
      executeWithAccountCredentialRecovery(
        request,
        vi.fn().mockRejectedValueOnce(f.error).mockResolvedValueOnce("ok"),
      ),
    ).resolves.toBe("ok")
    expect(f.get().cookieAuth?.sessionCookie).toBe("session=new")
  })
  it("rejects missing request identity before recovery", async () => {
    const f = fixture()
    const request = {
      ...f.request,
      auth: { ...f.request.auth, userId: undefined },
    }
    await expect(
      executeWithAccountCredentialRecovery(
        request,
        vi.fn().mockRejectedValue(f.error),
      ),
    ).rejects.toBe(f.error)
    expect(deps.login).not.toHaveBeenCalled()
  })
  it("recovers a rejected Cookie supplied through the compatibility request field", async () => {
    const f = fixture()
    const request = {
      ...f.request,
      auth: { ...f.request.auth, cookie: undefined },
      cookieAuthSessionCookie: "session=expired",
    }
    const runner = vi
      .fn()
      .mockRejectedValueOnce(f.error)
      .mockResolvedValueOnce("ok")
    expect(await executeWithAccountCredentialRecovery(request, runner)).toBe(
      "ok",
    )
    expect(deps.login).toHaveBeenCalledOnce()
    expect(runner.mock.calls[1]?.[0].cookieAuthSessionCookie).toBe(
      "session=new",
    )
  })

  it("recovers a rejected Cookie carried only by the private Cookie session", async () => {
    const f = fixture()
    const request = {
      ...f.request,
      auth: { ...f.request.auth, cookie: undefined },
      cookieSession: {
        origin: f.request.baseUrl,
        cookieHeader: "session=expired",
      },
    }
    const runner = vi
      .fn()
      .mockRejectedValueOnce(f.error)
      .mockResolvedValueOnce("ok")
    expect(await executeWithAccountCredentialRecovery(request, runner)).toBe(
      "ok",
    )
    expect(deps.login).toHaveBeenCalledOnce()
    expect(runner.mock.calls[1]?.[0].cookieSession.cookieHeader).toBe(
      "session=new",
    )
  })

  it("keeps accounts without explicit recovery permission unchanged", async () => {
    const f = fixture()
    f.change({ login: { methodId: "github" } })
    await expect(
      executeWithAccountCredentialRecovery(
        f.request,
        vi.fn().mockRejectedValue(f.error),
      ),
    ).rejects.toBe(f.error)
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it("requires the account operation to permit recovery", async () => {
    const f = fixture()
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(
        { ...f.request, allowAccountCredentialRecovery: undefined },
        runner,
      ),
    ).rejects.toBe(f.error)
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("does not recover an unadopted site even when its saved login opts in", async () => {
    const f = fixture()
    f.change({ site_type: "new-api" })
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(
        { ...f.request, siteType: "new-api" },
        runner,
      ),
    ).rejects.toBe(f.error)
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("records a recovered credential update without changing the user's edit timestamp", async () => {
    const f = fixture()
    f.change({ updated_at: 1, user_updated_at: 2 })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(f.error)
      .mockResolvedValueOnce("ok")
    await executeWithAccountCredentialRecovery(f.request, runner)
    expect(f.get().updated_at).toBeGreaterThan(1)
    expect(f.get().user_updated_at).toBe(2)
  })

  it("replaces the explicit transport Cookie as well as the account credential", async () => {
    const f = fixture()
    const runner = vi
      .fn()
      .mockRejectedValueOnce(f.error)
      .mockImplementationOnce(async (request) => request.cookieSession)
    await expect(
      executeWithAccountCredentialRecovery(
        {
          ...f.request,
          cookieSession: {
            origin: f.request.baseUrl,
            cookieHeader: "session=expired",
          },
        },
        runner,
      ),
    ).resolves.toEqual({
      origin: f.request.baseUrl,
      cookieHeader: "session=new",
    })
  })

  it("reports a verified login for another account as an identity mismatch", async () => {
    const f = fixture()
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "other-user",
      credential: { cookie: "session=other-user" },
    })
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH })
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("does not persist after the account operation deadline expires during login", async () => {
    const f = fixture()
    const controller = new AbortController()
    deps.login.mockImplementation(async () => {
      controller.abort()
      return {
        status: "authenticated",
        identity: "17",
        credential: { cookie: "session=new" },
      }
    })
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(
        {
          ...f.request,
          abortDeadline: {
            signal: controller.signal,
            start: vi.fn(),
            dispose: vi.fn(),
          },
        },
        runner,
      ),
    ).rejects.toThrow()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it("shares a concurrent credential rotation instead of logging in twice", async () => {
    const f = fixture()
    const runner = vi.fn(async (request) => {
      if (request.auth.cookie === "session=expired") throw f.error
      return request.auth.cookie
    })
    expect(
      await Promise.all([
        executeWithAccountCredentialRecovery(f.request, runner),
        executeWithAccountCredentialRecovery(f.request, runner),
      ]),
    ).toEqual(["session=new", "session=new"])
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
  })

  it("cancels an account-lock waiter without waiting for another login to finish", async () => {
    const f = fixture()
    let release!: (value: unknown) => void
    deps.login.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const runner = vi.fn(async (request) => {
      if (request.auth.cookie === "session=expired") throw f.error
      return "ok"
    })
    const first = executeWithAccountCredentialRecovery(f.request, runner)
    await vi.waitFor(() => expect(deps.login).toHaveBeenCalledOnce())
    const controller = new AbortController()
    let cancelled = false
    const second = executeWithAccountCredentialRecovery(
      { ...f.request, abortSignal: controller.signal },
      runner,
    ).catch(() => {
      cancelled = true
    })
    await Promise.resolve()
    controller.abort()
    try {
      await vi.waitFor(() => expect(cancelled).toBe(true), { timeout: 150 })
    } finally {
      release({
        status: "authenticated",
        identity: "17",
        credential: { cookie: "session=new" },
      })
      await first
      await second
    }
    expect(deps.login).toHaveBeenCalledOnce()
  })

  it.each(["identity", "login", "cookie"])(
    "rejects a stale %s change before writing or retrying",
    async (kind) => {
      const f = fixture()
      deps.login.mockImplementation(async () => {
        f.change(
          kind === "identity"
            ? { site_url: "https://other.example" }
            : kind === "login"
              ? { login: { methodId: "github", automaticRecovery: false } }
              : { cookieAuth: { sessionCookie: "session=user-replaced" } },
        )
        return {
          status: "authenticated",
          identity: "17",
          credential: { cookie: "session=new" },
        }
      })
      const runner = vi.fn().mockRejectedValue(f.error)
      await expect(
        executeWithAccountCredentialRecovery(f.request, runner),
      ).rejects.toThrow("Account changed")
      expect(runner).toHaveBeenCalledTimes(1)
      expect(f.get().cookieAuth?.sessionCookie).not.toBe("session=new")
    },
  )

  it("does not write a late login result after cancellation", async () => {
    const f = fixture()
    const controller = new AbortController()
    deps.login.mockImplementation(async () => {
      controller.abort()
      return {
        status: "authenticated",
        identity: "17",
        credential: { cookie: "session=new" },
      }
    })
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(
        { ...f.request, abortSignal: controller.signal },
        runner,
      ),
    ).rejects.toThrow()
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it.each(["abortSignal", "abortDeadline"])(
    "passes %s cancellation into the active adapter login",
    async (source) => {
      const f = fixture()
      const controller = new AbortController()
      let observed = false
      deps.login.mockImplementation(async ({ abortSignal }) => {
        abortSignal?.addEventListener(
          "abort",
          () => {
            observed = true
          },
          { once: true },
        )
        controller.abort()
        return { status: "cancelled" }
      })
      await expect(
        executeWithAccountCredentialRecovery(
          {
            ...f.request,
            ...(source === "abortSignal"
              ? { abortSignal: controller.signal }
              : {
                  abortDeadline: {
                    signal: controller.signal,
                    start: vi.fn(),
                    dispose: vi.fn(),
                  },
                }),
          },
          vi.fn().mockRejectedValue(f.error),
        ),
      ).rejects.toThrow()
      expect(observed).toBe(true)
      expect(deps.mutate).not.toHaveBeenCalled()
    },
  )

  it.each([
    "identity_mismatch",
    "interaction_required",
    "uncertain",
    "cancelled",
    "session_busy",
  ])("does not persist or retry a %s login", async (status) => {
    const f = fixture()
    deps.login.mockResolvedValue({ status })
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toMatchObject({
      statusCode: undefined,
      result: { status },
      cause: f.error,
    })
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("preserves a blocked login's diagnostic instead of relabeling it as 401", async () => {
    const f = fixture()
    deps.login.mockResolvedValue({
      status: "failed",
      message: "Login request failed (403)",
    })
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toMatchObject({
      statusCode: undefined,
      message: "Login request failed (403)",
      result: { status: "failed", message: "Login request failed (403)" },
      cause: f.error,
    })
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("does not start another login after its recovered read is rejected", async () => {
    const f = fixture()
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toBe(f.error)
    expect(deps.login).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it("stops before retry when credential persistence fails", async () => {
    const f = fixture()
    deps.mutate.mockRejectedValue(new Error("storage write failed"))
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toThrow("storage write failed")
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("does not log in or write when the current account cannot be read", async () => {
    const f = fixture()
    deps.read.mockRejectedValue(new Error("storage read failed"))
    const runner = vi.fn().mockRejectedValue(f.error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toThrow("storage read failed")
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it.each([
    { status: 403, code: API_ERROR_CODES.HTTP_403 },
    { status: undefined, code: API_ERROR_CODES.NETWORK_ERROR },
    { status: 401, code: API_ERROR_CODES.CONTENT_TYPE_MISMATCH },
  ])("does not recover a $code response", async ({ status, code }) => {
    const f = fixture()
    const error = new ApiError("request failed", status, "/api/user/self", code)
    const runner = vi.fn().mockRejectedValue(error)
    await expect(
      executeWithAccountCredentialRecovery(f.request, runner),
    ).rejects.toBe(error)
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it("does not treat a 401 protection challenge as permission to log in", async () => {
    const error = new ApiError(
      "challenge",
      401,
      "/api/user/self",
      API_ERROR_CODES.ROBOT_CHALLENGE,
    )
    const request = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      allowAccountCredentialRecovery: true,
      accountId: "saved",
      siteType: "anyrouter" as const,
      baseUrl: "https://anyrouter.top",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "17",
        cookie: "session=old",
      },
    }
    await expect(
      executeWithAccountCredentialRecovery(
        request,
        vi.fn().mockRejectedValue(error),
      ),
    ).rejects.toBe(error)
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
  })

  it("recovers a rejected saved Cookie with the configured login and persists it before retry", async () => {
    let account = {
      id: "saved",
      site_type: "anyrouter",
      site_url: "https://anyrouter.top",
      authType: AuthTypeEnum.Cookie,
      account_info: { id: "17" },
      cookieAuth: { sessionCookie: "session=expired" },
      login: { methodId: "github", automaticRecovery: true },
    } as unknown as SiteAccount
    deps.read.mockImplementation(async () => ({ accounts: [account] }))
    deps.mutate.mockImplementation(async (_id, mutation) => {
      const result = mutation(account)
      account = result.nextAccount
      return result.result
    })
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential: { cookie: "session=renewed" },
    })
    const runner = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          "expired",
          401,
          "/api/user/self",
          API_ERROR_CODES.HTTP_401,
        ),
      )
      .mockImplementationOnce(async (request) => {
        expect(account.cookieAuth?.sessionCookie).toBe("session=renewed")
        return request.auth.cookie
      })
    const request = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
      allowAccountCredentialRecovery: true,
      accountId: "saved",
      siteType: "anyrouter" as const,
      baseUrl: account.site_url,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "17",
        cookie: "session=expired",
      },
    }
    expect(await executeWithAccountCredentialRecovery(request, runner)).toBe(
      "session=renewed",
    )
    expect(deps.login).toHaveBeenCalledWith(
      expect.objectContaining({
        methodId: "github",
        captureCredential: true,
        attended: false,
      }),
    )
    expect(runner).toHaveBeenCalledTimes(2)
  })
})
