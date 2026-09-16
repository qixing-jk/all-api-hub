import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import { getSiteName } from "~/services/accounts/siteName"
import { aihubmixAccountBootstrap } from "~/services/apiAdapters/aihubmix/accountBootstrap"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/accountBootstrap"
import { createNewApiAccountCompletion } from "~/services/apiAdapters/newApi/accountCompletion"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { sub2ApiAccountBootstrap } from "~/services/apiAdapters/sub2api/accountBootstrap"
import { voApiV2AccountBootstrap } from "~/services/apiAdapters/voapiV2/accountBootstrap"
import { AuthTypeEnum } from "~/types"

import { createAccountCompletionHelpersMock } from "./checkInFixtures"

const { requestData, requestEnvelope, fetchApi } = vi.hoisted(() => ({
  requestData: vi.fn(),
  requestEnvelope: vi.fn(),
  fetchApi: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchApi,
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data: requestData, envelope: requestEnvelope },
}))

const request = {
  baseUrl: "https://bootstrap.example.com",
  auth: { authType: AuthTypeEnum.None },
}

describe("provider-neutral bootstrap facts", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([
    SITE_TYPES.NEW_API,
    SITE_TYPES.VELOERA,
    SITE_TYPES.ANYROUTER,
    SITE_TYPES.WONG_GONGYI,
  ])(
    "reuses explicit support facts for %s without another probe",
    async (siteType) => {
      const bootstrap = createNewApiAccountBootstrap(siteType)
      for (const checkInSupported of [true, false]) {
        await expect(
          bootstrap.fetchCheckInSupport(request, { checkInSupported }),
        ).resolves.toBe(checkInSupported)
      }
      expect(requestData).not.toHaveBeenCalled()
      expect(requestEnvelope).not.toHaveBeenCalled()
    },
  )

  it.each(
    ACCOUNT_SITE_TYPES.filter(
      (siteType) => getSiteTypeCapabilities(siteType).account?.bootstrap,
    ),
  )(
    "exposes only product facts from the registered %s bootstrap adapter",
    async (siteType) => {
      requestData.mockResolvedValue({
        system_name: "Portal",
        price: 7,
        checkin_enabled: false,
        check_in_enabled: true,
        theme: "default",
        private_field: "ignored",
      })
      fetchApi.mockResolvedValue({
        code: 0,
        message: "ok",
        data: { site_name: "Portal", private_field: "ignored" },
      })
      const bootstrap = getSiteTypeCapabilities(siteType).account!.bootstrap!
      const facts = await bootstrap.loadBootstrapFacts(request)
      expect(Object.keys(facts).length).toBeGreaterThan(0)
      for (const key of Object.keys(facts)) {
        expect([
          "displayName",
          "defaultExchangeRate",
          "frontendTheme",
          "checkInSupported",
        ]).toContain(key)
      }
    },
  )

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.VELOERA])(
    "shares one bootstrap snapshot for %s account completion",
    async (siteType) => {
      requestData.mockImplementation(async (_request, options) => {
        if (options.endpoint === "/api/user/self")
          return { id: 1, username: "alice", access_token: "token" }
        if (options.endpoint === "/api/status")
          return {
            system_name: "Portal",
            stripe_unit_price: 6.8,
            checkin_enabled: true,
            check_in_enabled: true,
          }
        throw new Error(`Unexpected endpoint: ${options.endpoint}`)
      })
      const { helpers } = createAccountCompletionHelpersMock(siteType, {
        automaticExecutionEnabled: true,
      })
      helpers.fetchSiteName.mockImplementation((facts) =>
        getSiteName(request.baseUrl, siteType, facts),
      )
      const result = await createNewApiAccountCompletion(siteType).complete(
        {
          url: request.baseUrl,
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: { userId: "1", siteType },
          context: {},
        },
        helpers,
      )
      expect(result).toMatchObject({
        siteName: "Portal",
        username: "alice",
        exchangeRate: 6.8,
      })
      expect(helpers.createInitialCheckInConfig).toHaveBeenCalledWith({
        supported: true,
      })
      expect(
        requestData.mock.calls.filter(
          ([, options]) => options.endpoint === "/api/status",
        ),
      ).toHaveLength(1)
    },
  )

  it.each([SITE_TYPES.ANYROUTER, SITE_TYPES.WONG_GONGYI])(
    "preserves independent support detection for %s without probing it during metadata loading",
    async (siteType) => {
      requestData.mockResolvedValue({ system_name: "Portal" })
      requestEnvelope.mockResolvedValue({
        success: true,
        data: { enabled: true, checked_in: false },
      })
      const bootstrap = createNewApiAccountBootstrap(siteType)
      const facts = await bootstrap.loadBootstrapFacts(request)
      expect(requestEnvelope).not.toHaveBeenCalled()
      await expect(bootstrap.fetchCheckInSupport(request, facts)).resolves.toBe(
        true,
      )
      expect(requestData).toHaveBeenCalledTimes(1)
      expect(requestEnvelope).toHaveBeenCalledTimes(
        siteType === SITE_TYPES.WONG_GONGYI ? 1 : 0,
      )
    },
  )

  it.each([
    [{ enabled: true, checked_in: false }, true],
    [{ enabled: true, checked_in: true }, true],
    [{ enabled: false, checked_in: false }, false],
    [undefined, false],
  ])(
    "preserves WONG support independently of today's check-in %j",
    async (data, supported) => {
      requestEnvelope.mockResolvedValue({ success: true, data })
      const bootstrap = createNewApiAccountBootstrap(SITE_TYPES.WONG_GONGYI)
      await expect(bootstrap.fetchCheckInSupport(request, {})).resolves.toBe(
        supported,
      )
      expect(requestData).not.toHaveBeenCalled()
      expect(requestEnvelope).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          auth: { authType: AuthTypeEnum.AccessToken },
        }),
        expect.objectContaining({
          endpoint: "/api/user/checkin",
          options: { method: "GET", cache: "no-store" },
        }),
      )
    },
  )

  it.each([
    [{ price: 2.5, stripe_unit_price: 3, PaymentUSDRate: 4 }, 2.5],
    [{ price: 0, stripe_unit_price: 3, PaymentUSDRate: 4 }, 3],
    [{ stripe_unit_price: -1, PaymentUSDRate: 4 }, 4],
    [{ price: "invalid", stripe_unit_price: 3 }, 3],
    [{ price: Infinity, PaymentUSDRate: 4 }, Infinity],
    [{ price: "2.5", PaymentUSDRate: 4 }, "2.5"],
  ])(
    "preserves existing exchange-rate compatibility and precedence for %j",
    async (status, rate) => {
      requestData.mockResolvedValue(status)
      await expect(
        createNewApiAccountBootstrap(SITE_TYPES.NEW_API).loadBootstrapFacts(
          request,
        ),
      ).resolves.toEqual({ defaultExchangeRate: rate })
    },
  )

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.VELOERA])(
    "does not repeat an empty optional status lookup for %s",
    async (siteType) => {
      requestData.mockRejectedValue(new Error("offline"))
      const bootstrap = createNewApiAccountBootstrap(siteType)
      const facts = await bootstrap.loadBootstrapFacts(request)
      expect(facts).toEqual({})
      await expect(
        bootstrap.fetchCheckInSupport(request, facts),
      ).resolves.toBeUndefined()
      expect(requestData).toHaveBeenCalledTimes(1)
    },
  )

  it("ignores malformed optional metadata without blocking bootstrap", async () => {
    requestData.mockResolvedValue({
      system_name: {},
      theme: 12,
      checkin_enabled: "false",
      price: NaN,
    })
    await expect(
      createNewApiAccountBootstrap(SITE_TYPES.NEW_API).loadBootstrapFacts(
        request,
      ),
    ).resolves.toEqual({})
  })

  it.each([undefined, null, "", "   ", 42, {}])(
    "keeps missing or malformed Sub2API names optional (%j)",
    async (site_name) => {
      fetchApi.mockResolvedValue({
        code: 0,
        message: "ok",
        data: { site_name },
      })
      await expect(
        sub2ApiAccountBootstrap.loadBootstrapFacts(request),
      ).resolves.toEqual({ checkInSupported: false })
    },
  )

  it("keeps Sub2API bootstrap available when public settings fail", async () => {
    fetchApi.mockRejectedValue(new Error("offline"))
    await expect(
      sub2ApiAccountBootstrap.loadBootstrapFacts(request),
    ).resolves.toEqual({ checkInSupported: false })
  })

  it("maps Sub2API public settings directly to product facts", async () => {
    fetchApi.mockResolvedValue({
      code: 0,
      message: "ok",
      data: { site_name: "  Sub2 Portal  " },
    })
    await expect(
      sub2ApiAccountBootstrap.loadBootstrapFacts(request),
    ).resolves.toEqual({
      displayName: "Sub2 Portal",
      checkInSupported: false,
    })
    expect(fetchApi).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ endpoint: "/api/v1/settings/public" }),
    )
  })

  it.each([
    ["AIHubMix", aihubmixAccountBootstrap, false],
    ["VoAPI", voApiV2AccountBootstrap, true],
  ] as const)(
    "keeps static bootstrap defaults for %s",
    async (displayName, bootstrap, checkInSupported) => {
      await expect(bootstrap.loadBootstrapFacts(request)).resolves.toEqual({
        displayName,
        checkInSupported,
        defaultExchangeRate: 7.2,
      })
      expect(fetchApi).not.toHaveBeenCalled()
      expect(requestData).not.toHaveBeenCalled()
    },
  )

  it("normalizes Veloera metadata and reuses the snapshot for check-in support", async () => {
    requestData.mockResolvedValue({
      system_name: "Example Portal",
      price: 7.2,
      theme: "default",
      check_in_enabled: true,
      upstream_only: "not a product fact",
    })
    const bootstrap = createNewApiAccountBootstrap(SITE_TYPES.VELOERA)
    const facts = await bootstrap.loadBootstrapFacts(request)
    expect(facts).toEqual({
      displayName: "Example Portal",
      defaultExchangeRate: 7.2,
      frontendTheme: "default",
      checkInSupported: true,
    })
    await expect(bootstrap.fetchCheckInSupport(request, facts)).resolves.toBe(
      true,
    )
    expect(requestData).toHaveBeenCalledTimes(1)
  })
})
