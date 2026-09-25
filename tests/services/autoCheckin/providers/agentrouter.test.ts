import { describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_LOGIN_PROVIDERS,
  type AccountLoginProvider,
} from "~/constants/accountLogin"
import { BROWSER_OAUTH_STATUS } from "~/constants/browserOAuth"
import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  agentRouterProvider,
  createAgentRouterProvider,
} from "~/services/checkin/autoCheckin/providers/agentrouter"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/resultPolicy"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const liveDependencies = vi.hoisted(() => ({ login: vi.fn(), status: vi.fn() }))
vi.mock("~/services/accountLogin", () => ({
  loginAccount: liveDependencies.login,
}))
vi.mock("~/services/apiService/agentrouter/status", () => ({
  fetchAgentRouterPublicStatus: liveDependencies.status,
}))

const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}
const account = (
  provider: AccountLoginProvider | null = ACCOUNT_LOGIN_PROVIDERS.Github,
) =>
  buildSiteAccount({
    site_url: "https://agentrouter.org",
    site_type: SITE_TYPES.NEW_API,
    authType: AuthTypeEnum.AccessToken,
    checkIn: buildCheckInConfig(provider ? { loginCheckIn: { provider } } : {}),
  })
function setup() {
  const authenticate = vi.fn().mockResolvedValue({
    status: BROWSER_OAUTH_STATUS.Authenticated,
    identity: "1",
    evidence: { checkedIn: true },
  })
  const recordLoginProviderEvidence = vi.fn().mockResolvedValue(undefined)
  const deps = {
    loginAccount: authenticate,
    fetchStatus: vi.fn().mockResolvedValue({
      success: true,
      data: { system_name: "Agent Router", github_oauth: true },
    }),
    createRequestId: () => "checkin-request",
    recordLoginProviderEvidence,
  }
  return {
    ...deps,
    authenticate,
    recordLoginProviderEvidence,
    provider: createAgentRouterProvider(deps),
  }
}

describe("AgentRouter login check-in", () => {
  it.each([SITE_TYPES.NEW_API, SITE_TYPES.ONE_API, SITE_TYPES.UNKNOWN])(
    "works on %s accounts without changing authentication",
    async (siteType) => {
      const { provider, authenticate } = setup()
      const saved = account()
      saved.site_type = siteType
      const before = structuredClone(saved)
      await expect(provider.checkIn(saved, context)).resolves.toMatchObject({
        status: "success",
      })
      expect(saved).toEqual(before)
      expect(authenticate).toHaveBeenCalledWith({
        account: saved,
        provider: "github",
        requestId: "checkin-request",
        attended: false,
      })
    },
  )
  it("uses the provider selected in check-in settings", async () => {
    const { provider, authenticate } = setup()
    const saved = account(ACCOUNT_LOGIN_PROVIDERS.LinuxDo)
    await provider.checkIn(saved, context)
    expect(authenticate).toHaveBeenCalledWith({
      account: saved,
      provider: "linuxdo",
      requestId: "checkin-request",
      attended: false,
    })
  })

  it.each([
    TEMP_WINDOW_REQUEST_SOURCES.Popup,
    TEMP_WINDOW_REQUEST_SOURCES.Options,
    TEMP_WINDOW_REQUEST_SOURCES.Sidepanel,
  ])("waits for a person when the run came from %s", async (source) => {
    const { provider, authenticate } = setup()
    await provider.checkIn(account(), {
      ...context,
      tempWindowRequestSource: source,
    })
    expect(authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ attended: true }),
    )
  })
  it("records the provider identity a successful login proved", async () => {
    const { provider, recordLoginProviderEvidence } = setup()
    await provider.checkIn(account(ACCOUNT_LOGIN_PROVIDERS.LinuxDo), context)

    expect(recordLoginProviderEvidence).toHaveBeenCalledWith({
      accountId: "account-1",
      provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
      outcome: "success",
    })
  })

  it("records a proven identity mismatch as a rejection", async () => {
    const { provider, authenticate, recordLoginProviderEvidence } = setup()
    authenticate.mockResolvedValue({
      status: BROWSER_OAUTH_STATUS.IdentityMismatch,
    })

    await provider.checkIn(account(), context)

    expect(recordLoginProviderEvidence).toHaveBeenCalledWith({
      accountId: "account-1",
      provider: ACCOUNT_LOGIN_PROVIDERS.Github,
      outcome: "identity_mismatch",
    })
  })

  it.each([
    BROWSER_OAUTH_STATUS.Cancelled,
    BROWSER_OAUTH_STATUS.Failed,
    BROWSER_OAUTH_STATUS.InteractionRequired,
    BROWSER_OAUTH_STATUS.SessionBusy,
  ])("records no evidence for an inconclusive %s login", async (status) => {
    const { provider, authenticate, recordLoginProviderEvidence } = setup()
    authenticate.mockResolvedValue({ status })

    await provider.checkIn(account(), context)

    expect(recordLoginProviderEvidence).not.toHaveBeenCalled()
  })

  it("records evidence even when the check-in benefit was not granted", async () => {
    const { provider, authenticate, recordLoginProviderEvidence } = setup()
    authenticate.mockResolvedValue({
      status: BROWSER_OAUTH_STATUS.Authenticated,
      identity: "1",
      evidence: { checkedIn: false },
    })

    await expect(provider.checkIn(account(), context)).resolves.toMatchObject({
      status: "uncertain",
    })
    expect(recordLoginProviderEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "success" }),
    )
  })

  it("does not fall back to GitHub when no provider is selected", async () => {
    const { provider, authenticate } = setup()
    await expect(
      provider.checkIn(account(null), context),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "login_provider_required",
      messageKey: "autoCheckin:providerFallback.loginProviderRequired",
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it("keeps a missing login method out of the automatic retry queue", async () => {
    const { provider } = setup()

    const result = await provider.checkIn(account(null), context)

    // No run can succeed until the user picks a login method, so the retry
    // queue has to treat this as a dead end.
    expect(
      canAutomaticallyRetryCheckinResult(
        result,
        AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn,
      ),
    ).toBe(false)
  })

  it("rejects an unknown persisted provider without a login attempt", async () => {
    const { provider, authenticate } = setup()
    const saved = account()
    saved.checkIn.loginCheckIn = { provider: "untrusted" as never }
    await expect(provider.checkIn(saved, context)).resolves.toMatchObject({
      status: "failed",
      messageKey: "autoCheckin:providerFallback.loginProviderRequired",
    })
    expect(authenticate).not.toHaveBeenCalled()
  })
  it.each([false, undefined])(
    "does not report success without confirmed check-in (%s)",
    async (checkedIn) => {
      const { provider, authenticate } = setup()
      authenticate.mockResolvedValue({
        status: BROWSER_OAUTH_STATUS.Authenticated,
        identity: "1",
        evidence: { checkedIn },
      })
      await expect(provider.checkIn(account(), context)).resolves.toMatchObject(
        { status: "uncertain", reasonCode: "checkin_unconfirmed" },
      )
    },
  )
  it.each([
    BROWSER_OAUTH_STATUS.IdentityMismatch,
    BROWSER_OAUTH_STATUS.Failed,
    BROWSER_OAUTH_STATUS.Cancelled,
  ])("reports %s as an upstream failure", async (status) => {
    const { provider, authenticate } = setup()
    authenticate.mockResolvedValue({ status })
    await expect(provider.checkIn(account(), context)).resolves.toMatchObject({
      status: "failed",
      reasonCode: "upstream_error",
    })
  })
  it("reports required browser interaction", async () => {
    const { provider, authenticate } = setup()
    authenticate.mockResolvedValue({
      status: BROWSER_OAUTH_STATUS.InteractionRequired,
    })
    await expect(provider.checkIn(account(), context)).resolves.toMatchObject({
      status: "failed",
      reasonCode: "authentication_required",
    })
  })

  it("reports a session busy with another login without claiming it expired", async () => {
    const { provider, authenticate } = setup()
    authenticate.mockResolvedValue({
      status: BROWSER_OAUTH_STATUS.SessionBusy,
    })
    const result = await provider.checkIn(account(), context)
    expect(result).toMatchObject({
      status: "failed",
      reasonCode: "session_busy",
      messageKey: "autoCheckin:providerFallback.sessionBusy",
    })
  })

  it.each(["Agent Router", "agent router", "AgentRouter", "Agent Router Pro"])(
    "discovers the deployment with system_name %s without requiring OAuth flags",
    async (system_name) => {
      const { provider, fetchStatus } = setup()
      fetchStatus.mockResolvedValue({
        success: true,
        data: { system_name },
      })
      await expect(
        provider.detect!({ account: account(), observedAt: 123 }),
      ).resolves.toMatchObject({ outcome: "matched" })
    },
  )

  it.each(["New API", "One API", "Router", "Agent", "", undefined])(
    "rejects discovery when system_name is %s",
    async (system_name) => {
      const { provider, fetchStatus } = setup()
      fetchStatus.mockResolvedValue({
        success: true,
        data: { system_name },
      })
      await expect(
        provider.detect!({ account: account(), observedAt: 123 }),
      ).resolves.toMatchObject({ outcome: "unsupported" })
    },
  )

  it("rejects discovery when status request fails", async () => {
    const { provider, fetchStatus } = setup()
    fetchStatus.mockResolvedValue({
      success: false,
      data: { system_name: "Agent Router" },
    })
    await expect(
      provider.detect!({ account: account(), observedAt: 123 }),
    ).resolves.toMatchObject({ outcome: "unsupported" })
  })

  it.each([
    "https://other.example",
    "http://agentrouter.org",
    "https://agentrouter.org.attacker.example",
    "https://agentrouter.org:444",
    "http://ps.air-outer.com",
    "https://ps.air-outer.com.attacker.example",
    "https://ps.air-outer.com:444",
  ])("rejects %s before requests or login", async (site_url) => {
    const { provider, authenticate, fetchStatus } = setup()
    const saved = { ...account(), site_url }
    await expect(
      provider.detect!({ account: saved, observedAt: 123 }),
    ).resolves.toMatchObject({ outcome: "unsupported" })
    await expect(provider.checkIn(saved, context)).resolves.toMatchObject({
      status: "failed",
    })
    expect(authenticate).not.toHaveBeenCalled()
    expect(fetchStatus).not.toHaveBeenCalled()
  })
  it("accepts known mirror ps.air-outer.com for detection and check-in", async () => {
    const { provider, authenticate, fetchStatus } = setup()
    const saved = { ...account(), site_url: "https://ps.air-outer.com" }
    await expect(
      provider.detect!({ account: saved, observedAt: 123 }),
    ).resolves.toMatchObject({ outcome: "matched" })
    await expect(provider.checkIn(saved, context)).resolves.toMatchObject({
      status: "success",
    })
    expect(fetchStatus).toHaveBeenCalled()
    expect(authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: saved,
      }),
    )
  })
  it("requires an account identity", async () => {
    const { provider, authenticate } = setup()
    const saved = account()
    saved.account_info.id = ""
    expect(provider.getReadiness(saved)).toMatchObject({ ready: false })
    await expect(provider.checkIn(saved, context)).resolves.toMatchObject({
      status: "failed",
    })
    expect(authenticate).not.toHaveBeenCalled()
  })
  it("wires public discovery and login without forwarding saved credentials", async () => {
    const saved = account()
    liveDependencies.status.mockResolvedValue({
      success: true,
      data: { system_name: "Agent Router", github_oauth: true },
    })
    expect(agentRouterProvider.getReadiness(saved)).toEqual({ ready: true })
    await expect(
      agentRouterProvider.detect!({ account: saved, observedAt: 123 }),
    ).resolves.toMatchObject({ outcome: "matched" })
    expect(liveDependencies.status).toHaveBeenCalledWith(
      { baseUrl: saved.site_url, auth: { authType: AuthTypeEnum.None } },
      undefined,
    )
    liveDependencies.login.mockResolvedValue({
      status: BROWSER_OAUTH_STATUS.Authenticated,
      identity: saved.account_info.id,
      evidence: { checkedIn: true },
    })
    await expect(
      agentRouterProvider.checkIn(saved, context),
    ).resolves.toMatchObject({ status: "success" })
    expect(liveDependencies.login).toHaveBeenCalledWith(
      expect.objectContaining({
        account: saved,
        provider: "github",
        requestId: expect.any(String),
      }),
    )
  })
})
