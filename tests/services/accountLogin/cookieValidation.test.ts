import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import { SITE_TYPES } from "~/constants/siteType"
import { validateAccountCookie } from "~/services/accounts/cookieValidation"
import * as registry from "~/services/apiAdapters/registry"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"

const deps = vi.hoisted(() => ({ response: vi.fn(), requests: vi.fn() }))
vi.mock("~/services/apiTransport/request", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiTransport/request")>()
  return {
    ...actual,
    fetchApiData: (...args: Parameters<typeof actual.fetchApiData>) => {
      deps.requests(...args)
      return actual.fetchApiData(...args)
    },
  }
})
vi.mock("~/services/apiTransport/headerOverrides", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/apiTransport/headerOverrides")
  >()),
  fetchWithHeaderOverrides: async () => {
    const response = await deps.response()
    return new Response(
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body),
      {
        status: response.status,
        headers: {
          "Content-Type":
            typeof response.body === "string"
              ? "text/html"
              : "application/json",
        },
      },
    )
  },
}))

const account = {
  site_type: SITE_TYPES.ANYROUTER,
  site_url: "https://anyrouter.top",
  account_info: { id: "17", access_token: "valid-token" },
  cookieAuth: { sessionCookie: "session=rejected" },
}

describe("Shared saved Cookie validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetAllMocks()
  })

  it("validates New API Cookies without requiring login recovery", async () => {
    deps.response.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true, data: { id: 17 } },
    })
    expect(
      await validateAccountCookie({
        ...account,
        site_type: SITE_TYPES.NEW_API,
      }),
    ).toEqual({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
  })
  it("reuses FreeModel's native identity parser", async () => {
    deps.response.mockResolvedValue({
      status: 200,
      body: { user: { id: 17, name: "member" } },
    })
    expect(
      await validateAccountCookie({
        ...account,
        site_type: SITE_TYPES.FREEMODEL,
        site_url: "https://freemodel.dev",
      }),
    ).toEqual({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
  })
  it("uses a protected context only after the explicit direct Cookie encounters verification", async () => {
    const capabilities = registry.getSiteTypeCapabilities(SITE_TYPES.NEW_API)
    const reader = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          "challenge",
          403,
          undefined,
          API_ERROR_CODES.ROBOT_CHALLENGE,
        ),
      )
      .mockResolvedValueOnce({ id: "17" })
    vi.spyOn(registry, "getSiteTypeCapabilities").mockReturnValue({
      ...capabilities,
      account: {
        ...capabilities.account,
        bootstrap: {
          ...capabilities.account!.bootstrap!,
          fetchUserInfo: reader,
        },
      },
    })
    const execution: ProtectionBypassExecution = {
      version: 2,
      kind: "user_command",
      command: "detect_account",
      surface: "options",
    }
    expect(
      await validateAccountCookie({
        ...account,
        protectionBypassExecution: execution,
        fetchContext: {
          kind: "current-tab",
          tabId: 5,
          origin: account.site_url,
        },
      }),
    ).toEqual({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
    expect(reader).toHaveBeenCalledTimes(2)
    expect(reader.mock.calls[0]![0].forceTempWindow).not.toBe(true)
    expect(reader.mock.calls[0]![0].cookieSession.cookieHeader).toBe(
      account.cookieAuth.sessionCookie,
    )
    const fallback = reader.mock.calls[1]![0]
    expect(fallback.forceTempWindow).toBe(true)
    expect(fallback.auth).toEqual({
      authType: "cookie",
      cookie: account.cookieAuth.sessionCookie,
      userId: "17",
    })
    expect(fallback.fetchContext.kind).toBe("browser-context")
    expect(fallback.allowAccountCredentialRecovery).not.toBe(true)
  })
  it("delegates Cookie verification to the existing protected account request flow", async () => {
    const fetchContext = {
      kind: "browser-context" as const,
      cookieStoreId: "source-store",
      incognito: true,
    }
    deps.response.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true, data: { id: 17 } },
    })
    expect(
      await validateAccountCookie({
        ...account,
        fetchContext,
      }),
    ).toEqual({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
    const [request] = deps.requests.mock.calls[0] ?? []
    expect(request.cookieSession).toEqual({
      origin: "https://anyrouter.top",
      cookieHeader: account.cookieAuth.sessionCookie,
    })
    expect(request.forceTempWindow).not.toBe(true)
    expect(request.fetchContext).toEqual(fetchContext)
    expect(request.auth).toEqual({
      authType: "cookie",
      userId: "17",
      cookie: "session=rejected",
    })
    expect(request.accountId).toBeUndefined()
    expect(request.allowAccountCredentialRecovery).not.toBe(true)
  })

  it("reports the saved Cookie rejection without borrowing a valid Token or browser login", async () => {
    deps.response.mockResolvedValue({
      ok: false,
      status: 401,
      body: { success: false, message: "login required" },
    })
    const result = await validateAccountCookie(account)
    expect(result).toEqual({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid })
    const [request] = deps.requests.mock.calls[0] ?? []
    expect(request.auth.accessToken).toBeUndefined()
    expect(request.cookieSession).toEqual({
      origin: "https://anyrouter.top",
      cookieHeader: account.cookieAuth.sessionCookie,
    })
    expect(request.auth.cookie).toBe(account.cookieAuth.sessionCookie)
    expect(request.accountId).toBeUndefined()
    expect(request.allowAccountCredentialRecovery).not.toBe(true)
    expect(request.fetchContext.kind).toBe("browser-context")
  })

  it.each([
    { id: 17, status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid },
    { id: 18, status: ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch },
  ])("verifies the Cookie identity ($status)", async ({ id, status }) => {
    deps.response.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true, data: { id } },
    })
    expect(await validateAccountCookie(account)).toEqual({ status })
  })

  it.each([
    {
      cookieAuth: { sessionCookie: "" },
      account_info: account.account_info,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.MissingCookie,
    },
    {
      cookieAuth: account.cookieAuth,
      account_info: { id: "" },
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.MissingIdentity,
    },
  ])(
    "does not send an incomplete diagnostic ($reason)",
    async ({ reason, ...fields }) => {
      expect(
        await validateAccountCookie({
          ...account,
          ...fields,
        }),
      ).toEqual({
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason,
      })
      expect(deps.response).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      code: API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Permission,
    },
    {
      code: API_ERROR_CODES.ROBOT_CHALLENGE,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
    },
    {
      code: API_ERROR_CODES.NETWORK_ERROR,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Network,
    },
    {
      code: API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
    },
    {
      code: API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    },
    {
      code: API_ERROR_CODES.FEATURE_UNSUPPORTED,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    },
  ])(
    "does not label $reason failures as Cookie rejection",
    async ({ code, reason }) => {
      deps.response.mockRejectedValue(
        new ApiError("private diagnostic", undefined, undefined, code),
      )
      expect(await validateAccountCookie(account)).toEqual({
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
        reason,
      })
    },
  )
  it.each([
    { status: 401, body: "<html>Website verification</html>" },
    { status: 200, body: "<html>acw_sc__v2 verification required</html>" },
    { status: 200, body: { success: false, message: "login required" } },
    { status: 200, body: { success: true, data: {} } },
    { status: 403, body: { success: false } },
  ])(
    "leaves ambiguous HTTP $status responses unconfirmed",
    async (response) => {
      deps.response.mockResolvedValue({
        ...response,
        ok: response.status === 200,
      })
      expect(await validateAccountCookie(account)).toMatchObject({
        status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      })
    },
  )
  it("does not offer Cookie diagnostics for token-only providers", async () => {
    expect(
      await validateAccountCookie({
        ...account,
        site_type: SITE_TYPES.OPENROUTER,
      }),
    ).toEqual({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    })
    expect(deps.response).not.toHaveBeenCalled()
  })

  it("does not report malformed identities as a different account", async () => {
    deps.response.mockResolvedValue({
      ok: true,
      status: 200,
      body: { success: true, data: { id: { unexpected: 18 } } },
    })
    expect(await validateAccountCookie(account)).toEqual({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.InvalidResponse,
    })
  })
})
