import { NEW_API_OAUTH_PROVIDERS, type NewApiOAuthProvider } from "./contracts"

/** Narrows a site-owned method ID to this protocol's implemented OAuth providers. */
export function isNewApiLoginProvider(
  methodId: string,
): methodId is NewApiOAuthProvider {
  return Object.values(NEW_API_OAUTH_PROVIDERS).some(
    (provider) => provider === methodId,
  )
}

/** Builds the fixed GitHub OAuth authorize URL shared by New API deployments. */
export function buildGithubAuthorizeUrl(input: {
  clientId: string
  state: string
}): string {
  const clientId = input.clientId.trim()
  const state = input.state.trim()
  if (!clientId || !/^[A-Za-z0-9_-]+$/.test(clientId) || !state) {
    throw new Error("Invalid GitHub OAuth parameters.")
  }

  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("state", state)
  url.searchParams.set("scope", "user:email")
  return url.href
}

/** Linux DO's OAuth2 endpoint and parameters: https://linux.do/t/topic/32752. */
export function buildLinuxDoAuthorizeUrl(input: {
  clientId: string
  state: string
}): string {
  const clientId = input.clientId.trim()
  const state = input.state.trim()
  if (!clientId || !/^[A-Za-z0-9_-]+$/.test(clientId) || !state) {
    throw new Error("Invalid Linux DO OAuth parameters.")
  }

  const url = new URL("https://connect.linux.do/oauth2/authorize")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("state", state)
  return url.href
}

interface LoginMethod {
  provider: NewApiOAuthProvider
  label: string
  clientId: string
  authorizationEndpoint: string
}

/** Public New API status contract: QuantumNous/new-api/controller/misc.go. */
export function discoverNewApiLoginMethods(
  status: Record<string, unknown>,
  allowed: readonly NewApiOAuthProvider[],
): LoginMethod[] {
  const definitions = [
    {
      provider: "github",
      label: "GitHub",
      flag: "github_oauth",
      client: "github_client_id",
      endpoint: "https://github.com/login/oauth/authorize",
    },
    {
      provider: "linuxdo",
      label: "Linux DO",
      flag: "linuxdo_oauth",
      client: "linuxdo_client_id",
      endpoint: "https://connect.linux.do/oauth2/authorize",
    },
    {
      provider: "discord",
      label: "Discord",
      flag: "discord_oauth",
      client: "discord_client_id",
      endpoint: "https://discord.com/oauth2/authorize",
    },
    {
      provider: "oidc",
      label: "OIDC",
      flag: "oidc_enabled",
      client: "oidc_client_id",
      endpoint: status.oidc_authorization_endpoint,
    },
  ] as const
  return definitions.flatMap((definition) => {
    const clientId = status[definition.client]
    if (
      !allowed.includes(definition.provider) ||
      status[definition.flag] !== true ||
      typeof clientId !== "string" ||
      !clientId.trim() ||
      typeof definition.endpoint !== "string"
    )
      return []
    try {
      const endpoint = new URL(definition.endpoint)
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.hash
      )
        return []
      return [
        {
          provider: definition.provider,
          label: definition.label,
          clientId: clientId.trim(),
          authorizationEndpoint: endpoint.href,
        },
      ]
    } catch {
      return []
    }
  })
}

/** Uses QuantumNous/new-api/web/src/lib/oauth.ts provider redirects and scopes. */
export function buildNewApiAuthorizationUrl(
  method: LoginMethod,
  state: string,
  origin: string,
): string {
  const url = new URL(method.authorizationEndpoint)
  url.searchParams.set("client_id", method.clientId)
  url.searchParams.set("state", state)
  if (method.provider === "github") url.searchParams.set("scope", "user:email")
  else url.searchParams.set("response_type", "code")
  if (method.provider === "discord" || method.provider === "oidc") {
    url.searchParams.set("redirect_uri", `${origin}/oauth/${method.provider}`)
    // Discord requires spaces between scopes before URL encoding, not a literal +:
    // https://docs.discord.com/developers/topics/oauth2#authorization-code-grant
    url.searchParams.set(
      "scope",
      method.provider === "discord"
        ? "identify openid"
        : "openid profile email",
    )
  }
  return url.href
}
