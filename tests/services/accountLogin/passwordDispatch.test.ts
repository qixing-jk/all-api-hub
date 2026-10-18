import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { SITE_TYPES } from "~/constants/siteType"
import {
  discoverAccountLoginMethods,
  loginAccount,
} from "~/services/accountLogin"

const deps = vi.hoisted(() => ({
  passwordContext: vi.fn(),
  oauthContext: vi.fn(),
  authenticate: vi.fn(),
  status: vi.fn(),
  settings: vi.fn(),
}))
vi.mock("~/services/accountLogin/browserPassword", () => ({
  createBrowserPasswordContext: deps.passwordContext,
}))
vi.mock("~/services/browserOAuth/browserOAuth", () => ({
  createBrowserOAuthContext: deps.oauthContext,
}))
vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: deps.status },
}))
vi.mock("~/services/apiService/sub2api/account/publicSettings", () => ({
  fetchSub2ApiPublicSettings: deps.settings,
}))

describe("password login public dispatch", () => {
  it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API])(
    "never revives legacy secrets after canonical login was cleared (%s)",
    async (site_type) => {
      const account = {
        site_type,
        site_url: "https://gateway.example",
        account_info: { id: "17" },
        login: undefined,
        passwordAuth: { username: "alice", password: "obsolete-secret" },
      }
      await expect(
        loginAccount({
          account,
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          requestId: "cleared",
        }),
      ).resolves.toEqual({ status: "failed" })
      expect(deps.passwordContext).not.toHaveBeenCalled()
    },
  )
  beforeEach(() => {
    vi.resetAllMocks()
    deps.passwordContext.mockReturnValue({ authenticate: deps.authenticate })
    deps.authenticate.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      evidence: {},
    })
    deps.status.mockResolvedValue({
      success: true,
      data: { system_name: "Agent Router" },
    })
    deps.settings.mockResolvedValue({})
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API, "agentrouter"] as const)(
    "discovers and executes the explicit %s password method with saved credentials",
    async (type) => {
      const account = {
        site_url:
          type === "agentrouter"
            ? "https://agentrouter.org"
            : "https://gateway.example",
        site_type: type === "agentrouter" ? SITE_TYPES.NEW_API : type,
        account_info: { id: "17" },
        login: {
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          credentials: { username: "alice", password: "secret" },
        },
      }
      expect(await discoverAccountLoginMethods(account)).toContainEqual({
        id: "password",
        label: "Password",
      })
      await expect(
        loginAccount({
          account,
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          requestId: "p1",
        }),
      ).resolves.toMatchObject({ status: "authenticated", identity: "17" })
      expect(deps.passwordContext).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: { username: "alice", password: "secret" },
        }),
      )
      expect(deps.oauthContext).not.toHaveBeenCalled()
    },
  )

  it("does not open a browser or choose OAuth when password credentials are missing", async () => {
    expect(
      await loginAccount({
        account: {
          site_url: "https://gateway.example",
          site_type: SITE_TYPES.NEW_API,
          account_info: { id: "17" },
        },
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        requestId: "p1",
      }),
    ).toEqual({ status: "failed" })
    expect(deps.passwordContext).not.toHaveBeenCalled()
    expect(deps.oauthContext).not.toHaveBeenCalled()
  })
})
