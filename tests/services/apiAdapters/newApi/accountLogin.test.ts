import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import * as siteDefinitions from "~/services/accountSiteDefinitions"
import { createNewApiAccountLogin } from "~/services/apiAdapters/newApi/accountLogin"
import { agentRouterAccountLogin } from "~/services/apiAdapters/newApi/agentRouterAccountLogin"
import { createNewApiOAuthFlow } from "~/services/apiAdapters/newApi/browserOAuth"

const dependencies = vi.hoisted(() => ({
  status: vi.fn(),
  createBrowser: vi.fn(),
  authenticate: vi.fn(),
}))
vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: dependencies.status },
}))
vi.mock("~/services/browserOAuth/browserOAuth", () => ({
  createBrowserOAuthContext: dependencies.createBrowser,
}))

const account = {
  site_url: "https://gateway.example",
  site_type: SITE_TYPES.NEW_API,
  account_info: { id: "17" },
}
const status = {
  github_oauth: true,
  github_client_id: "github",
  linuxdo_oauth: false,
  linuxdo_client_id: "linuxdo",
  discord_oauth: true,
  discord_client_id: "discord",
  oidc_enabled: true,
  oidc_client_id: "oidc",
  oidc_authorization_endpoint: "https://idp.example/authorize",
}

describe("adapter-owned account login", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    dependencies.createBrowser.mockReturnValue({
      authenticate: dependencies.authenticate,
    })
    dependencies.authenticate.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      evidence: {},
    })
    dependencies.status.mockResolvedValue({ success: true, data: status })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(["Agent Router", "agentrouter", "Agent  Router"])(
    "discovers AgentRouter methods for system name %s",
    async (systemName) => {
      dependencies.status.mockResolvedValue({
        success: true,
        data: { ...status, system_name: systemName },
      })
      expect(
        await agentRouterAccountLogin.discover({
          ...account,
          site_url: "https://agentrouter.org",
        }),
      ).toEqual([{ id: "github", label: "GitHub" }])
    },
  )

  it.each([SITE_TYPES.ONE_HUB, SITE_TYPES.SUB2API, SITE_TYPES.UNKNOWN])(
    "does not infer OAuth adoption for %s from the backend family",
    (siteType) => {
      expect(createNewApiAccountLogin(siteType)).toBeUndefined()
    },
  )

  it("does not reinterpret another protocol's method metadata as New API OAuth", () => {
    const definition = siteDefinitions.getAccountSiteDefinition(
      SITE_TYPES.NEW_API,
    )!
    definition.accountLogin = { methods: ["oidc:company"] }
    vi.spyOn(siteDefinitions, "getAccountSiteDefinition").mockReturnValue(
      definition,
    )
    expect(createNewApiAccountLogin(SITE_TYPES.NEW_API)).toBeUndefined()

    definition.accountLogin.protocols = {
      newApi: { userIdHeader: "New-Api-User", completionPaths: ["/dashboard"] },
    }
    expect(createNewApiAccountLogin(SITE_TYPES.NEW_API)).toBeUndefined()
    expect(dependencies.status).not.toHaveBeenCalled()
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it.each([
    [SITE_TYPES.NEW_API, ["github", "discord", "oidc"]],
    [SITE_TYPES.VELOERA, ["github", "oidc"]],
    [SITE_TYPES.V_API, ["github"]],
  ] as const)(
    "discovers only implemented and enabled methods for %s without starting login",
    async (site_type, providers) => {
      const capability = createNewApiAccountLogin(site_type)!
      const methods = await capability.discover({ ...account, site_type })
      expect(methods.map((method) => method.id)).toEqual(providers)
      expect(dependencies.status).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ baseUrl: account.site_url }),
        { endpoint: "/api/status" },
      )
      expect(dependencies.createBrowser).not.toHaveBeenCalled()
    },
  )

  it("uses login policy and the declared login route independently of detection hints", async () => {
    const definition = siteDefinitions.getAccountSiteDefinition(
      SITE_TYPES.NEW_API,
    )!
    definition.accountLogin = {
      methods: ["linuxdo"],
      protocols: {
        newApi: { userIdHeader: "Runtime-User", completionPaths: ["/ready"] },
      },
    }
    definition.onboarding!.routes.loginPath = "/sign-in"
    definition.onboarding!.detection!.compatUserIdHeaderNames = [
      "Detection-User",
    ]
    vi.spyOn(siteDefinitions, "getAccountSiteDefinition").mockReturnValue(
      definition,
    )
    const capability = createNewApiAccountLogin(SITE_TYPES.NEW_API)!

    await expect(
      capability.login({ account, methodId: "github", requestId: "disabled" }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
    await capability.login({
      account,
      methodId: "linuxdo",
      requestId: "configured",
    })

    const flow = dependencies.createBrowser.mock.calls[0]![0]
    expect(flow).toMatchObject({
      loginPath: "/sign-in",
      prepareDetails: {
        loginProvider: "linuxdo",
        userIdHeader: "Runtime-User",
        completionPaths: ["/ready"],
      },
    })
    expect(
      flow.isCompletionUrl(
        new URL("https://gateway.example/ready"),
        account.site_url,
      ),
    ).toBe(true)
    expect(
      flow.isCompletionUrl(
        new URL("https://gateway.example/dashboard"),
        account.site_url,
      ),
    ).toBe(false)
    expect(
      flow.isCompletionUrl(
        new URL("https://other.example/ready"),
        account.site_url,
      ),
    ).toBe(false)
  })

  it.each(["unsupported", "uncertain"] as const)(
    "preserves the protocol preparation outcome %s",
    async (status) => {
      await createNewApiAccountLogin(SITE_TYPES.NEW_API)!.login({
        account,
        methodId: "github",
        requestId: "preparation-outcome",
      })
      const flow = dependencies.createBrowser.mock.calls[0]![0]

      expect(flow.parsePreparation({ success: false, reason: status })).toEqual(
        {
          status,
        },
      )
    },
  )

  it.each([
    [SITE_TYPES.NEW_API, "/dashboard", "/app/tokens"],
    [SITE_TYPES.VELOERA, "/app/tokens", "/dashboard"],
  ] as const)(
    "keeps the verified %s completion paths distinct from other upstreams",
    async (site_type, accepted, rejected) => {
      await createNewApiAccountLogin(site_type)!.login({
        account: { ...account, site_type },
        methodId: "github",
        requestId: "callback",
      })
      const flow = dependencies.createBrowser.mock.calls[0]![0]
      expect(
        flow.isCompletionUrl(
          new URL(accepted, account.site_url),
          account.site_url,
        ),
      ).toBe(true)
      expect(
        flow.isCompletionUrl(
          new URL(rejected, account.site_url),
          account.site_url,
        ),
      ).toBe(false)
    },
  )

  it("rejects unsupported targets before discovery or browser execution", async () => {
    const capability = createNewApiAccountLogin(SITE_TYPES.NEW_API)!
    const wrongType = { ...account, site_type: SITE_TYPES.VELOERA }
    await expect(capability.discover(wrongType)).resolves.toEqual([])
    await expect(
      capability.login({
        account: wrongType,
        methodId: "github",
        requestId: "wrong",
      }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(dependencies.status).not.toHaveBeenCalled()
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it("rejects malformed account URLs and unrelated AgentRouter hosts", async () => {
    const capability = createNewApiAccountLogin(SITE_TYPES.NEW_API)!
    expect(capability.supports({ ...account, site_url: "not a URL" })).toBe(
      false,
    )
    expect(
      await agentRouterAccountLogin.login({
        account: { ...account, site_url: "https://other.example" },
        methodId: "github",
        requestId: "wrong-host",
      }),
    ).toEqual({ status: "unsupported" })
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it("checks the canonical deployment's system name during read-only discovery", async () => {
    const target = { ...account, site_url: "https://agentrouter.org" }
    await expect(agentRouterAccountLogin.discover(target)).resolves.toEqual([])
    dependencies.status.mockResolvedValue({
      success: true,
      data: { ...status, system_name: "Agent Router" },
    })
    await expect(agentRouterAccountLogin.discover(target)).resolves.toEqual([
      { id: "github", label: "GitHub" },
    ])
    expect(dependencies.createBrowser).not.toHaveBeenCalled()
  })

  it("fails AgentRouter discovery when public status rejects its envelope", async () => {
    dependencies.status.mockResolvedValue({ success: false })
    await expect(
      agentRouterAccountLogin.discover({
        ...account,
        site_url: "https://agentrouter.org",
      }),
    ).rejects.toThrow("Login methods could not be discovered")
  })

  it("accepts only the selected provider's authorize route and matching LinuxDO consent", () => {
    const flow = createNewApiOAuthFlow({
      provider: "linuxdo",
      loginPath: "/login",
      userIdHeader: "New-Api-User",
      completionPaths: ["/dashboard"],
    })
    const requested = new URL(
      "https://connect.linux.do/oauth2/authorize?client_id=site&state=nonce",
    )
    expect(flow.isAuthorizationUrl(requested)).toBe(true)
    expect(
      flow.authorizationInteraction?.isInteractionUrl(requested, requested),
    ).toBe(true)
    for (const url of [
      "https://connect.linux.do/oauth2/authorize?client_id=site&state=other",
      "https://connect.linux.do/oauth2/authorize?client_id=other&state=nonce",
      "https://evil.example/oauth2/authorize?client_id=site&state=nonce",
    ]) {
      expect(
        flow.authorizationInteraction?.isInteractionUrl(
          new URL(url),
          requested,
        ),
      ).toBe(false)
    }
    expect(
      flow.isAuthorizationUrl(
        new URL(
          "http://connect.linux.do/oauth2/authorize?client_id=site&state=nonce",
        ),
      ),
    ).toBe(false)
  })

  it("distinguishes provider URLs and invalid callback responses", () => {
    const flow = createNewApiOAuthFlow({
      provider: "discord",
      loginPath: "/login",
      userIdHeader: "New-Api-User",
      completionPaths: ["/dashboard"],
    })
    expect(
      flow.isAuthorizationUrl(
        new URL(
          "https://discord.com/oauth2/authorize?client_id=site&state=nonce",
        ),
      ),
    ).toBe(true)
    expect(
      flow.isAuthorizationUrl(
        new URL(
          "https://github.com/login/oauth/authorize?client_id=site&state=nonce",
        ),
      ),
    ).toBe(false)
    expect(flow.parseCompletion({ reason: "identity_mismatch" })).toEqual({
      status: "identity_mismatch",
    })
    expect(
      flow.parseCompletion({ success: false, message: "expired" }),
    ).toEqual({ status: "invalid", message: "expired" })
    expect(
      flow.parseCompletion({ success: true, userId: " 17 ", checkedIn: true }),
    ).toEqual({
      status: "verified",
      identity: "17",
      evidence: { checkedIn: true },
    })
    expect(flow.parseCompletion(null)).toEqual({ status: "invalid" })
    expect(
      flow.parsePreparation({
        success: true,
        authorizationUrl: "https://idp.example/start",
      }),
    ).toEqual({ authorizationUrl: "https://idp.example/start" })
    expect(flow.parsePreparation({ success: true })).toBeNull()
    const oidc = createNewApiOAuthFlow({
      provider: "oidc",
      loginPath: "/login",
      userIdHeader: "New-Api-User",
      completionPaths: ["/dashboard"],
    })
    expect(
      oidc.isAuthorizationUrl(
        new URL("https://idp.example/start?client_id=site&state=nonce"),
      ),
    ).toBe(true)
  })
})
