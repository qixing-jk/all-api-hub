import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { accountBalanceSnapshot } from "~/services/accounts/balanceSnapshot"
import { acceptBalanceRefresh } from "~/services/accounts/refresh/balanceAcceptance"
import {
  ASSET_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { relayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import { fetchAccountBalance } from "~/services/apiService/newApiFamily/default/accountData"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { fetchAccountBalance as fetchRixBalance } from "~/services/apiService/newApiFamily/variants/rixApi"
import { fetchRelayForOverview } from "~/services/apiService/relayfor"
import { fetchVoApiV2AccountData } from "~/services/apiService/voapiV2/accountData"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/relayfor", () => ({
  fetchRelayForOverview: vi.fn(),
  fetchRelayForTimedQuotas: vi.fn().mockResolvedValue([]),
}))
const origin = "https://refresh-default.invalid"
const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: origin,
  accountId: "a",
  siteType: SITE_TYPES.NEW_API,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "fixture",
  },
  checkIn: buildCheckInConfig(),
  includeTodayCashflow: false,
}

it.each(["new-api", "rix", "relayfor", "voapi-v2"] as const)(
  "refreshes %s without retaining the previous dev representation as a second balance",
  async (type) => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { quota: 5000000 } }),
      ),
      http.get(`${origin}/api/user/info`, () =>
        HttpResponse.json({
          code: 0,
          data: { id: 1, basicBalance: 2, bindBalance: 10 },
        }),
      ),
    )
    vi.mocked(fetchRelayForOverview).mockResolvedValue({
      user: { id: 1, quota: 940000 },
      timed_quota: 1880000,
      group_quotas: [],
    } as never)
    const fresh =
      type === "new-api"
        ? await fetchAccountBalance(request)
        : type === "rix"
          ? await fetchRixBalance({ ...request, siteType: SITE_TYPES.RIX_API })
          : type === "relayfor"
            ? await relayForAccountData.fetchData(request)
            : await fetchVoApiV2AccountData(request)
    const positions = structuredClone(fresh.balance!.positions)
    if (type === "new-api" || type === "rix") {
      positions[0]!.amount.source.contractVersion =
        NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota
      positions[0]!.asset = {
        kind: ASSET_KINDS.Quota,
        id: `${origin}:new-api-quota`,
        label: "quota",
        displayScale: 1,
        displayLabel: "quota",
      }
      positions[0]!.amount = {
        ...positions[0]!.amount,
        status: OBSERVATION_STATUSES.Known,
        value: "5000000",
        observedAt: 1,
      }
    } else if (type === "relayfor")
      positions.find((p) => p.id === "timed")!.collectionKey = "timed-summary"
    else for (const p of positions) p.amount.source.operation += `:${p.id}`
    const previous = accountBalanceSnapshot(
      positions[0]!.scope,
      positions,
      1,
      "complete",
    )
    const accepted = acceptBalanceRefresh(
      previous,
      fresh.balanceRefreshParts!,
      fresh.balance!.subject,
      Date.now(),
    )
    expect(accepted.positions).toHaveLength(
      type === "new-api" || type === "rix" ? 1 : 2,
    )
    expect(accepted.positions.every((p) => p.amount.status === "known")).toBe(
      true,
    )
    // A failed request has no replacement receipts and retains all previous values.
    const failed = acceptBalanceRefresh(
      previous,
      [],
      previous.subject,
      Date.now(),
    )
    expect(failed.positions.map((p) => p.amount.status)).toEqual(
      positions.map(() => "stale"),
    )
    expect(
      failed.positions.map((p) =>
        p.amount.status === "stale" ? p.amount.value : undefined,
      ),
    ).toEqual(
      positions.map((p) =>
        p.amount.status === "known" ? p.amount.value : undefined,
      ),
    )
  },
)
