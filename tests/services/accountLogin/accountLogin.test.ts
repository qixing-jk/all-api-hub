import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AccountLoginProvider } from "~/constants/accountLogin"
import { loginAccount } from "~/services/accountLogin"

const contexts = vi.hoisted(() => ({ github: vi.fn(), linuxdo: vi.fn() }))
vi.mock("~/services/accountLogin/providers/agentrouter/browserOAuth", () => ({
  agentRouterGithubBrowserOAuthContext: { authenticate: contexts.github },
  agentRouterLinuxDoBrowserOAuthContext: { authenticate: contexts.linuxdo },
}))

const account = {
  site_url: "https://agentrouter.org",
  account_info: { id: "17" },
}

describe("account login", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    for (const authenticate of Object.values(contexts)) {
      authenticate.mockResolvedValue({
        status: "authenticated",
        identity: "17",
        evidence: {},
      })
    }
  })

  it.each(["github", "linuxdo"] as const)(
    "logs in with %s without check-in configuration or evidence",
    async (provider) => {
      const before = structuredClone(account)
      await expect(
        loginAccount({ account, provider, requestId: "login" }),
      ).resolves.toEqual({
        status: "authenticated",
        identity: "17",
        evidence: {},
      })
      expect(contexts[provider]).toHaveBeenCalledWith({
        origin: account.site_url,
        expectedIdentity: "17",
        requestId: "login",
      })
      expect(
        contexts[provider === "github" ? "linuxdo" : "github"],
      ).not.toHaveBeenCalled()
      expect(account).toEqual(before)
    },
  )

  it.each([
    "https://example.com",
    "https://agentrouter.org.evil.test",
    "http://agentrouter.org",
    "https://agentrouter.org:444",
  ])(
    "rejects unsupported deployment %s without opening a login",
    async (site_url) => {
      await expect(
        loginAccount({
          account: { ...account, site_url },
          provider: "github",
          requestId: "login",
        }),
      ).resolves.toEqual({ status: "unsupported" })
      expect(contexts.github).not.toHaveBeenCalled()
      expect(contexts.linuxdo).not.toHaveBeenCalled()
    },
  )

  it("requires the saved account identity", async () => {
    await expect(
      loginAccount({
        account: { ...account, account_info: { id: " " } },
        provider: "github",
        requestId: "login",
      }),
    ).resolves.toEqual({ status: "failed" })
    expect(contexts.github).not.toHaveBeenCalled()
  })

  it("does not fall back from an unrecognized login provider", async () => {
    await expect(
      loginAccount({
        account,
        provider: "invalid" as AccountLoginProvider,
        requestId: "login",
      }),
    ).resolves.toEqual({ status: "unsupported" })
    expect(contexts.github).not.toHaveBeenCalled()
    expect(contexts.linuxdo).not.toHaveBeenCalled()
  })

  it.each(["identity_mismatch", "interaction_required", "cancelled", "failed"])(
    "preserves %s for the caller",
    async (status) => {
      contexts.github.mockResolvedValue({ status })
      await expect(
        loginAccount({ account, provider: "github", requestId: "login" }),
      ).resolves.toEqual({ status })
    },
  )
})
