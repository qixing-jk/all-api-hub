import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { persistKimiOpenPlatformAuth } from "~/services/accounts/accountStorage/kimiAuthPersistence"
import {
  fetchKimiConsole,
  fetchKimiConsolePath,
} from "~/services/apiService/kimiOpenPlatform/transport"
import * as requestExecution from "~/services/apiTransport/requestExecution"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse: vi.fn(),
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
