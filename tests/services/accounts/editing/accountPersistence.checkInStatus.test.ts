import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { validateAndSaveAccount } from "~/services/accounts/editing/accountCreation"
import { validateAndUpdateAccount } from "~/services/accounts/editing/accountUpdate"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import * as adapterRegistry from "~/services/apiAdapters/registry"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/discovery/inspection"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { server } from "~~/tests/msw/server"
import { accountStorageTestSurface as accounts } from "~~/tests/test-utils/accountStorageTestSurface"

const origin = "https://save-checkin.example.invalid"

describe("account saving through the shared check-in update", () => {
  beforeEach(async () => {
    server.resetHandlers()
    await accounts.clearAllData()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([false, true])(
    "retains fetched account data when a separate status phase is slow (stuck: %s)",
    async (stuck) => {
      vi.useFakeTimers()
      const fetchData = vi.fn(async (request: ApiServiceAccountRequest) => {
        await new Promise((resolve) => setTimeout(resolve, 18_000))
        const scope = accountBalanceScope(request)
        return {
          balance: accountBalanceSnapshot(
            scope,
            [
              balancePosition({
                id: "wallet",
                scope,
                value: "0.000246",
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                observedAt: 100,
                source: {
                  adapter: "fixture",
                  operation: "wallet",
                  contractVersion: "1",
                  kind: EVIDENCE_KINDS.Reported,
                },
              }),
            ],
            100,
            FINANCIAL_COVERAGE.Complete,
          ),
          today_prompt_tokens: 7,
          today_completion_tokens: 8,
          today_quota_consumption: 9,
          today_requests_count: 10,
          today_income: 11,
          checkIn: request.checkIn,
        }
      })
      const getCapabilities = adapterRegistry.getSiteTypeCapabilities
      vi.spyOn(adapterRegistry, "getSiteTypeCapabilities").mockImplementation(
        (siteType) => {
          const capability = getCapabilities(siteType)
          return {
            ...capability,
            account: { ...capability.account, data: { fetchData } },
          }
        },
      )
      const status = vi
        .spyOn(newApiProvider, "getStatus")
        .mockImplementation(async () => {
          await new Promise((resolve) => {
            if (!stuck) setTimeout(resolve, 4_000)
          })
          return {
            outcome: "known",
            today: "checked",
            evidence: { source: "probe", observedAt: Date.now() },
          }
        })
      const resultPromise = validateAndSaveAccount({
        url: origin,
        siteName: "Slow status",
        username: "tester",
        accessToken: "test-token",
        userId: "1",
        exchangeRate: "7",
        notes: "",
        tagIds: [],
        checkInConfig: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.NEW_API,
          supported: true,
          automaticExecutionEnabled: false,
        }),
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        cookieAuthSessionCookie: "",
        options: { skipAutoProvisionKeyOnAccountAdd: true },
      })
      await vi.waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1))
      await vi.advanceTimersByTimeAsync(18_000)
      await vi.waitFor(() => expect(status).toHaveBeenCalledTimes(1))
      await vi.advanceTimersByTimeAsync(stuck ? 20_000 : 4_000)
      const result = await resultPromise
      expect(status.mock.calls[0]?.[0].request?.abortSignal?.aborted).toBe(
        stuck,
      )
      expect(result.success).toBe(true)
      const account = await accounts.getAccountById(result.accountId!)
      expect(account?.health.status).toBe(SiteHealthStatus.Healthy)
      expect(account?.account_info).toMatchObject({
        balance: {
          positions: [
            expect.objectContaining({
              amount: expect.objectContaining({
                status: "known",
                value: "0.000246",
              }),
            }),
          ],
        },
        today_prompt_tokens: 7,
        today_completion_tokens: 8,
        today_quota_consumption: 9,
        today_requests_count: 10,
        today_income: 11,
      })
      expect(
        getSelectedCheckInStatus({
          config: account!.checkIn,
          siteType: SITE_TYPES.NEW_API,
        }),
      ).toMatchObject(
        stuck ? { outcome: "unknown" } : { outcome: "known", today: "checked" },
      )
    },
  )

  it("queries once on add and edit, persists today's result, and never executes check-in when automation is off", async () => {
    let checked = true
    const readStatus = vi.fn(() =>
      HttpResponse.json({
        success: true,
        data: { enabled: true, stats: { checked_in_today: checked } },
      }),
    )
    const execute = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({
          success: true,
          data: { quota: 123, id: 1, username: "tester" },
        }),
      ),
      http.get(`${origin}/api/log/self/stat`, () =>
        HttpResponse.json({ success: true, data: { quota: 0 } }),
      ),
      http.get(`${origin}/api/log/self`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
      http.get(`${origin}/api/user/checkin`, readStatus),
      http.post(`${origin}/api/user/checkin`, execute),
    )
    const input = {
      url: origin,
      siteName: "Example",
      username: "tester",
      accessToken: "test-token",
      userId: "1",
      exchangeRate: "7.0",
      notes: "",
      tagIds: [],
      checkInConfig: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: false,
      }),
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      cookieAuthSessionCookie: "",
    }
    const created = await validateAndSaveAccount({
      ...input,
      options: { skipAutoProvisionKeyOnAccountAdd: true },
    })
    expect(created.success).toBe(true)
    expect(readStatus).toHaveBeenCalledTimes(1)
    const saved = await accounts.getAccountById(created.accountId!)
    expect(saved?.account_info.balance?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "0.000246",
    })
    expect(saved?.account_info.balance?.positions[0]?.asset).toEqual({
      kind: "currency",
      code: "USD",
    })
    expect(
      getSelectedCheckInStatus({
        config: saved!.checkIn,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({ outcome: "known", today: "checked" })
    checked = false
    const updated = await validateAndUpdateAccount({
      ...input,
      accountId: created.accountId!,
    })
    expect(updated.success).toBe(true)
    expect(readStatus).toHaveBeenCalledTimes(2)
    const reread = await accounts.getAccountById(created.accountId!)
    expect(
      getSelectedCheckInStatus({
        config: reread!.checkIn,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({ outcome: "known", today: "not_checked" })
    expect(reread?.checkIn.automaticExecutionEnabled).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
})
