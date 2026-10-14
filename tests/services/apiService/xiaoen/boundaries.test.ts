import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildServiceCredentialRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { performCheckIn } from "~/services/apiService/xiaoen/checkIn"
import {
  fetchXiaoenEnvelope,
  readXiaoen,
} from "~/services/apiService/xiaoen/transport"
import { xiaoenProvider } from "~/services/checkin/autoCheckin/providers/xiaoen"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

import { createAccountCompletionHelpersMock } from "../../apiAdapters/checkInFixtures"

const { fetchApi, fetchModels } = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  fetchModels: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", async (original) => ({
  ...(await original()),
  fetchApi,
}))
vi.mock("~/services/aiApi/openaiCompatible", async (original) => ({
  ...(await original()),
  fetchOpenAICompatibleModelIds: fetchModels,
}))

const user = {
  id: "fixture-user",
  username: "owner",
  quota: 30,
  permanentQuota: 20,
  dailyQuota: 10,
  hasSignedInToday: false,
  apiKey: "sk-test-key",
  apiBaseUrl: "https://inference.example.com/v1",
  inviteCode: "CODE",
}
const request = {
  baseUrl: "https://free.supxh.xin",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: user.id,
    cookie: "auth_token=fixture",
  },
}
const account = buildSiteAccount({
  site_type: "xiaoen",
  site_url: request.baseUrl,
  authType: AuthTypeEnum.Cookie,
  account_info: { ...buildSiteAccount().account_info, id: user.id },
  cookieAuth: { sessionCookie: request.auth.cookie },
})
const capabilities = getSiteTypeCapabilities("xiaoen")
const execution = {
  tempWindowRequestSource: "background" as const,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}

describe("Xiaoen protocol boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fetchModels.mockResolvedValue(["visible", "unpriced"])
    fetchApi.mockImplementation(async (_request, { endpoint }) => {
      if (endpoint === "/api/auth/me") return { success: true, data: user }
      if (endpoint === "/api/site-config")
        return {
          success: true,
          data: { externalLinks: { siteUrl: "https://go.toter.me" } },
        }
      if (endpoint === "/api/models/pricing")
        return {
          success: true,
          data: {
            models: [
              { name: "visible", priceLabel: "credits", priceType: "call" },
            ],
          },
        }
      throw new Error(`Unexpected endpoint ${endpoint}`)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    { quota: 31 },
    { hasSignedInToday: null },
    { id: "another-user" },
    { id: "" },
  ])("rejects invalid or foreign account facts %j", async (change) => {
    fetchApi.mockResolvedValue({ success: true, data: { ...user, ...change } })
    await expect(
      capabilities.account!.data!.fetchData({
        ...request,
        checkIn: account.checkIn,
      }),
    ).rejects.toThrow()
  })
  it.each([
    {},
    { inviteCode: "" },
    { externalLinks: { siteUrl: "http://unsafe.example.com" } },
  ])(
    "rejects absent invitation metadata and unsafe hosts %j",
    async (config) => {
      fetchApi.mockImplementation(async (_request, { endpoint }) => ({
        success: true,
        data:
          endpoint === "/api/auth/me"
            ? {
                ...user,
                ...(Object.hasOwn(config, "inviteCode") ? config : {}),
              }
            : config,
      }))
      await expect(
        capabilities.account!.inviteLink!.fetchInviteLink({ request }),
      ).rejects.toThrow()
    },
  )
  it.each([
    "http://inference.example.com",
    "https://name:secret@inference.example.com",
    "https://inference.example.com?secret=x",
  ])("rejects unsafe inference credential routes %s", async (apiBaseUrl) => {
    fetchApi.mockResolvedValue({ success: true, data: { ...user, apiBaseUrl } })
    await expect(
      capabilities.account!.serviceCredential!.fetch(request),
    ).rejects.toThrow()
  })
  it("refuses console access-token creation", async () => {
    await expect(
      capabilities.account!.bootstrap!.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    expect(fetchApi).not.toHaveBeenCalled()
  })
  it("completes Cookie onboarding from a live identity and captures recovery facts", async () => {
    const { helpers } = createAccountCompletionHelpersMock("xiaoen", {
      automaticExecutionEnabled: true,
    })
    helpers.createServiceRequest.mockReturnValue(request)
    const result = await capabilities.account!.completion!.complete(
      {
        url: request.baseUrl,
        requestedAuthType: AuthTypeEnum.Cookie,
        detected: { userId: user.id, siteType: "xiaoen" },
        context: {},
      },
      helpers,
    )
    expect(result).toMatchObject({
      userId: user.id,
      username: user.username,
      authType: AuthTypeEnum.Cookie,
      accessToken: "",
    })
    expect(helpers.captureRecoveryData).toHaveBeenCalledWith({
      userId: user.id,
      username: user.username,
      authType: AuthTypeEnum.Cookie,
    })
  })
  it("returns bootstrap status and native routes without another probe", async () => {
    expect(
      await capabilities.account!.bootstrap!.fetchCheckInSupport(request, {
        checkInSupported: true,
      }),
    ).toBe(true)
    expect(
      await capabilities.account!.bootstrap!.resolveRoutePath!(
        { siteType: "xiaoen", baseUrl: request.baseUrl },
        "checkIn",
      ),
    ).toBe("/dashboard")
    expect(fetchApi).not.toHaveBeenCalled()
  })
  it("loads authenticated bootstrap facts without exposing native account fields", async () => {
    expect(
      await capabilities.account!.bootstrap!.loadBootstrapFacts(request),
    ).toEqual({ displayName: "肖恩 AI", checkInSupported: true })
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })
  it("honors cancellation during a status read", async () => {
    const controller = new AbortController()
    controller.abort()
    expect(
      await xiaoenProvider.getStatus!({
        request,
        observedAt: 123,
        signal: controller.signal,
      }),
    ).toMatchObject({ outcome: "unknown" })
    expect(fetchApi).not.toHaveBeenCalled()
  })
  it("preserves refresh errors as an unhealthy result", async () => {
    fetchApi.mockRejectedValue(new Error("offline"))
    expect(
      await capabilities.account!.refresh!.refreshAccount({
        ...request,
        checkIn: account.checkIn,
      }),
    ).toMatchObject({ success: false })
  })
  it.each([
    null,
    { success: "true" },
    { success: false },
    { success: false, message: "denied" },
    { success: true, data: null },
  ])(
    "rejects malformed and unsuccessful console envelopes %j",
    async (body) => {
      fetchApi.mockResolvedValue(body)
      await expect(readXiaoen(request, "/api/auth/me")).rejects.toThrow()
    },
  )
  it("keeps non-GET identity requests uncached", async () => {
    await readXiaoen(request, "/api/auth/me", { method: "POST" })
    expect(fetchApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({ method: "POST" }),
      }),
      false,
    )
  })
  it("requires Firefox interceptor permission before accessing a captured Cookie", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(browser.permissions, "contains").mockResolvedValue(false)
    await expect(
      fetchXiaoenEnvelope(request, "/api/auth/me"),
    ).rejects.toMatchObject({ code: "COOKIE_PERMISSION_REQUIRED" })
    expect(fetchApi).not.toHaveBeenCalled()
  })
  it("uses the permitted Firefox Cookie header without a Chromium session", async () => {
    vi.stubEnv("BROWSER", "firefox")
    vi.spyOn(browser.permissions, "contains").mockResolvedValue(true)
    await fetchXiaoenEnvelope(request, "/api/auth/me")
    expect(fetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ cookie: request.auth.cookie }),
        cookieSession: undefined,
        forceTempWindow: false,
      }),
      expect.anything(),
      false,
    )
  })
  it.each([
    null,
    { success: false },
    { success: true, data: {} },
    { success: true, data: { models: [null] } },
  ])("rejects malformed public model pricing %j", async (body) => {
    fetchApi.mockImplementation(async (_request, { endpoint }) =>
      endpoint === "/api/auth/me" ? { success: true, data: user } : body,
    )
    await expect(
      capabilities.account!.modelPricing!.fetchPricing(request),
    ).rejects.toThrow()
  })
  it("enriches runtime models without dropping models absent from public pricing", async () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(
      {
        id: account.id,
        name: "肖恩 AI",
        siteType: "xiaoen",
        baseUrl: request.baseUrl,
        token: "",
        userId: user.id,
        authType: AuthTypeEnum.Cookie,
      },
      {
        kind: "singleton_service_key",
        service: "xiaoen",
        label: "肖恩 AI",
        key: user.apiKey,
        isAuthenticated: true,
        baseUrl: user.apiBaseUrl,
      },
    )
    const pricing = await capabilities.account!.modelCatalog!.enrichPricing!({
      accountRequest: request,
      runtimeKey,
      models: [{ id: "visible" }, { id: "unpriced" }],
    })
    expect(pricing!.data.map((item) => item.model_name)).toEqual([
      "visible",
      "unpriced",
    ])
    expect(pricing!.data[0]).toMatchObject({ quota_type: 1 })
  })
  it("rejects a masked model credential before requesting inference models", async () => {
    fetchApi.mockResolvedValue({
      success: true,
      data: { ...user, apiKey: "sk-***" },
    })
    await expect(
      capabilities.account!.modelPricing!.fetchPricing(request),
    ).rejects.toThrow()
    expect(fetchModels).not.toHaveBeenCalled()
  })
  it("rejects model requests without account context or with another key", async () => {
    await expect(
      capabilities.account!.modelCatalog!.fetchModels({
        ...request,
        auth: { ...request.auth, apiKey: user.apiKey },
      }),
    ).rejects.toThrow()
    await expect(
      capabilities.account!.modelCatalog!.fetchModels(
        { ...request, auth: { ...request.auth, apiKey: "sk-other" } },
        { accountRequest: request },
      ),
    ).rejects.toThrow()
    expect(fetchModels).not.toHaveBeenCalled()
  })
  it("rejects insecure model routes without sending the key", async () => {
    fetchApi.mockResolvedValue({
      success: true,
      data: { ...user, apiBaseUrl: "http://unsafe.example.com" },
    })
    await expect(
      capabilities.account!.modelCatalog!.fetchModels(
        { ...request, auth: { ...request.auth, apiKey: user.apiKey } },
        { accountRequest: request },
      ),
    ).rejects.toThrow()
    expect(fetchModels).not.toHaveBeenCalled()
  })
  it.each([
    { success: true, data: {} },
    { success: true, data: [null] },
    {
      success: true,
      data: [{ id: "bad", content: "x", isActive: true, createdAt: "invalid" }],
    },
  ])("rejects malformed public announcements %j", async (body) => {
    fetchApi.mockResolvedValue(body)
    await expect(
      capabilities.site!.announcements!.fetch(request),
    ).rejects.toThrow()
  })
  it("omits inactive announcements and never passes saved Cookie credentials to public reads", async () => {
    fetchApi.mockResolvedValue({
      success: true,
      data: [
        {
          id: "inactive",
          content: "x",
          isActive: false,
          createdAt: "2026-10-14",
        },
      ],
    })
    expect(await capabilities.site!.announcements!.fetch(request)).toEqual([])
    expect(fetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { authType: AuthTypeEnum.None },
        cookieSession: undefined,
        cookieAuthSessionCookie: undefined,
      }),
      expect.anything(),
      false,
    )
    await expect(
      capabilities.site!.announcements!.fetch({
        ...request,
        baseUrl: "https://go.toter.me",
      }),
    ).rejects.toThrow()
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })
  it("requires Cookie authentication and a saved identity for check-in readiness", () => {
    expect(xiaoenProvider.getReadiness(account)).toEqual({ ready: true })
    expect(
      xiaoenProvider.getReadiness({ ...account, authType: AuthTypeEnum.None }),
    ).toMatchObject({ ready: false })
  })
  it("reads unchecked status from a stored account and tolerates missing context", async () => {
    expect(
      await xiaoenProvider.getStatus!({ account, observedAt: 123 }),
    ).toMatchObject({ outcome: "known", today: "not_checked" })
    expect(await xiaoenProvider.getStatus!({ observedAt: 123 })).toBeUndefined()
    expect(
      await xiaoenProvider.detect!({ request, observedAt: 123 }),
    ).toBeDefined()
  })
  it.each([true, false])(
    "executes check-in once or skips an already checked account (%s)",
    async (checked) => {
      fetchApi.mockImplementation(async (_request, { endpoint }) =>
        endpoint === "/api/auth/me"
          ? { success: true, data: { ...user, hasSignedInToday: checked } }
          : { success: true, data: { bonus: 7 } },
      )
      expect(await xiaoenProvider.checkIn(account, execution)).toMatchObject({
        status: checked ? "already_checked" : "success",
      })
      expect(
        fetchApi.mock.calls.filter(
          ([, options]) => options.endpoint === "/api/user/signin",
        ),
      ).toHaveLength(checked ? 0 : 1)
    },
  )
  it("preserves provider authentication failures without sending a mutation", async () => {
    fetchApi.mockResolvedValue({ success: false, message: "未登录" })
    expect(await xiaoenProvider.checkIn(account, execution)).toMatchObject({
      status: "failed",
    })
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })
  it("accepts a successful check-in without inventing a missing reward message", async () => {
    fetchApi.mockImplementation(async (_request, { endpoint }) =>
      endpoint === "/api/auth/me"
        ? { success: true, data: user }
        : { success: true },
    )
    expect(await performCheckIn(request)).toMatchObject({
      alreadyChecked: false,
      message: undefined,
    })
  })
})
