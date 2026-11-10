import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS } from "~/constants/accountLogin"
import { SITE_TYPES } from "~/constants/siteType"
import { createProviderJsonRequests } from "~/services/apiService/common/providerRequest"
import { createAccessToken } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  API_DIRECT_REQUEST_REASONS,
  API_OPERATION_SEMANTICS,
  type ApiTransportRequest,
  type FetchApiOptions,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

const deps = vi.hoisted(() => ({
  data: vi.fn(),
  api: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  login: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: deps.data,
  fetchApi: deps.api,
}))
vi.mock("~/services/accounts/accountStorage/accountConfigStore", () => ({
  accountConfigStore: { read: deps.read, mutateAccount: deps.mutate },
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: deps.login }))

describe("AnyRouter account request recovery", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each(["data", "envelope", "payload"] as const)(
    "%s does not admit a declared GET mutation to credential recovery even with the read hint",
    async (mode) => {
      const error = new ApiError(
        "rejected",
        401,
        "/api/user/token",
        API_ERROR_CODES.HTTP_401,
      )
      const transport = mode === "data" ? deps.data : deps.api
      transport.mockRejectedValue(error)
      deps.read.mockResolvedValue({ accounts: [] })
      const requests = createProviderJsonRequests(() => null)
      await expect(
        requests[mode](
          {
            directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
            baseUrl: "https://anyrouter.top",
            accountId: "saved",
            siteType: SITE_TYPES.ANYROUTER,
            allowAccountCredentialRecovery: true,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: "17",
              cookie: "session=old",
            },
          },
          {
            endpoint: "/api/user/token",
            credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
            operationSemantics: API_OPERATION_SEMANTICS.Mutation,
            options: { method: "GET" },
          },
        ),
      ).rejects.toBe(error)
      expect(transport).toHaveBeenCalledOnce()
      expect(deps.read).not.toHaveBeenCalled()
      expect(deps.login).not.toHaveBeenCalled()
      expect(deps.mutate).not.toHaveBeenCalled()
    },
  )

  it("does not recover or replay credential issuance just because it uses GET", async () => {
    const error = new ApiError(
      "rejected",
      401,
      "/api/user/token",
      API_ERROR_CODES.HTTP_401,
    )
    deps.data.mockRejectedValue(error)
    await expect(
      createAccessToken({
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        baseUrl: "https://anyrouter.top",
        accountId: "saved",
        siteType: SITE_TYPES.ANYROUTER,
        allowAccountCredentialRecovery: true,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "17",
          cookie: "session=old",
        },
      }),
    ).rejects.toBe(error)
    expect(deps.data).toHaveBeenCalledTimes(1)
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it.each([
    { name: "passive discovery", siteType: "anyrouter" as const },
    {
      name: "a mutating request",
      siteType: "anyrouter" as const,
      allowAccountCredentialRecovery: true,
      method: "POST",
    },
    {
      name: "another provider",
      siteType: SITE_TYPES.NEW_API,
      allowAccountCredentialRecovery: true,
    },
  ])("keeps $name outside automatic recovery", async (scenario) => {
    const error = new ApiError(
      "login required",
      401,
      "/api/user/self",
      API_ERROR_CODES.HTTP_401,
    )
    deps.data.mockRejectedValue(error)
    await expect(
      newApiFamilyRequests.data(
        {
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          baseUrl: "https://anyrouter.top",
          accountId: "saved",
          siteType: scenario.siteType,
          allowAccountCredentialRecovery:
            "allowAccountCredentialRecovery" in scenario
              ? scenario.allowAccountCredentialRecovery
              : undefined,
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "17",
            cookie: "session=old",
          },
        },
        {
          endpoint: "/api/user/self",
          credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
          options: { method: "method" in scenario ? scenario.method : "GET" },
        },
      ),
    ).rejects.toBe(error)
    expect(deps.data).toHaveBeenCalledTimes(1)
    expect(deps.read).not.toHaveBeenCalled()
    expect(deps.login).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it.each(
    [
      { name: "New API", requests: newApiFamilyRequests },
      {
        name: "an independent JSON protocol",
        requests: createProviderJsonRequests(() => null),
      },
    ].flatMap((provider) =>
      (["data", "envelope", "payload"] as const).map((mode) => ({
        ...provider,
        mode,
      })),
    ),
  )(
    "$name $mode uses the recovered credential for an admitted account read",
    async ({ requests, mode }) => {
      let account = {
        id: "saved",
        site_type: "anyrouter",
        site_url: "https://anyrouter.top",
        account_info: { id: "17" },
        authType: AuthTypeEnum.Cookie,
        cookieAuth: { sessionCookie: "session=old" },
        login: { methodId: "github", automaticRecovery: true },
      }
      deps.read.mockImplementation(async () => ({ accounts: [account] }))
      deps.mutate.mockImplementation(async (_id, mutation) => {
        const out = mutation(account)
        account = out.nextAccount
        return out.result
      })
      deps.login.mockResolvedValue({
        status: "authenticated",
        identity: "17",
        credential: { cookie: "session=new" },
      })
      const output =
        mode === "envelope" ? { success: true, data: [{ id: 8 }] } : [{ id: 8 }]
      const transport = mode === "data" ? deps.data : deps.api
      let reads = 0
      const respond = async (
        request: ApiTransportRequest,
        options: FetchApiOptions,
      ) => {
        if (options.endpoint === "/api/user/self") {
          expect(request.auth.cookie).toBe("session=new")
          expect(request.auth.accessToken).toBeUndefined()
          expect(request.allowAccountCredentialRecovery).toBeUndefined()
          expect(account.cookieAuth.sessionCookie).toBe("session=old")
          return { id: 17, username: "member" }
        }
        if (++reads === 1)
          throw new ApiError(
            "login required",
            401,
            "/api/token",
            API_ERROR_CODES.HTTP_401,
          )
        expect(request.auth.cookie).toBe("session=new")
        return output
      }
      deps.data.mockImplementation(respond)
      deps.api.mockImplementation(respond)
      expect(
        await requests[mode](
          {
            directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
            baseUrl: account.site_url,
            accountId: account.id,
            siteType: "anyrouter",
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: "17",
              cookie: "session=old",
            },
            allowAccountCredentialRecovery: true,
          },
          {
            endpoint: "/api/token/?p=0",
            credentialRecovery: ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read,
          },
        ),
      ).toEqual(output)
      expect(
        transport.mock.calls.filter(
          ([, options]) => options.endpoint !== "/api/user/self",
        ),
      ).toHaveLength(2)
      expect(
        deps.data.mock.calls.some(
          ([, options]) => options.endpoint === "/api/user/self",
        ),
      ).toBe(true)
      expect(deps.login).toHaveBeenCalledTimes(1)
    },
  )
})
