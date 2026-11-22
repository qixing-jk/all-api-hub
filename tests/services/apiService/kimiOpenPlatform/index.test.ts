import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import {
  BALANCE_PURPOSES,
  projectBalance,
} from "~/services/accounts/metrics/balanceProjection"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import {
  createKimiKey,
  deleteKimiKey,
  fetchKimiAccountData,
  fetchKimiAccountModelCatalog,
  fetchKimiKeys,
  fetchKimiProjects,
  fetchKimiUserInfo,
  renameKimiKey,
  resolveKimiOrganizationId,
} from "~/services/apiService/kimiOpenPlatform"
import * as transport from "~/services/apiService/kimiOpenPlatform/transport"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/kimiOpenPlatform/transport", () => ({
  ensureKimiAuthState: vi.fn(),
  fetchKimiConsole: vi.fn(),
  fetchKimiConsolePath: vi.fn(),
  fetchKimiInference: vi.fn(),
  persistKimiAuthState: vi.fn(),
  readKimiAuthState: vi.fn(),
}))

const consoleSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  organizationId: "org-xyz",
}

const accountRequest = () => ({
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  accountId: "acc-1",
  baseUrl: "https://platform.kimi.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token-1" },
})

describe("kimiOpenPlatform service index", () => {
  it("keeps console provider-day spending in its native currency and organization for daily presentation", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
      code: 0,
      data: { cur: 200000, voucher_cur: 100000, today_consume: 400000 },
    })
    const data = await fetchKimiAccountData({
      ...accountRequest(),
      checkIn: buildCheckInConfig(),
    })
    expect(getSiteDayReadings(data)).toMatchObject([
      {
        lastKnown: false,
        observedAt: expect.any(Number),
        usage: {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          cost: {
            asset: { kind: "currency", code: "CNY" },
            amount: { status: "known", value: "4" },
            scope: { organizationId: "org-xyz" },
          },
        },
      },
    ])
    expect(
      getDisplayConsumptionProjection([
        { id: "acc-1", settledConsumption: data.settledConsumption },
      ]).groups,
    ).toEqual([])
  })
  it("keeps inference cash and vouchers readable without inventing an absent available balance", async () => {
    vi.mocked(transport.fetchKimiInference).mockResolvedValue({
      status: true,
      code: 0,
      data: { cash_balance: -2, voucher_balance: 10 },
    })
    const data = await fetchKimiAccountData({
      ...accountRequest(),
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk-test" },
      checkIn: buildCheckInConfig(),
    })
    expect(data.balance?.positions[0]?.amount.status).toBe("unavailable")
    expect(
      data.balance?.positions
        .slice(1)
        .map(({ amount }) => ("value" in amount ? amount.value : undefined)),
    ).toEqual(["-2", "10"])
    expect(
      projectBalance(data.balance!, BALANCE_PURPOSES.Available).amounts,
    ).toEqual([])
  })
  it.each([`0.${"0".repeat(253)}1`, "9".repeat(256), "invalid", true])(
    "retains independent voucher and zero consumption when a synthetic console amount is invalid or exceeds normalization bounds: %s",
    async (cur) => {
      vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
      vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
        code: 0,
        data: {
          cur,
          voucher_cur: 100000,
          today_consume: 0,
        },
      })
      const data = await fetchKimiAccountData({
        ...accountRequest(),
        checkIn: buildCheckInConfig(),
      })
      expect(
        data.balance?.positions.map((position) => position.amount),
      ).toEqual([
        expect.objectContaining({ status: "unavailable" }),
        expect.objectContaining({ status: "unavailable" }),
        expect.objectContaining({ status: "known", value: "1" }),
      ])
      expect(data.balance?.coverage).toBe("partial")
      expect(data.usageObservations?.[0]?.cost?.amount).toMatchObject({
        status: "known",
        value: "0",
      })
    },
  )

  it.each([
    [200000, 0, "2"],
    [0, 1000000, "10"],
    [200000, 1000000, "12"],
    [0, 0, "0"],
    [-200000, 1000000, "8"],
    [undefined, 1000000, undefined],
    [200000, undefined, undefined],
  ])(
    "retains console components without inventing missing money: %s/%s",
    async (cur, voucher, available) => {
      vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
      vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
        code: 0,
        data: { cur, voucher_cur: voucher, today_consume: 2298 },
      })
      const data = await fetchKimiAccountData({
        ...accountRequest(),
        checkIn: buildCheckInConfig(),
      })
      expect(data).not.toHaveProperty("quota")
      expect(data).not.toHaveProperty("nativeBalance")
      expect(
        data.balance?.positions.map((p) => [
          p.id,
          p.amount.status,
          "value" in p.amount ? p.amount.value : undefined,
        ]),
      ).toEqual([
        [
          "available",
          available === undefined ? "unavailable" : "known",
          available,
        ],
        [
          "cur",
          cur === undefined ? "unavailable" : "known",
          cur === undefined ? undefined : String(cur / 100000),
        ],
        [
          "voucher",
          voucher === undefined ? "unavailable" : "known",
          voucher === undefined ? undefined : String(voucher / 100000),
        ],
      ])
      expect(data.balance?.positions[0]).toMatchObject({
        asset: { kind: "currency", code: "CNY" },
        nature: "mixed",
        amount: {
          source: {
            adapter: "kimi",
            operation: "console/account",
            contractVersion: "2",
            kind: "derived",
          },
        },
        scope: { organizationId: "org-xyz" },
      })
      expect(data.today_quota_consumption).toBe(0)
      expect(data.usageObservations?.[0]?.cost?.amount).toMatchObject({
        value: "0.02298",
      })
      expect(data.balanceRefreshParts).toEqual([
        expect.objectContaining({
          enumeration: "complete",
          collectionKey: "console/account",
          positions: data.balance?.positions,
        }),
      ])
      expect(data.balance?.positions[2]).toMatchObject({
        instrument: "voucher",
        funding: "unknown",
      })
    },
  )

  it("keeps inference available authoritative despite negative cash and never applies console scaling", async () => {
    vi.mocked(transport.fetchKimiInference).mockResolvedValue({
      status: true,
      code: 0,
      data: { available_balance: 10, cash_balance: -2, voucher_balance: 10 },
    })
    const data = await fetchKimiAccountData({
      ...accountRequest(),
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk-test" },
      checkIn: buildCheckInConfig(),
    })
    expect(
      data.balance?.positions.map((p) => [
        p.id,
        "value" in p.amount ? p.amount.value : undefined,
      ]),
    ).toEqual([
      ["available", "10"],
      ["cash", "-2"],
      ["voucher", "10"],
    ])
    expect(data.balance?.positions[0]?.amount.source.operation).toBe(
      "inference/balance",
    )
  })
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("learns an organization and uses the uid when the user has no display name", async () => {
    const state = { ...consoleSession, organizationId: "" }
    vi.mocked(transport.readKimiAuthState).mockReturnValue(state)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
      code: 0,
      data: {
        uid: " user ",
        organizations: [{ organization: { id: " org " } }],
      },
    })
    await expect(fetchKimiUserInfo(accountRequest())).resolves.toEqual({
      id: "user",
      username: "user",
      access_token: "token-1",
      organizationId: "org",
    })
    expect(state.organizationId).toBe("org")
  })

  it("rejects accounts without an organization", async () => {
    vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
      code: 0,
      data: { uid: "user" },
    })
    await expect(resolveKimiOrganizationId(accountRequest())).rejects.toThrow(
      "missing_kimi_organization",
    )
    expect(transport.persistKimiAuthState).not.toHaveBeenCalled()
  })

  it("routes list, creation, rename and deletion to the selected organization and project", async () => {
    const request = accountRequest()
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    const key = {
      key: "ak-key",
      auth: "sk-secret",
      name: "Key",
      project_id: "project",
    }
    vi.mocked(transport.fetchKimiConsole)
      .mockResolvedValueOnce({ code: 0, data: [key] })
      .mockResolvedValueOnce({ code: 0, data: key })
      .mockResolvedValue({ code: 0 })
    await expect(fetchKimiKeys(request)).resolves.toEqual([key])
    await expect(createKimiKey(request, "project", "Key")).resolves.toEqual(key)
    await renameKimiKey(request, "project", "ak-key", "Renamed")
    await deleteKimiKey(request, "project", "ak-key")
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      1,
      request,
      "organizationKeys",
      { query: { oid: "org-xyz" } },
    )
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      2,
      request,
      "createApiKey",
      {
        method: "POST",
        query: { pid: "project", oid: "org-xyz" },
        body: { name: "Key" },
      },
    )
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      3,
      request,
      "updateApiKey",
      {
        method: "PUT",
        query: { pid: "project", oid: "org-xyz", id: "ak-key" },
        body: { name: "Renamed" },
      },
    )
    expect(transport.fetchKimiConsole).toHaveBeenNthCalledWith(
      4,
      request,
      "deleteApiKey",
      {
        method: "DELETE",
        query: { pid: "project", oid: "org-xyz", id: "ak-key" },
      },
    )
  })

  it.each([
    ["https://platform.kimi.com", 72, 7.2],
    ["https://platform.kimi.ai", 10, 7.2],
  ])(
    "uses API-key-only balance on the correct deployment %s",
    async (baseUrl, available, exchangeRate) => {
      vi.mocked(transport.readKimiAuthState).mockReturnValue(undefined)
      vi.mocked(transport.fetchKimiInference).mockResolvedValue({
        code: 0,
        status: true,
        scode: "0x0",
        data: { available_balance: available },
      })
      const request = {
        ...accountRequest(),
        baseUrl,
        exchangeRate,
        checkIn: buildCheckInConfig(),
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "sk-inference-key",
        },
      }
      await expect(fetchKimiAccountData(request)).resolves.toMatchObject({
        balance: {
          positions: expect.arrayContaining([
            expect.objectContaining({
              id: "available",
              amount: expect.objectContaining({ value: String(available) }),
            }),
          ]),
        },
        today_quota_consumption: 0,
      })
      expect(transport.fetchKimiInference).toHaveBeenCalledWith(
        request,
        "/v1/users/me/balance",
        "sk-inference-key",
      )
      expect(transport.fetchKimiConsole).not.toHaveBeenCalled()
    },
  )

  it("rejects a malformed gateway list instead of accepting it as empty", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [{ id: "project-1", name: "Default", is_default: true }],
    })
    vi.mocked(transport.fetchKimiConsolePath).mockResolvedValueOnce({
      code: 0,
      data: { data: "unexpected" },
    })
    await expect(
      fetchKimiAccountModelCatalog(accountRequest()),
    ).rejects.toThrow("invalid_kimi_model_catalog")
  })

  it("resolves organizationId from stored state when present", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce(
      consoleSession,
    )

    const oid = await resolveKimiOrganizationId(accountRequest())
    expect(oid).toBe("org-xyz")
  })

  it("resolves organizationId from userInfo when state has no organizationId", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce({
      ...consoleSession,
      organizationId: "",
    })
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: {
        uid: "user-1",
        organizations: [{ organization: { id: "org-from-user-info" } }],
      },
    })

    const request = accountRequest()
    const oid = await resolveKimiOrganizationId(request)
    expect(oid).toBe("org-from-user-info")
    expect(transport.persistKimiAuthState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ organizationId: "org-from-user-info" }),
    )
  })

  it("fetchKimiProjects passes resolved organizationId to listProjects", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce(
      consoleSession,
    )
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [{ id: "proj-1", name: "Project 1", is_default: true }],
    })

    const request = accountRequest()
    const projects = await fetchKimiProjects(request)
    expect(projects).toEqual([
      { id: "proj-1", name: "Project 1", is_default: true },
    ])
    expect(transport.fetchKimiConsole).toHaveBeenCalledWith(
      request,
      "listProjects",
      { query: { oid: "org-xyz" } },
    )
  })

  it.each([
    {
      baseUrl: "https://platform.kimi.com",
      exchangeRate: 7.2,
    },
    {
      baseUrl: "https://platform.kimi.com",
      exchangeRate: undefined,
    },
    {
      baseUrl: "https://platform.kimi.com",
      exchangeRate: 8,
    },
    {
      baseUrl: "https://platform.kimi.ai",
      exchangeRate: 8,
    },
  ])(
    "normalizes console balance and today's consumption for $baseUrl with exchange rate $exchangeRate",
    async ({ baseUrl, exchangeRate }) => {
      vi.mocked(transport.ensureKimiAuthState).mockResolvedValueOnce(
        consoleSession,
      )
      vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
        code: 0,
        // The console shows 76.58300 and 0.02298 in its deployment currency.
        data: { cur: 7_658_300, voucher_cur: 0, today_consume: 2_298 },
      })

      const request = {
        ...accountRequest(),
        baseUrl,
        exchangeRate,
        checkIn: buildCheckInConfig(),
      }

      const data = await fetchKimiAccountData(request)
      expect(transport.fetchKimiConsole).toHaveBeenCalledWith(
        request,
        "organizationAccountInfo",
        { query: { oid: "org-xyz" } },
      )
      expect(data).toMatchObject({
        balance: {
          positions: expect.arrayContaining([
            expect.objectContaining({
              id: "available",
              amount: expect.objectContaining({ value: "76.583" }),
            }),
          ]),
        },
        today_quota_consumption: 0,
      })
    },
  )

  it.each([
    { cur: 0, todayConsume: 0, expected: "0" },
    { cur: -150_000, todayConsume: 1, expected: "-1.5" },
  ])(
    "preserves zero, debt and fractional console amounts: $cur / $todayConsume",
    async ({ cur, todayConsume, expected }) => {
      vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
      vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
        code: 0,
        data: { cur, voucher_cur: 0, today_consume: todayConsume },
      })

      await expect(
        fetchKimiAccountData({
          ...accountRequest(),
          baseUrl: "https://platform.kimi.ai",
          checkIn: buildCheckInConfig(),
        }),
      ).resolves.toMatchObject({
        balance: {
          positions: expect.arrayContaining([
            expect.objectContaining({
              id: "available",
              amount: expect.objectContaining({ value: expected }),
            }),
          ]),
        },
        today_quota_consumption: 0,
      })
    },
  )

  it("fetchKimiAccountModelCatalog reads the default project's open gateway", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [
        { id: "proj-other", name: "Other" },
        { id: "proj-default", name: "Default", is_default: true },
      ],
    })
    vi.mocked(transport.fetchKimiConsolePath).mockResolvedValueOnce({
      code: 0,
      data: {
        object: "list",
        data: [
          {
            id: "kimi-k2.7-code",
            context_length: 262144,
            supports_reasoning: true,
          },
          { id: "kimi-k2.6" },
          { id: 42 },
        ],
      },
    })

    const request = accountRequest()
    const models = await fetchKimiAccountModelCatalog(request)

    expect(models).toEqual([{ id: "kimi-k2.7-code" }, { id: "kimi-k2.6" }])
    expect(transport.fetchKimiConsolePath).toHaveBeenCalledWith(
      request,
      "/api/v1/organizations/org-xyz/projects/proj-default/open-gateway/models",
    )
  })

  it("fetchKimiAccountModelCatalog rejects when the account has no project", async () => {
    vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
    vi.mocked(transport.fetchKimiConsole).mockResolvedValueOnce({
      code: 0,
      data: [],
    })

    await expect(
      fetchKimiAccountModelCatalog(accountRequest()),
    ).rejects.toThrow("missing_kimi_project")
    expect(transport.fetchKimiConsolePath).not.toHaveBeenCalled()
  })
})

it("keeps native console spend without inventing a daily interval", async () => {
  vi.mocked(transport.ensureKimiAuthState).mockResolvedValue(consoleSession)
  vi.mocked(transport.fetchKimiConsole).mockResolvedValue({
    code: 0,
    data: { cur: 100000, voucher_cur: 0, today_consume: "2.0000000000001" },
  })
  const data = await fetchKimiAccountData({
    ...accountRequest(),
    checkIn: buildCheckInConfig(),
  })
  expect(data.usageObservations?.[0]).toMatchObject({
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    cost: { amount: { value: "0.000020000000000001" } },
  })
  expect(data.todayStatsAvailability?.consumption.status).toBe("unavailable")
  expect(data.today_quota_consumption).toBe(0)
})
