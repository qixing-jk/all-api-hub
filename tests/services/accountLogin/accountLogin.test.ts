import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { loginAccount } from "~/services/accountLogin"

const browserOAuth = vi.hoisted(() => ({
  create: vi.fn(),
  authenticate: vi.fn(),
}))
vi.mock("~/services/browserOAuth/browserOAuth", () => ({
  createBrowserOAuthContext: browserOAuth.create,
}))

const account = {
  site_url: "https://agentrouter.org",
  account_info: { id: "17" },
}

describe("account login", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    browserOAuth.create.mockReturnValue({
      authenticate: browserOAuth.authenticate,
    })
    browserOAuth.authenticate.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      evidence: {},
    })
  })

  it.each(["github", "linuxdo"] as const)(
    "logs in with %s without check-in configuration or evidence",
    async (provider) => {
      const before = structuredClone(account)
      await expect(
        loginAccount({ account, methodId: provider, requestId: "login" }),
      ).resolves.toEqual({
        status: "authenticated",
        identity: "17",
        evidence: {},
      })
      expect(browserOAuth.authenticate).toHaveBeenCalledWith({
        origin: account.site_url,
        expectedIdentity: "17",
        requestId: "login",
      })
      expect(browserOAuth.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          id: `agentrouter-${provider}`,
          prepareAction: RuntimeActionIds.ContentPrepareAgentRouterOAuth,
          prepareDetails: { loginProvider: provider },
        }),
      )
      expect(account).toEqual(before)
    },
  )

  it.each(["github", "linuxdo"] as const)(
    "logs in to mirror ps.air-outer.com with %s",
    async (provider) => {
      const mirrorAccount = {
        ...account,
        site_url: "https://ps.air-outer.com",
      }
      await expect(
        loginAccount({
          account: mirrorAccount,
          methodId: provider,
          requestId: "login",
        }),
      ).resolves.toEqual({
        status: "authenticated",
        identity: "17",
        evidence: {},
      })
      expect(browserOAuth.authenticate).toHaveBeenCalledWith({
        origin: "https://ps.air-outer.com",
        expectedIdentity: "17",
        requestId: "login",
      })
    },
  )

  it("forwards a run that nobody can complete to the browser flow", async () => {
    await loginAccount({
      account,
      methodId: "github",
      requestId: "login",
      attended: false,
    })
    expect(browserOAuth.authenticate).toHaveBeenCalledWith({
      origin: account.site_url,
      expectedIdentity: "17",
      requestId: "login",
      attended: false,
    })
  })

  it.each([
    "https://example.com",
    "not a URL",
    "https://agentrouter.org.evil.test",
    "http://agentrouter.org",
    "https://agentrouter.org:444",
    "https://ps.air-outer.com.evil.test",
    "http://ps.air-outer.com",
    "https://ps.air-outer.com:444",
    "https://user:secret@agentrouter.org",
  ])(
    "rejects unsupported deployment %s without opening a login",
    async (site_url) => {
      await expect(
        loginAccount({
          account: { ...account, site_url },
          methodId: "github",
          requestId: "login",
        }),
      ).resolves.toEqual({ status: "unsupported" })
      expect(browserOAuth.create).not.toHaveBeenCalled()
    },
  )

  it("requires the saved account identity", async () => {
    await expect(
      loginAccount({
        account: { ...account, account_info: { id: " " } },
        methodId: "github",
        requestId: "login",
      }),
    ).resolves.toEqual({ status: "failed" })
    expect(browserOAuth.create).not.toHaveBeenCalled()
  })

  it("does not fall back from an unrecognized login provider", async () => {
    await expect(
      loginAccount({
        account,
        methodId: "invalid",
        requestId: "login",
      }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(browserOAuth.create).not.toHaveBeenCalled()
  })

  it.each([
    [SITE_TYPES.NEW_API, "discord", "New-Api-User"],
    [SITE_TYPES.VELOERA, "oidc", "Veloera-User"],
    [SITE_TYPES.RIX_API, "github", "Rix-Api-User"],
    [SITE_TYPES.NEO_API, "linuxdo", "neo-api-user"],
  ] as const)(
    "dispatches %s login through the registered protocol with %s",
    async (site_type, provider, userIdHeader) => {
      const target = {
        ...account,
        site_url: "https://gateway.example/console",
        site_type,
      }
      const before = structuredClone(target)
      await expect(
        loginAccount({
          account: target,
          methodId: provider,
          requestId: "registered",
        }),
      ).resolves.toEqual({
        status: "authenticated",
        identity: "17",
        evidence: {},
      })
      expect(browserOAuth.authenticate).toHaveBeenCalledWith({
        origin: "https://gateway.example",
        expectedIdentity: "17",
        requestId: "registered",
      })
      expect(browserOAuth.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          prepareAction: RuntimeActionIds.ContentPrepareNewApiOAuth,
          prepareDetails: expect.objectContaining({ loginProvider: provider }),
        }),
      )
      expect(
        browserOAuth.create.mock.calls[0]![0].prepareDetails!.userIdHeader!.toString().toLowerCase(),
      ).toBe(userIdHeader.toLowerCase())
      expect(target).toEqual(before)
    },
  )

  it.each([SITE_TYPES.ONE_HUB, SITE_TYPES.SUB2API, SITE_TYPES.VELOERA])(
    "does not open a browser for unimplemented %s Discord login",
    async (site_type) => {
      await expect(
        loginAccount({
          account: {
            ...account,
            site_url: "https://gateway.example",
            site_type,
          },
          methodId: "discord",
          requestId: "unsupported",
        }),
      ).resolves.toEqual({ status: "unsupported" })
      expect(browserOAuth.create).not.toHaveBeenCalled()
    },
  )

  it("keeps canonical AgentRouter on its own protocol even when saved as New API", async () => {
    await expect(
      loginAccount({
        account: { ...account, site_type: SITE_TYPES.NEW_API },
        methodId: "discord",
        requestId: "agentrouter",
      }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(browserOAuth.create).not.toHaveBeenCalled()
  })

  it("dispatches canonical AgentRouter through its adapter with a saved site type", async () => {
    await loginAccount({
      account: { ...account, site_type: SITE_TYPES.NEW_API },
      methodId: "github",
      requestId: "agentrouter",
    })
    expect(browserOAuth.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agentrouter-github" }),
    )
  })

  it.each(["http://agentrouter.org", "https://agentrouter.org:444"])(
    "does not fall through to the generic protocol for invalid AgentRouter origin %s",
    async (site_url) => {
      await expect(
        loginAccount({
          account: { ...account, site_url, site_type: SITE_TYPES.NEW_API },
          methodId: "github",
          requestId: "agentrouter",
        }),
      ).resolves.toEqual({ status: "unsupported" })
      expect(browserOAuth.create).not.toHaveBeenCalled()
    },
  )

  it.each(["identity_mismatch", "interaction_required", "cancelled", "failed"])(
    "preserves %s for the caller",
    async (status) => {
      browserOAuth.authenticate.mockResolvedValue({ status })
      await expect(
        loginAccount({ account, methodId: "github", requestId: "login" }),
      ).resolves.toEqual({ status })
    },
  )
})
