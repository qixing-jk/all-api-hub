import { describe, expect, it } from "vitest"

import {
  buildTokenVerificationAuthorizationUrl,
  readTokenOAuthCallback,
} from "~/services/apiService/newApiFamily/accessTokens/oauth"

describe("management-token OAuth verification", () => {
  const origin = "https://console.example"
  const state = "nonce"

  it("honors the site's HTTPS authorization URL with the matching state", () => {
    const authorize =
      "https://provider.example/authorize?state=nonce&scope=openid"
    expect(
      buildTokenVerificationAuthorizationUrl(
        "some-provider",
        state,
        origin,
        {},
        authorize,
      ),
    ).toBe(authorize)
  })

  it.each([
    "http://provider.example/authorize?state=nonce",
    "https://account@provider.example/authorize?state=nonce",
    "https://account:password@provider.example/authorize?state=nonce",
    "https://provider.example/authorize?state=other",
  ])("rejects an unsafe or mismatched explicit URL (%s)", (authorize) => {
    expect(() =>
      buildTokenVerificationAuthorizationUrl(
        "provider",
        state,
        origin,
        {},
        authorize,
      ),
    ).toThrow("OAUTH_URL_INVALID")
  })

  it.each(["", "nested/provider", 8])(
    "requires a provider slug for an authorization path (%s)",
    (provider) => {
      expect(() =>
        buildTokenVerificationAuthorizationUrl(
          provider as string,
          state,
          origin,
          {},
        ),
      ).toThrow("OAUTH_PROVIDER_INVALID")
    },
  )

  it.each([
    ["missing provider", [], "OAUTH_PROVIDER_UNAVAILABLE"],
    [
      "missing client ID",
      [{ slug: "company", authorization_endpoint: "https://provider.example" }],
      "OAUTH_PROVIDER_UNAVAILABLE",
    ],
    [
      "bad endpoint",
      [
        {
          slug: "company",
          client_id: "client",
          authorization_endpoint: "https://provider.example/#fragment",
        },
      ],
      "OAUTH_URL_INVALID",
    ],
  ] as const)(
    "rejects a custom provider with %s",
    (_case, providers, error) => {
      expect(() =>
        buildTokenVerificationAuthorizationUrl("company", state, origin, {
          custom_oauth_providers: providers,
        }),
      ).toThrow(error)
    },
  )

  it("distinguishes callback errors from another provider or a missing response", () => {
    expect(
      readTokenOAuthCallback(
        `${origin}/oauth/other?code=test&state=${state}`,
        origin,
        "company",
        state,
      ),
    ).toBeNull()
    expect(() =>
      readTokenOAuthCallback(
        `${origin}/oauth/company?state=${state}&error=access_denied`,
        origin,
        "company",
        state,
      ),
    ).toThrow("OAUTH_CANCELLED")
    expect(() =>
      readTokenOAuthCallback(
        `${origin}/oauth/company?state=${state}`,
        origin,
        "company",
        state,
      ),
    ).toThrow("OAUTH_CODE_MISSING")
  })

  it("uses a configured custom provider and binds the original callback state", () => {
    const url = new URL(
      buildTokenVerificationAuthorizationUrl(
        "company",
        "nonce",
        "https://console.example",
        {
          custom_oauth_providers: [
            {
              slug: "company",
              client_id: "client",
              authorization_endpoint: "https://id.example/authorize",
              scopes: "openid email",
            },
          ],
        },
      ),
    )
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://console.example/oauth/company",
    )
    expect(url.searchParams.get("state")).toBe("nonce")
    expect(
      readTokenOAuthCallback(
        "https://console.example/oauth/company?code=once&state=nonce",
        "https://console.example",
        "company",
        "nonce",
      ),
    ).toEqual({ state: "nonce", code: "once" })
    expect(() =>
      readTokenOAuthCallback(
        "https://console.example/oauth/company?code=once&state=other",
        "https://console.example",
        "company",
        "nonce",
      ),
    ).toThrow()
    expect(
      readTokenOAuthCallback(
        "https://evil.example/oauth/company?code=once&state=nonce",
        "https://console.example",
        "company",
        "nonce",
      ),
    ).toBeNull()
  })
})
