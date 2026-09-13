import { describe, expect, it } from "vitest"

import {
  agentRouterGithubOAuthFlow,
  agentRouterLinuxDoOAuthFlow,
  buildAgentRouterGithubAuthorizeUrl,
  buildAgentRouterLinuxDoAuthorizeUrl,
} from "~/services/accountLogin/providers/agentrouter/browserOAuth"

describe("AgentRouter GitHub OAuth adapter", () => {
  it.each([undefined, false])(
    "accepts a verified login independently of check-in evidence (%s)",
    (checkedIn) => {
      expect(
        agentRouterGithubOAuthFlow.parseCompletion({
          success: true,
          userId: "17",
          checkedIn,
        }),
      ).toEqual({
        status: "verified",
        identity: "17",
        evidence: checkedIn === undefined ? {} : { checkedIn },
      })
    },
  )
  it("builds the verified fixed-provider authorize URL", () => {
    expect(
      buildAgentRouterGithubAuthorizeUrl({
        clientId: "client_123",
        state: "signed state/+",
      }),
    ).toBe(
      "https://github.com/login/oauth/authorize?client_id=client_123&state=signed+state%2F%2B&scope=user%3Aemail",
    )
  })

  it.each([
    { clientId: "", state: "state" },
    { clientId: "client", state: "" },
    { clientId: "https://example.invalid", state: "state" },
  ])("rejects invalid OAuth inputs %#", (input) => {
    expect(() => buildAgentRouterGithubAuthorizeUrl(input)).toThrow()
  })

  it("maps AgentRouter content responses into generic OAuth contracts", () => {
    expect(
      agentRouterGithubOAuthFlow.parsePreparation({
        success: true,
        clientId: "client_123",
        state: "signed-state",
      }),
    ).toEqual({
      authorizationUrl:
        "https://github.com/login/oauth/authorize?client_id=client_123&state=signed-state&scope=user%3Aemail",
    })
    expect(
      agentRouterGithubOAuthFlow.parseCompletion({
        success: true,
        userId: "user-1",
        checkedIn: true,
      }),
    ).toEqual({
      status: "verified",
      identity: "user-1",
      evidence: { checkedIn: true },
    })
  })

  it("rejects other authorization and callback origins", () => {
    expect(
      agentRouterGithubOAuthFlow.isAuthorizationUrl(
        new URL("https://example.invalid/login/oauth/authorize"),
      ),
    ).toBe(false)
    expect(
      agentRouterGithubOAuthFlow.isCompletionUrl(
        new URL("https://example.invalid/console/token"),
        "https://agentrouter.org",
      ),
    ).toBe(false)
  })

  it("builds Linux DO authorization with the signed login state", () => {
    expect(
      buildAgentRouterLinuxDoAuthorizeUrl({
        clientId: "linuxdo_client",
        state: "signed state/+",
      }),
    ).toBe(
      "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo_client&state=signed+state%2F%2B",
    )
    expect(
      agentRouterLinuxDoOAuthFlow.parsePreparation({
        success: true,
        clientId: "linuxdo_client",
        state: "signed-state",
      }),
    ).toEqual({
      authorizationUrl:
        "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo_client&state=signed-state",
    })
  })

  it("matches Linux DO interaction only for this exact client and state", () => {
    const requested = new URL(
      "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo_client&state=signed-state",
    )
    expect(
      agentRouterLinuxDoOAuthFlow.authorizationInteraction.isInteractionUrl(
        new URL(requested),
        requested,
      ),
    ).toBe(true)
    expect(
      agentRouterLinuxDoOAuthFlow.authorizationInteraction.isInteractionUrl(
        new URL(
          "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=linuxdo_client&state=other-state",
        ),
        requested,
      ),
    ).toBe(false)
  })
})
