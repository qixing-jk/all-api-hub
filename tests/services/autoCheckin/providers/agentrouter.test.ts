import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  agentRouterProvider,
  createAgentRouterProvider,
} from "~/services/checkin/autoCheckin/providers/agentrouter"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
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
const account = () =>
  buildSiteAccount({
    site_url: "https://agentrouter.org",
    site_type: SITE_TYPES.NEW_API,
    authType: AuthTypeEnum.AccessToken,
  })
function setup() {
  const authenticate = vi.fn().mockResolvedValue({
    status: "authenticated",
    identity: "1",
    evidence: { checkedIn: true },
  })
  const deps = {
    loginAccount: authenticate,
    fetchStatus: vi.fn().mockResolvedValue({
      success: true,
      data: { system_name: "Agent Router", github_oauth: true },
    }),
    createRequestId: () => "checkin-request",
  }
  return {
    ...deps,
    authenticate,
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
      })
    },
  )
  it("uses the provider selected in check-in settings", async () => {
    const { provider, authenticate } = setup()
    const saved = account()
    saved.checkIn.loginCheckIn = { provider: "linuxdo" }
    await provider.checkIn(saved, context)
    expect(authenticate).toHaveBeenCalledWith({
      account: saved,
      provider: "linuxdo",
      requestId: "checkin-request",
    })
  })
  it.each([false, undefined])(
    "does not report success without confirmed check-in (%s)",
    async (checkedIn) => {
      const { provider, authenticate } = setup()
      authenticate.mockResolvedValue({
        status: "authenticated",
        identity: "1",
        evidence: { checkedIn },
      })
      await expect(provider.checkIn(account(), context)).resolves.toMatchObject(
        { status: "uncertain", retryable: false },
      )
    },
  )
  it.each(["identity_mismatch", "failed", "cancelled"])(
    "does not retry %s",
    async (status) => {
      const { provider, authenticate } = setup()
      authenticate.mockResolvedValue({ status })
      await expect(provider.checkIn(account(), context)).resolves.toMatchObject(
        { status: "failed", retryable: false },
      )
    },
  )
  it("reports required browser interaction", async () => {
    const { provider, authenticate } = setup()
    authenticate.mockResolvedValue({ status: "interaction_required" })
    await expect(provider.checkIn(account(), context)).resolves.toMatchObject({
      status: "failed",
      reasonCode: "authentication_required",
      retryable: false,
    })
  })
  it("discovers the canonical deployment using either supported login provider", async () => {
    const { provider, fetchStatus } = setup()
    fetchStatus.mockResolvedValue({
      success: true,
      data: { system_name: "Agent Router", linuxdo_oauth: true },
    })
    await expect(
      provider.detect!({ account: account(), observedAt: 123 }),
    ).resolves.toMatchObject({ outcome: "matched" })
  })
  it.each([
    "https://other.example",
    "http://agentrouter.org",
    "https://agentrouter.org.attacker.example",
    "https://agentrouter.org:444",
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
      status: "authenticated",
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
