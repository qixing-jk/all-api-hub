import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { getAccountSiteApiRouter, SITE_TYPES } from "~/constants/siteType"
import { getExistingAccountAccessToken } from "~/services/accounts/autoDetect/existingCredentials"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { getAccountBrowserIdentityCapability } from "~/services/accountSiteOnboarding/registry"
import { ACCOUNT_SCOPE_KEY } from "~/services/apiAdapters/newApi/keys/accountKeyIdentity"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const genericShell = SITE_TYPES.SHELL_API
const origin = "https://shell.example"

const cookieRequest = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: "7" },
  checkIn: buildCheckInConfig(),
}

function serveProfile(id: string) {
  server.use(
    http.get(origin + "/api/user/self", () =>
      HttpResponse.json({
        success: true,
        data: {
          id,
          username: "alice",
          quota: 750000,
          access_token: "unverified-profile-token",
        },
      }),
    ),
  )
}

describe("Shell API family", () => {
  it("offers the common console routes and System token completion for generic deployments", () => {
    expect(getAccountSiteApiRouter(genericShell)).toMatchObject({
      usagePath: "/log",
      accessTokenPath: "/account/profile",
      pricingPath: "/account/pricing",
      redeemPath: "/account/topup/recharge",
    })
    expect(getAccountSiteDefinition(genericShell)).toMatchObject({
      legacyAccountTokenScope: "account",
      onboarding: { accessTokenVerificationGuide: { copy: "shellApi" } },
      productProfile: { auth: { defaultAuthType: "access_token" } },
    })
  })
  it("does not treat a generic profile token as a verified console credential", async () => {
    serveProfile("7")
    const bootstrap = getSiteTypeCapabilities(genericShell).account!.bootstrap!
    await expect(bootstrap.fetchUserInfo(cookieRequest)).resolves.toMatchObject(
      {
        id: "7",
        access_token: "",
        user: { access_token: null },
      },
    )
  })

  it.each(["7", "8", "rejected"])(
    "verifies a generic profile token independently before completing onboarding (%s)",
    async (verifiedId) => {
      const reads: {
        bearer: boolean
        credentials: string
        redirect: string
      }[] = []
      server.use(
        http.get(origin + "/api/status", () =>
          HttpResponse.json({
            success: true,
            data: { system_name: "Shell", price: 7 },
          }),
        ),
        http.get(origin + "/api/user/self", ({ request }) => {
          const bearer =
            request.headers.get("authorization") === "Bearer profile-token"
          reads.push({
            bearer,
            credentials: request.credentials,
            redirect: request.redirect,
          })
          if (bearer && verifiedId === "rejected")
            return new HttpResponse(null, { status: 401 })
          return HttpResponse.json({
            success: true,
            data: {
              id: bearer ? verifiedId : "7",
              username: "alice",
              access_token: "profile-token",
            },
          })
        }),
      )
      const result = completeAutoDetectedAccount({
        url: origin,
        detected: {
          siteType: genericShell,
          userId: "7",
          user: { id: "7", username: "alice" },
        },
        requestedAuthType: AuthTypeEnum.AccessToken,
      })
      if (verifiedId === "7") {
        await expect(result).resolves.toMatchObject({
          siteType: genericShell,
          userId: "7",
          accessToken: "profile-token",
          authType: AuthTypeEnum.AccessToken,
        })
      } else {
        await expect(result).rejects.toThrow()
      }
      expect(reads).toContainEqual({
        bearer: true,
        credentials: "omit",
        redirect: "error",
      })
    },
  )

  it("does not follow a profile redirect into another account origin", async () => {
    let foreignReads = 0
    const foreignProfile = "https://other-shell.example/api/user/self"
    server.use(
      http.get(origin + "/api/user/self", () =>
        HttpResponse.redirect(foreignProfile),
      ),
      http.get(foreignProfile, () => {
        foreignReads++
        return HttpResponse.json({ success: true, data: { id: "7", quota: 1 } })
      }),
    )
    const account = getSiteTypeCapabilities(genericShell).account!
    await expect(
      account.bootstrap!.fetchUserInfo(cookieRequest),
    ).rejects.toThrow()
    await expect(account.data!.fetchData(cookieRequest)).rejects.toThrow()
    expect(foreignReads).toBe(0)
  })

  it.each([
    { expected: "", returned: "7" },
    { expected: "7", returned: "8" },
  ])(
    "rejects a quota response with no established account binding (%j)",
    async ({ expected, returned }) => {
      serveProfile(returned)
      const data = getSiteTypeCapabilities(genericShell).account!.data!
      await expect(
        data.fetchData({
          ...cookieRequest,
          auth: { ...cookieRequest.auth, userId: expected },
        }),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      })
    },
  )

  it.each([SITE_TYPES.APIYI, SITE_TYPES.LAOZHANG, SITE_TYPES.SHELL_API])(
    "dispatches %s through Shell while preserving its account and key capabilities",
    (siteType) => {
      const capabilities = getSiteTypeCapabilities(siteType)
      expect(capabilities).toMatchObject({
        siteType,
        family: "shellApiFamily",
        account: {
          bootstrap: expect.any(Object),
          completion: expect.any(Object),
          refresh: expect.any(Object),
          modelPricing: expect.any(Object),
          keyResourceManagement: expect.any(Object),
          inviteLink: expect.any(Object),
          redemption: expect.any(Object),
        },
        site: { notice: expect.any(Object), announcements: expect.any(Object) },
      })
      expect(
        getAccountBrowserIdentityCapability({
          origin,
          siteType,
          candidateUserIds: [],
        }),
      ).toBeDefined()
    },
  )

  it("offers common account actions without enabling managed-site integration", () => {
    const capabilities = getSiteTypeCapabilities(genericShell)
    expect(capabilities).toMatchObject({
      family: "shellApiFamily",
      account: {
        completion: expect.any(Object),
        bootstrap: expect.any(Object),
        data: expect.any(Object),
        refresh: expect.any(Object),
      },
    })
    expect(capabilities.account?.keyResourceManagement).toBeDefined()
    expect(capabilities.account?.redemption).toBeDefined()
    expect(capabilities.account?.modelPricing).toBeDefined()
    expect(capabilities.account?.inviteLink).toBeDefined()
    expect(capabilities.managedSites).toBeUndefined()
  })

  it("reads generic Shell keys and prices through the common protocol", async () => {
    server.use(
      http.get(origin + "/api/token/", ({ request }) => {
        expect(new URL(request.url).searchParams.get("p")).toBe("0")
        return HttpResponse.json({ success: true, data: [] })
      }),
      http.get(origin + "/api/pricing", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model_name: "shell-model",
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 2,
              enable_groups: ["default"],
            },
          ],
          group_ratio: { default: 1 },
          usable_group: { default: "Default" },
        }),
      ),
    )
    const account = getSiteTypeCapabilities(genericShell).account!
    const session = await account.keyResourceManagement!.open({
      account: { id: "shell-account", siteType: genericShell },
      request: { ...cookieRequest, accountId: "shell-account" },
    })
    const collection = await session.openCollection(ACCOUNT_SCOPE_KEY)
    expect((await collection.list()).items).toEqual([])
    await expect(
      account.modelPricing!.fetchPricing(cookieRequest),
    ).resolves.toMatchObject({
      success: true,
      data: [
        { model_name: "shell-model", model_ratio: 1, completion_ratio: 2 },
      ],
    })
  })

  it("uses the shared Shell USD scale while retaining the raw quota", () => {
    expect(newApiFinancialAmount(750000, origin, genericShell)).toMatchObject({
      value: "1.5",
      asset: { kind: "currency", code: "USD" },
      contractVersion: "standard-usd/v1",
      amountInputs: { quota: "750000" },
    })
  })

  it("collects generic balance, settled spending and credited income with their sources", async () => {
    serveProfile("7")
    server.use(
      http.get(origin + "/api/log/self/stat", () =>
        HttpResponse.json({ success: true, data: { quota: 125000 } }),
      ),
      http.get(origin + "/api/log/self", ({ request }) =>
        HttpResponse.json({
          success: true,
          data: {
            items:
              new URL(request.url).searchParams.get("type") ===
              String(LogType.System)
                ? [{ quota: 250000 }]
                : [],
            total: 1,
          },
        }),
      ),
    )
    const result = await getSiteTypeCapabilities(
      genericShell,
    ).account!.data!.fetchData({ ...cookieRequest, includeTodayCashflow: true })
    expect(result.balance?.positions[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "1.5", source: { adapter: genericShell } },
    })
    expect(result.settledConsumption?.[0]).toMatchObject({
      amount: {
        value: "0.25",
        source: { adapter: genericShell, amountInputs: { quota: "125000" } },
      },
    })
    expect(result.reportedIncome?.[0]).toMatchObject({
      classification: "unclassified",
      amount: { value: "0.5", source: { adapter: genericShell } },
    })
  })

  it("keeps balance refresh usable when optional usage endpoints are absent", async () => {
    serveProfile("7")
    server.use(
      http.get(
        origin + "/api/log/*",
        () => new HttpResponse(null, { status: 404 }),
      ),
    )
    const result = await getSiteTypeCapabilities(
      genericShell,
    ).account!.refresh!.refreshAccount({
      ...cookieRequest,
      includeTodayCashflow: true,
    })
    expect(result).toMatchObject({
      success: true,
      data: {
        todayStatsAvailability: {
          consumption: { status: "unavailable" },
          income: { status: "unavailable" },
        },
      },
    })
    if (result.success)
      expect(result.data?.balance?.positions[0]?.amount).toMatchObject({
        value: "1.5",
      })
  })

  it("collects every native Shell log page even when each page is shorter than requested", async () => {
    serveProfile("7")
    const pages = new Map<string, number[]>()
    server.use(
      http.get(
        origin + "/api/log/self/stat",
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(origin + "/api/log/self", ({ request }) => {
        const params = new URL(request.url).searchParams
        const type = params.get("type")!
        const page = Number(params.get("p"))
        pages.set(type, [...(pages.get(type) ?? []), page])
        const rows =
          type === String(LogType.Consume)
            ? [
                {
                  type: LogType.Consume,
                  quota: 125000,
                  prompt_tokens: 1,
                  completion_tokens: 2,
                },
                {
                  type: LogType.Consume,
                  quota: 250000,
                  prompt_tokens: 3,
                  completion_tokens: 4,
                },
              ]
            : type === String(LogType.System)
              ? [{ quota: 500000 }, { quota: 250000 }]
              : []
        return HttpResponse.json({
          success: true,
          data: rows.slice(page, page + 1),
        })
      }),
    )
    const result = await getSiteTypeCapabilities(
      genericShell,
    ).account!.data!.fetchData({
      ...cookieRequest,
      includeTodayCashflow: true,
    })
    expect(result.settledConsumption?.[0]).toMatchObject({
      amount: { value: "0.75" },
      coverage: "complete",
    })
    expect(result.reportedIncome?.[0]).toMatchObject({
      amount: { value: "1.5" },
      coverage: "complete",
    })
    expect(result.today_requests_count).toBe(2)
    expect(result.today_prompt_tokens + result.today_completion_tokens).toBe(10)
    expect(pages.get(String(LogType.Consume))).toEqual([0, 1, 2])
    expect(pages.get(String(LogType.System))).toEqual([0, 1, 2])
  })

  it("does not accept a saved credential across Shell site types even at the same origin", () => {
    expect(() =>
      getExistingAccountAccessToken(
        origin,
        { userId: "7", siteType: SITE_TYPES.LAOZHANG },
        {
          url: origin,
          userId: "7",
          siteType: SITE_TYPES.APIYI,
          accessToken: "separate-token",
        },
      ),
    ).toThrow()
  })

  it("creates, edits, reopens and deletes a generic Shell key through native requests", async () => {
    let token: NewApiToken | undefined
    const writes: Record<string, unknown>[] = []
    server.use(
      http.get(origin + "/api/token/", ({ request }) =>
        HttpResponse.json({
          success: true,
          data:
            new URL(request.url).searchParams.get("p") === "0" && token
              ? [token]
              : [],
        }),
      ),
      http.get(origin + "/api/token/81", () =>
        HttpResponse.json({ success: true, data: token }),
      ),
      http.get(origin + "/api/groupPro/selectable", () =>
        HttpResponse.json({
          success: true,
          data: [{ name: "default", convert_ratio: 1 }],
        }),
      ),
      http.get(origin + "/api/user/available_model/", () =>
        HttpResponse.json({ success: true, data: ["shell-model"] }),
      ),
      http.post(origin + "/api/token/", async ({ request }) => {
        const values = (await request.json()) as Record<string, unknown>
        writes.push(values)
        token = {
          id: 81,
          user_id: 7,
          key: "sk-shell-fixture",
          status: 1,
          created_time: 1,
          accessed_time: 1,
          expired_time: -1,
          used_quota: 0,
          ...values,
        } as NewApiToken
        return HttpResponse.json({ success: true, data: token })
      }),
      http.put(origin + "/api/token/", async ({ request }) => {
        const values = (await request.json()) as Record<string, unknown>
        writes.push(values)
        token = { ...token, ...values } as NewApiToken
        return HttpResponse.json({ success: true })
      }),
      http.delete(origin + "/api/token/81", () => {
        token = undefined
        return HttpResponse.json({ success: true })
      }),
    )
    const session = await getSiteTypeCapabilities(
      genericShell,
    ).account!.keyResourceManagement!.open({
      account: { id: "shell-lifecycle", siteType: genericShell },
      request: { ...cookieRequest, accountId: "shell-lifecycle" },
    })
    const create = await session.openCreateEditor(ACCOUNT_SCOPE_KEY)
    const created = await create.submit({
      ...create.initialValues,
      name: "Created",
      group: "default",
      unlimited_quota: false,
      quotaUsd: 2.5,
    })
    expect(created.facts?.ref.resourceId).toBe("81")
    expect(writes[0]).toMatchObject({
      name: "Created",
      remain_quota: 1250000,
      unlimited_quota: false,
    })
    const collection = await session.openCollection(ACCOUNT_SCOPE_KEY)
    const ref = created.facts!.ref
    const edit = await collection.openEditEditor(ref)
    await edit.submit({ ...edit.initialValues, name: "Renamed" })
    const reopened = await collection.openEditEditor(ref)
    expect(reopened.initialValues).toMatchObject({
      name: "Renamed",
      quotaUsd: 2.5,
    })
    await collection.delete(ref)
    expect((await collection.list()).items).toEqual([])
  })

  it("attempts common invitations, notices and redemption and surfaces server rejection", async () => {
    let rejected = false
    server.use(
      http.get(new RegExp(origin + "/api/user/aff/?$"), () =>
        HttpResponse.json({ success: true, data: "invite-7" }),
      ),
      http.get(origin + "/api/notice", () =>
        HttpResponse.json({ success: true, data: "Shell notice" }),
      ),
      http.post(origin + "/api/user/topup", async ({ request }) => {
        expect(await request.json()).toEqual({ key: "fixture-code" })
        return HttpResponse.json(
          rejected
            ? { success: false, message: "not supported" }
            : { success: true, data: 500000 },
        )
      }),
      http.get(
        origin + "/api/pricing",
        () => new HttpResponse(null, { status: 404 }),
      ),
    )
    const capabilities = getSiteTypeCapabilities(genericShell)
    await expect(
      capabilities.account!.inviteLink!.fetchInviteLink({
        request: cookieRequest,
      }),
    ).resolves.toBe(origin + "/register/?aff_code=invite-7")
    await expect(capabilities.site!.notice!.fetch(cookieRequest)).resolves.toBe(
      "Shell notice",
    )
    await expect(
      capabilities.account!.redemption!.redeem({
        request: cookieRequest,
        code: "fixture-code",
      }),
    ).resolves.toMatchObject({
      awards: [{ asset: { kind: "currency", code: "USD" } }],
    })
    rejected = true
    await expect(
      capabilities.account!.redemption!.redeem({
        request: cookieRequest,
        code: "fixture-code",
      }),
    ).rejects.toThrow()
    await expect(
      capabilities.account!.modelPricing!.fetchPricing(cookieRequest),
    ).rejects.toThrow()
  })
})
