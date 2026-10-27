import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchNovitaBalanceDetail,
  fetchNovitaKeys,
  fetchNovitaUserInfo,
  isNovitaAuthFailureError,
} from "~/services/apiService/novita"
import {
  NOVITA_AMOUNTS_PER_USD,
  NOVITA_OPENAPI_ENDPOINTS,
  novitaAmountToUsd,
} from "~/services/apiService/novita/constants"
import { ApiError } from "~/services/apiTransport/errors"
import * as requestExecution from "~/services/apiTransport/requestExecution"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse: vi.fn(),
}))

// Wire fixtures captured live on 2026-10-25 against
// https://api.novita.ai/openapi with a real (since deleted) sk_ key.
const USER_INFO_FIXTURE = {
  email: "qihang131417@gmail.com",
  uid: "569665",
  uuid: "076903e3-6ddc-45f3-9dec-d79bc60bcaf8",
  username: "qihang131417@gmail.com",
  country: "United States",
} as Record<string, unknown>

const BALANCE_FIXTURE = {
  availableBalance: "1000000",
  cashBalance: "800000",
  creditLimit: "200000",
  pendingCharges: "0",
  outstandingInvoices: "0",
} as Record<string, unknown>

const KEYS_FIXTURE = {
  keys: [
    {
      name: "all-api-hub-probe-key",
      id: "508046",
      key: "",
      expireTime: "",
      createTime: "2026-10-25 00:52:12",
      stringId: "key_dec88048c9a343fdb089114885e13768",
      memberId: "",
      uuid: "076903e3-6ddc-45f3-9dec-d79bc60bcaf8",
      maskedKey: "sk_1Av3****VaCk",
      lastUsedAt: "-1",
      modelAccessPolicy: {
        mode: "all_enabled",
        allowedModelCount: 0,
        excludedModelCount: 0,
      },
      ipAccessPolicy: null,
    },
  ],
} as Record<string, unknown>

const request = {
  baseUrl: "https://novita.ai",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk_test-key" },
}

describe("novita constants and units", () => {
  it("keeps the documented OpenAPI endpoints and 1/10000 USD amount scale", () => {
    expect(NOVITA_OPENAPI_ENDPOINTS.userInfo).toBe("/v1/user/info")
    expect(NOVITA_OPENAPI_ENDPOINTS.balanceDetail).toBe(
      "/v1/billing/balance/detail",
    )
    expect(NOVITA_OPENAPI_ENDPOINTS.keys).toBe("/v2/user/key")
    expect(NOVITA_AMOUNTS_PER_USD).toBe(10_000)
    // Docs: 10000 = $1.00.
    expect(novitaAmountToUsd("10000")).toBe(1)
    expect(novitaAmountToUsd("800000")).toBe(80)
  })
})

describe("novita api service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back from an expired console credential to the saved API key for account reads", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        body: { message: "expired" },
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: USER_INFO_FIXTURE,
      } as never)
    const paired = {
      ...request,
      auth: {
        ...request.auth,
        accessToken:
          'novita-credentials:{"apiKey":"sk_daily","consoleToken":"expired-session"}',
      },
    }
    expect((await fetchNovitaUserInfo(paired)).id).toBe(USER_INFO_FIXTURE.uuid)
    const calls = vi.mocked(requestExecution.fetchPreparedJsonResponse).mock
      .calls
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[1]).toMatchObject({
      url: "https://api-server.novita.ai/v1/user/info",
      options: { headers: { Authorization: "Bearer expired-session" } },
    })
    expect(calls[1]?.[1]).toMatchObject({
      url: "https://api.novita.ai/openapi/v1/user/info",
      options: { headers: { Authorization: "Bearer sk_daily" } },
    })
  })

  it.each([403, 429, 500])(
    "does not treat HTTP %s as an expired console credential",
    async (status) => {
      vi.mocked(
        requestExecution.fetchPreparedJsonResponse,
      ).mockResolvedValueOnce({ ok: false, status, body: {} } as never)
      await expect(
        fetchNovitaUserInfo({
          ...request,
          auth: {
            ...request.auth,
            accessToken:
              'novita-credentials:{"apiKey":"sk_daily","consoleToken":"console-session"}',
          },
        }),
      ).rejects.toMatchObject({ statusCode: status })
      expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(
        1,
      )
    },
  )

  it("stops after the API-key fallback also rejects authentication", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
      ok: false,
      status: 401,
      body: {},
    } as never)
    await expect(
      fetchNovitaUserInfo({
        ...request,
        auth: {
          ...request.auth,
          accessToken:
            'novita-credentials:{"apiKey":"sk_expired","consoleToken":"expired-session"}',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(2)
  })

  it("rejects requests without an access token before dispatch", async () => {
    await expect(
      fetchNovitaUserInfo({
        baseUrl: request.baseUrl,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: " " },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(requestExecution.fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("prefers console credentials for reads and key creation when both are saved", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
      ok: true,
      status: 200,
      body: USER_INFO_FIXTURE,
    } as never)
    const paired = {
      ...request,
      auth: {
        ...request.auth,
        accessToken:
          'novita-credentials:{"apiKey":"sk_daily","consoleToken":"console-session"}',
      },
    }
    await fetchNovitaUserInfo(paired)
    const { fetchNovitaData } = await import(
      "~/services/apiService/novita/transport"
    )
    await fetchNovitaData(paired, "/v2/user/key", {
      method: "POST",
      body: { name: "test" },
    })
    const calls = vi.mocked(requestExecution.fetchPreparedJsonResponse).mock
      .calls
    expect(calls[0]?.[1]).toMatchObject({
      url: "https://api-server.novita.ai/v1/user/info",
      options: { headers: { Authorization: "Bearer console-session" } },
    })
    expect(calls[1]?.[1]).toMatchObject({
      url: "https://api-server.novita.ai/v2/user/key",
      options: { headers: { Authorization: "Bearer console-session" } },
    })
  })

  it("does not retry a console write with the other credential after an authentication failure", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValue({
      ok: false,
      status: 401,
      body: { message: "expired" },
    } as never)
    const { fetchNovitaData } = await import(
      "~/services/apiService/novita/transport"
    )
    await expect(
      fetchNovitaData(
        {
          ...request,
          auth: {
            ...request.auth,
            accessToken:
              'novita-credentials:{"apiKey":"sk_daily","consoleToken":"expired-session"}',
          },
        },
        "/v2/user/key",
        { method: "POST" },
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(requestExecution.fetchPreparedJsonResponse).mock.calls[0]?.[1],
    ).toMatchObject({
      url: "https://api-server.novita.ai/v2/user/key",
      options: { headers: { Authorization: "Bearer expired-session" } },
    })
  })

  it.each([
    ["PUT", "/v2/user/key"],
    ["DELETE", "/v2/user/key/owned-key"],
  ] as const)(
    "uses console credentials for %s %s",
    async (method, endpoint) => {
      vi.mocked(
        requestExecution.fetchPreparedJsonResponse,
      ).mockResolvedValueOnce({ ok: true, status: 200, body: {} } as never)
      const { fetchNovitaData } = await import(
        "~/services/apiService/novita/transport"
      )
      await fetchNovitaData(
        {
          ...request,
          auth: {
            ...request.auth,
            accessToken:
              'novita-credentials:{"apiKey":"sk_daily","consoleToken":"console-session"}',
          },
        },
        endpoint,
        { method },
      )
      expect(
        vi.mocked(requestExecution.fetchPreparedJsonResponse).mock
          .calls[0]?.[1],
      ).toMatchObject({
        url: "https://api-server.novita.ai" + endpoint,
        options: { headers: { Authorization: "Bearer console-session" } },
      })
    },
  )

  it("keeps model/IP policy writes usable with an expired console credential", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse)
      .mockResolvedValueOnce({ ok: false, status: 401, body: {} } as never)
      .mockResolvedValue({
        ok: true,
        status: 200,
        body: USER_INFO_FIXTURE,
      } as never)
    const paired = {
      ...request,
      auth: {
        ...request.auth,
        userId: USER_INFO_FIXTURE.uuid as string,
        accessToken:
          'novita-credentials:{"apiKey":"sk_daily","consoleToken":"expired-session"}',
      },
    }
    const { verifyNovitaManagementIdentity, setNovitaAllowedIps } =
      await import("~/services/apiService/novita/keyManagement")
    await verifyNovitaManagementIdentity(paired)
    await setNovitaAllowedIps(paired, "owned-key", ["192.0.2.1"])
    for (const call of vi
      .mocked(requestExecution.fetchPreparedJsonResponse)
      .mock.calls.slice(1))
      expect(call[1]).toMatchObject({
        options: { headers: { Authorization: "Bearer sk_daily" } },
      })
  })

  it("rejects malformed paired credentials without sending the envelope to the provider", async () => {
    await expect(
      fetchNovitaUserInfo({
        ...request,
        auth: {
          ...request.auth,
          accessToken: 'novita-credentials:{"apiKey":42}',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(requestExecution.fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("fetches user info against the OpenAPI origin with the bearer key", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      { ok: true, status: 200, body: USER_INFO_FIXTURE } as never,
    )

    const user = await fetchNovitaUserInfo(request)

    expect(user).toEqual({
      id: "076903e3-6ddc-45f3-9dec-d79bc60bcaf8",
      username: "qihang131417@gmail.com",
      access_token: null,
    })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        url: "https://api.novita.ai/openapi/v1/user/info",
        options: expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer sk_test-key",
          }) as unknown as Headers,
        }),
      }),
    )
  })

  it("uses a saved console bearer independently of ambient browser cookies", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      { ok: true, status: 200, body: USER_INFO_FIXTURE } as never,
    )
    await fetchNovitaUserInfo({
      ...request,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "novita-console:console-token",
      },
    })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: "https://api-server.novita.ai/v1/user/info",
        options: expect.objectContaining({
          credentials: "omit",
          redirect: "error",
          headers: expect.objectContaining({
            Authorization: "Bearer console-token",
          }),
        }),
      }),
    )
  })

  it("rejects a user-info payload without a uuid identity", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      { ok: true, status: 200, body: { email: "x@y.z" } } as never,
    )
    await expect(fetchNovitaUserInfo(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("fetches the balance detail and keeps USD semantics", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      { ok: true, status: 200, body: BALANCE_FIXTURE } as never,
    )

    const balance = await fetchNovitaBalanceDetail(request)

    expect(balance).toEqual({
      availableUsd: 100,
      cashUsd: 80,
      creditLimitUsd: 20,
    })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        url: "https://api.novita.ai/openapi/v1/billing/balance/detail",
      }),
    )
  })

  it("rejects non-numeric balance fields instead of coercing them to zero", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      {
        ok: true,
        status: 200,
        body: { ...BALANCE_FIXTURE, availableBalance: null },
      } as never,
    )
    await expect(fetchNovitaBalanceDetail(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })

  it("fetches the masked key inventory with policy summaries", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      { ok: true, status: 200, body: KEYS_FIXTURE } as never,
    )

    const keys = await fetchNovitaKeys(request)

    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      name: "all-api-hub-probe-key",
      stringId: "key_dec88048c9a343fdb089114885e13768",
      maskedKey: "sk_1Av3****VaCk",
      isPermanent: true,
    })
    expect(requestExecution.fetchPreparedJsonResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        url: "https://api.novita.ai/openapi/v2/user/key?includePolicySummary=true&includeIpAccessPolicy=true",
      }),
    )
  })

  it("maps the live invalid-key 401 envelope to an auth failure", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      {
        ok: false,
        status: 401,
        body: {
          code: 401,
          reason: "UNAUTHORIZED",
          message: "key not found",
          metadata: {},
        },
      } as never,
    )

    await expect(fetchNovitaUserInfo(request)).rejects.toMatchObject({
      statusCode: 401,
      code: "HTTP_401",
      upstreamCode: "UNAUTHORIZED",
    })
  })

  it("identifies 401 ApiError as auth failure", () => {
    expect(
      isNovitaAuthFailureError(
        new ApiError("unauth", 401, "/v1/user/info", "HTTP_401"),
      ),
    ).toBe(true)
    expect(
      isNovitaAuthFailureError(
        new ApiError("forbidden", 403, "/v1", "HTTP_403"),
      ),
    ).toBe(false)
    expect(isNovitaAuthFailureError(new Error("generic"))).toBe(false)
  })

  it("rejects a non-object key list payload", async () => {
    vi.mocked(requestExecution.fetchPreparedJsonResponse).mockResolvedValueOnce(
      { ok: true, status: 200, body: { keys: "nope" } } as never,
    )
    await expect(fetchNovitaKeys(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
})
