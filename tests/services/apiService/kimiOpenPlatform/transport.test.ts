import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { persistKimiOpenPlatformAuth } from "~/services/accounts/accountStorage/kimiAuthPersistence"
import {
  ensureKimiAuthState,
  fetchKimiConsole,
  fetchKimiConsolePath,
  fetchKimiInference,
  fetchKimiPlatformText,
  persistKimiAuthState,
} from "~/services/apiService/kimiOpenPlatform/transport"
import * as requestExecution from "~/services/apiTransport/requestExecution"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse: vi.fn(),
  executePreparedRequest: vi.fn(),
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAccountById: vi.fn() },
}))
vi.mock("~/services/accounts/accountStorage/kimiAuthPersistence", () => ({
  persistKimiOpenPlatformAuth: vi.fn(),
}))

const request = {
  baseUrl: "https://platform.kimi.ai/console/api-keys",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "expired-access" },
  kimiOpenPlatformAuth: {
    accessToken: "expired-access",
    refreshToken: "refresh-1",
    organizationId: "org-1",
  },
}

describe("kimi console transport", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("serializes mutation bodies and only nonempty query values", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {},
      body: { code: 0 },
    })
    await fetchKimiConsole(structuredClone(request), "createApiKey", {
      method: "POST",
      query: { org: "org 1", empty: "", absent: undefined },
      body: { name: "Key" },
    })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      expect.anything(),
      {
        url: "https://platform.kimi.ai/api?endpoint=createApiKey&org=org+1",
        options: {
          method: "POST",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer expired-access",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: "Key" }),
        },
      },
    )
  })

  it("rejects missing saved accounts and persistence without an identity snapshot", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(null)
    await expect(
      ensureKimiAuthState({
        ...structuredClone(request),
        accountId: "missing",
      }),
    ).rejects.toThrow("kimi_auth_account_missing")
    await expect(
      persistKimiAuthState(
        { ...structuredClone(request), accountId: "saved" },
        request.kimiOpenPlatformAuth,
      ),
    ).rejects.toThrow("kimi_auth_identity_mismatch")
  })

  it("drops an attached session when the saved refresh token was removed", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue({
      id: "saved",
      site_type: "kimi-global",
      site_url: "https://platform.kimi.ai",
      account_info: { id: "user", access_token: "stored" },
    } as never)
    const session = { ...structuredClone(request), accountId: "saved" }
    await expect(ensureKimiAuthState(session)).resolves.toBeUndefined()
    expect(session).not.toHaveProperty("kimiOpenPlatformAuth")
  })

  it("retains the saved token expiry when hydrating a console session", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue({
      id: "saved",
      site_type: "kimi-global",
      site_url: "https://platform.kimi.ai",
      account_info: { id: "user", access_token: "access" },
      kimiOpenPlatformAuth: {
        refreshToken: "refresh",
        organizationId: "org",
        tokenExpiresAt: 123,
      },
    } as never)
    await expect(
      ensureKimiAuthState({ ...structuredClone(request), accountId: "saved" }),
    ).resolves.toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      organizationId: "org",
      tokenExpiresAt: 123,
    })
  })

  it("detects a changed organization between reads and removes stale expiry after rotation", async () => {
    const saved = {
      id: "saved",
      site_type: "kimi-global",
      site_url: "https://platform.kimi.ai",
      account_info: { id: "user", access_token: "new-access" },
      kimiOpenPlatformAuth: {
        refreshToken: "new-refresh",
        organizationId: "org-1",
      },
    }
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(saved as never)
    const state = { ...request.kimiOpenPlatformAuth, tokenExpiresAt: 1 }
    const session = {
      ...request,
      accountId: "saved",
      kimiOpenPlatformAuth: state,
    }
    await expect(ensureKimiAuthState(session)).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    })
    expect(state).not.toHaveProperty("tokenExpiresAt")
    vi.mocked(accountQueries.getAccountById).mockResolvedValue({
      ...saved,
      kimiOpenPlatformAuth: {
        ...saved.kimiOpenPlatformAuth,
        organizationId: "another-org",
      },
    } as never)
    await expect(ensureKimiAuthState(session)).rejects.toThrow(
      "kimi_auth_identity_mismatch",
    )
  })

  it("does not retry the original operation after refresh HTTP failure", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({ ok: false, status: 401, headers: {}, body: {} })
      .mockResolvedValueOnce({ ok: false, status: 403, headers: {}, body: {} })
    await expect(
      fetchKimiConsole(structuredClone(request), "userInfo"),
    ).rejects.toMatchObject({ code: "HTTP_403" })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(2)
  })

  it("rejects missing console credentials before dispatch", async () => {
    await expect(
      fetchKimiConsole(
        {
          baseUrl: request.baseUrl,
          auth: { authType: AuthTypeEnum.AccessToken },
        },
        "userInfo",
      ),
    ).rejects.toMatchObject({ code: "HTTP_401" })
    expect(requestExecution.fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it.each([fetchKimiConsole, fetchKimiConsolePath, fetchKimiPlatformText])(
    "rejects unknown console deployments",
    async (fetcher) => {
      await expect(
        fetcher(
          { ...request, baseUrl: "https://unrelated.example" },
          "userInfo",
        ),
      ).rejects.toThrow("unknown_kimi_deployment")
    },
  )

  it.each([null, {}, { code: "0" }])(
    "rejects invalid success envelopes %j",
    async (body) => {
      vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {},
        body,
      })
      await expect(
        fetchKimiConsole(structuredClone(request), "userInfo"),
      ).rejects.toThrow("invalid_kimi_envelope")
    },
  )

  it.each([
    ["https://platform.kimi.com", "https://api.moonshot.cn"],
    ["https://platform.kimi.ai", "https://api.moonshot.ai"],
  ])("uses only the inference key for %s", async (baseUrl, origin) => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {},
      body: { balance: 5 },
    })
    await expect(
      fetchKimiInference(
        { ...request, baseUrl },
        "/v1/users/me/balance",
        " sk-secret ",
      ),
    ).resolves.toEqual({ balance: 5 })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      expect.anything(),
      {
        url: `${origin}/v1/users/me/balance`,
        options: {
          method: "GET",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer sk-secret",
          },
        },
      },
    )
    expect(accountQueries.getAccountById).not.toHaveBeenCalled()
  })

  it.each([
    [401, "HTTP_401"],
    [403, "HTTP_403"],
    [429, "HTTP_429"],
    [500, "HTTP_OTHER"],
  ])("preserves inference HTTP %s errors", async (status, code) => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
      ok: false,
      status: Number(status),
      headers: {},
      body: {},
    })
    await expect(
      fetchKimiInference(request, "/v1/models", "sk-secret"),
    ).rejects.toMatchObject({ code })
  })

  it("rejects an empty inference key before dispatch", async () => {
    await expect(
      fetchKimiInference(request, "/v1/models", " "),
    ).rejects.toMatchObject({ code: "HTTP_401" })
    expect(requestExecution.fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it.each(["text", "unreadable", "http-error"])(
    "reads public pricing assets without credentials: %s",
    async (scenario) => {
      const response = {
        ok: scenario !== "http-error",
        status: scenario === "http-error" ? 403 : 200,
        text:
          scenario === "unreadable"
            ? vi.fn().mockRejectedValue(new Error("read failed"))
            : vi.fn().mockResolvedValue("pricing"),
      }
      vi.mocked(requestExecution.executePreparedRequest).mockImplementation(
        async (_request, _prepared, callback) =>
          callback({ dispatch: vi.fn().mockResolvedValue(response) } as never),
      )
      const result = fetchKimiPlatformText(
        { baseUrl: request.baseUrl },
        "/docs/pricing.md",
      )
      if (scenario === "http-error")
        await expect(result).rejects.toMatchObject({ code: "HTTP_403" })
      else
        await expect(result).resolves.toBe(
          scenario === "unreadable" ? "" : "pricing",
        )
      expect(requestExecution.executePreparedRequest).toHaveBeenCalledWith(
        { baseUrl: request.baseUrl },
        {
          url: "https://platform.kimi.ai/docs/pricing.md",
          options: { method: "GET", credentials: "omit" },
        },
        expect.any(Function),
      )
    },
  )

  it("reuses the saved rotation when concurrent requests receive 401", async () => {
    const saved = {
      id: "saved",
      site_type: "kimi-global",
      site_url: "https://platform.kimi.ai",
      account_info: { id: "user", access_token: "expired-access" },
      kimiOpenPlatformAuth: {
        refreshToken: "refresh-1",
        organizationId: "org-1",
      },
    }
    vi.mocked(accountQueries.getAccountById).mockImplementation(
      async () => structuredClone(saved) as never,
    )
    vi.mocked(persistKimiOpenPlatformAuth).mockImplementation(
      async (_snapshot, accessToken, auth) => {
        saved.account_info.access_token = accessToken
        saved.kimiOpenPlatformAuth = auth
      },
    )
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockImplementation(
      async (_request, prepared) => {
        if (prepared.url.includes("refreshToken"))
          return {
            ok: true,
            status: 200,
            headers: {},
            body: {
              code: 0,
              data: { access_token: "next", refresh_token: "next-refresh" },
            },
          }
        const headers = prepared.options.headers as Record<string, string>
        return headers.Authorization === "Bearer next"
          ? { ok: true, status: 200, headers: {}, body: { code: 0, data: {} } }
          : { ok: false, status: 401, headers: {}, body: { code: 401 } }
      },
    )
    await Promise.all(
      [1, 2].map(() =>
        fetchKimiConsole(
          { ...structuredClone(request), accountId: "saved" },
          "userInfo",
        ),
      ),
    )
    expect(
      vi
        .mocked(requestExecution.fetchPreparedJsonResponse)
        .mock.calls.filter(([, prepared]) =>
          prepared.url.includes("refreshToken"),
        ),
    ).toHaveLength(1)
  })

  it("rejects saved credentials belonging to another deployment before dispatch", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue({
      id: "saved",
      site_type: "kimi",
      site_url: "https://platform.kimi.com",
      account_info: { id: "user", access_token: "cn-access" },
      kimiOpenPlatformAuth: {
        refreshToken: "cn-refresh",
        organizationId: "cn-org",
      },
    } as never)
    await expect(
      fetchKimiConsole(
        { ...structuredClone(request), accountId: "saved" },
        "userInfo",
      ),
    ).rejects.toThrow("kimi_auth_identity_mismatch")
    expect(requestExecution.fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("stops the retry when the rotated session could not be persisted", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue({
      id: "saved",
      site_type: "kimi-global",
      site_url: "https://platform.kimi.ai",
      account_info: { id: "user", access_token: "expired-access" },
      kimiOpenPlatformAuth: {
        refreshToken: "refresh-1",
        organizationId: "org-1",
      },
    } as never)
    vi.mocked(persistKimiOpenPlatformAuth).mockRejectedValueOnce(
      new Error("kimi_auth_state_write_failed"),
    )
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {},
        body: { code: 401 },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: {
          code: 0,
          data: { access_token: "next", refresh_token: "next-refresh" },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: { code: 0, data: {} },
      })
    await expect(
      fetchKimiConsole(
        { ...structuredClone(request), accountId: "saved" },
        "userInfo",
      ),
    ).rejects.toThrow("kimi_auth_state_write_failed")
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(2)
  })

  it.each(["updateApiKey", "deleteApiKey"])(
    "rejects a business failure from %s even when HTTP succeeds",
    async (endpoint) => {
      vi.mocked(
        requestExecution.fetchPreparedJsonResponse,
      ).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: { code: 403, message: "permission denied" },
      })
      await expect(
        fetchKimiConsole(structuredClone(request), endpoint),
      ).rejects.toMatchObject({
        code: "BUSINESS_ERROR",
        upstreamCode: "403",
        message: "permission denied",
      })
      expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(
        1,
      )
    },
  )

  it("refreshes a REST gateway's HTTP 400 with code 401 and preserves its route", async () => {
    const sessionRequest = structuredClone(request)
    sessionRequest.auth.accessToken = "old-access"
    sessionRequest.kimiOpenPlatformAuth.accessToken = "old-access"
    sessionRequest.kimiOpenPlatformAuth.refreshToken = "refresh-1"
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {},
        body: { code: 401, message: "Unauthorized" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: {
          code: 0,
          data: { access_token: "new-access", refresh_token: "new-refresh" },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: { code: 0, data: { data: [{ id: "kimi-k2.6" }] } },
      })
    const path =
      "/api/v1/organizations/org-1/projects/proj-1/open-gateway/models"
    await expect(
      fetchKimiConsolePath(sessionRequest, path),
    ).resolves.toMatchObject({ code: 0 })
    const calls = vi.mocked(requestExecution.fetchPreparedJsonResponse).mock
      .calls
    expect(calls[0]?.[1].url).toBe(`https://platform.kimi.ai${path}`)
    expect(calls[2]?.[1]).toMatchObject({
      url: `https://platform.kimi.ai${path}`,
      options: {
        credentials: "omit",
        headers: { Authorization: "Bearer new-access" },
      },
    })
  })

  it("does not repeat refresh when the retried REST request is still unauthorized", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {},
        body: { code: 401 },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: {
          code: 0,
          data: { access_token: "new-access", refresh_token: "new-refresh" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {},
        body: { code: 401 },
      })
    await expect(
      fetchKimiConsolePath(structuredClone(request), "/api/v1/models"),
    ).rejects.toMatchObject({ code: "HTTP_401" })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(3)
  })

  it("refreshes once with Msh-Authorization and retries the original call", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {},
        body: { code: 401, message: "Unauthorized" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: {
          code: 0,
          data: { access_token: "next-access", refresh_token: "next-refresh" },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {},
        body: { code: 0, data: { uid: "user-1" } },
      })

    await expect(fetchKimiConsole(request, "userInfo")).resolves.toEqual({
      code: 0,
      data: { uid: "user-1" },
    })

    const refreshCall = atIndex(
      vi.mocked(requestExecution.fetchPreparedJsonResponse).mock.calls,
      1,
    )
    const refreshHeaders = refreshCall?.[1].options.headers as Record<
      string,
      string
    >
    expect(refreshCall?.[1].url).toBe(
      "https://platform.kimi.ai/api?endpoint=refreshToken",
    )
    expect(refreshHeaders["Msh-Authorization"]).toBe("refresh-1")
    const retryCall = atIndex(
      vi.mocked(requestExecution.fetchPreparedJsonResponse).mock.calls,
      2,
    )
    const retryHeaders = retryCall?.[1].options.headers as Record<
      string,
      string
    >
    expect(retryHeaders.Authorization).toBe("Bearer next-access")
    expect(request.kimiOpenPlatformAuth.refreshToken).toBe("next-refresh")
  })
})
