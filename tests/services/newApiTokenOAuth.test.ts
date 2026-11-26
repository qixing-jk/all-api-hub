import { describe, expect, it } from "vitest"

import {
  buildTokenVerificationAuthorizationUrl,
  readTokenOAuthCallback,
} from "~/services/apiService/newApiFamily/accessTokens/oauth"

describe("management-token OAuth verification", () => {
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
