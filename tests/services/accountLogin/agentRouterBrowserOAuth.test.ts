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

  it.each([
    ["https://github.com/login/oauth/authorize?client_id=client", true],
    ["https://github.com/login", false],
    ["http://github.com/login/oauth/authorize", false],
    ["https://example.invalid/login/oauth/authorize", false],
  ])("checks the GitHub authorization location %s", (url, accepted) => {
    expect(agentRouterGithubOAuthFlow.isAuthorizationUrl(new URL(url))).toBe(
      accepted,
    )
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
  it.each([agentRouterGithubOAuthFlow, agentRouterLinuxDoOAuthFlow])(
    "rejects malformed preparation and callback data for $id",
    (flow) => {
      for (const response of [
        null,
        [],
        { success: false },
        { success: true, clientId: "invalid/id", state: "state" },
        { success: true, clientId: "client", state: " " },
      ]) {
        expect(flow.parsePreparation(response)).toBeNull()
      }
      expect(flow.parseCompletion({ reason: "identity_mismatch" })).toEqual({
        status: "identity_mismatch",
      })
      expect(
        flow.parseCompletion({ success: false, message: "Expired login" }),
      ).toEqual({ status: "invalid", message: "Expired login" })
      expect(flow.parseCompletion({ success: true, userId: " " })).toEqual({
        status: "invalid",
      })
    },
  )

  it.each([
    { clientId: "", state: "state" },
    { clientId: "client", state: "" },
    { clientId: "invalid/id", state: "state" },
  ])("rejects invalid Linux DO authorize parameters %#", (input) =>
    expect(() => buildAgentRouterLinuxDoAuthorizeUrl(input)).toThrow(),
  )

  it("restricts Linux DO authorization and completion to the fixed provider and account", () => {
    expect(
      agentRouterLinuxDoOAuthFlow.isAuthorizationUrl(
        new URL("https://connect.linux.do/oauth2/authorize"),
      ),
    ).toBe(true)
    expect(
      agentRouterLinuxDoOAuthFlow.isAuthorizationUrl(
        new URL("https://other.invalid/oauth2/authorize"),
      ),
    ).toBe(false)
    expect(
      agentRouterLinuxDoOAuthFlow.isCompletionUrl(
        new URL("https://agentrouter.org/console/token"),
        "https://agentrouter.org",
      ),
    ).toBe(true)
    expect(
      agentRouterLinuxDoOAuthFlow.isCompletionUrl(
        new URL("https://other.invalid/console/token"),
        "https://agentrouter.org",
      ),
    ).toBe(false)
  })
})
