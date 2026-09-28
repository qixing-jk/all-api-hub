/**
 * Deployment facts for sites that serve their browser app and their API on
 * different origins.
 *
 * Most account sites answer `/api/...` on the same origin as their dashboard, so
 * the account URL is also the API base. A few deployments split the two and do
 * not proxy between them, which makes every request built from the account URL
 * miss the API entirely.
 *
 * Verification for `ai-router.dev` (Sub2API fork): the browser app lives on
 * `https://ai-router.dev`, the API answers on `https://api.ai-router.dev/api/v1`,
 * and neither host serves the other's surface — the web origin returns the SPA
 * fallback page for `/api/v1/...`, and the API origin returns `404 page not found`
 * for `/` and `/dashboard`. See `.scratch/ai-router-adaptation/research.md`.
 *
 * This module is a dependency leaf: it must not import other internal modules so
 * that both site definitions and the API transport can read the table without a
 * cycle.
 */

/**
 * The two roles a deployment can serve on separate origins.
 *
 * Every deployment observed so far serves both on one origin — the split that
 * exists in practice is browser-versus-API, not account-versus-gateway — so the
 * roles resolve to the same origin until one declares them apart.
 */
export const DEPLOYMENT_API_ROLES = {
  /** Account, key and usage endpoints reached with the account session. */
  Account: "account",
  /** Gateway endpoints reached with an API key, including the runtime model list. */
  Inference: "inference",
} as const

export type DeploymentApiRole =
  (typeof DEPLOYMENT_API_ROLES)[keyof typeof DEPLOYMENT_API_ROLES]

/**
 * One deployment whose browser app and API live on different origins.
 *
 * `browserHostnames` are the addresses a user adds and the extension opens for
 * session reading and navigation; `apiOrigin` is what requests are built
 * against, and is the canonical API origin (https, no path).
 *
 * Registering a hostname changes that host's current-tab fetch eligibility:
 * the request origin stops matching the tab origin, so requests fall back to
 * the extension context. That is correct for session-token sites and needs
 * re-evaluating before registering a cookie-authenticated one.
 */
export type SplitOriginDeployment = {
  readonly browserHostnames: readonly string[]
  readonly apiOrigin: string
  /**
   * Origin serving the gateway when it differs from the account API. Unset
   * means one origin serves both, which is every deployment observed so far.
   */
  readonly inferenceApiOrigin?: string
}

/**
 * Every registered deployment, keyed so one can be re-exported by name for its
 * site definition. Adding a deployment means adding one entry here.
 */
export const SPLIT_ORIGIN_DEPLOYMENTS = {
  aiRouter: {
    browserHostnames: ["ai-router.dev", "www.ai-router.dev"],
    apiOrigin: "https://api.ai-router.dev",
  },
} as const satisfies Record<string, SplitOriginDeployment>

/**
 * AI-ROUTER's browser addresses and API origin, for the sub2api site definition
 * and the deployment-scoped protocols that gate on them.
 *
 * The enterprise hosts the deployment advertises (`vip.ai-router.dev`,
 * `vip.ai-router.site`) are deliberately unregistered: that surface is a
 * separate portal that has not been verified.
 */
export const AI_ROUTER_HOSTNAMES =
  SPLIT_ORIGIN_DEPLOYMENTS.aiRouter.browserHostnames
export const AI_ROUTER_API_ORIGIN = SPLIT_ORIGIN_DEPLOYMENTS.aiRouter.apiOrigin

/** Browser origins accepted by deployment-scoped protocols such as check-in. */
export const AI_ROUTER_ORIGINS = AI_ROUTER_HOSTNAMES.map(
  (hostname) => `https://${hostname}`,
)

/**
 * Builds the browser-hostname lookup one role resolves against, so a hostname
 * cannot be registered in one form and missed in another.
 */
export const createDeploymentOriginLookup = (
  deployments: readonly SplitOriginDeployment[],
  role: DeploymentApiRole,
): Readonly<Record<string, string>> =>
  Object.freeze(
    Object.assign(
      Object.create(null),
      Object.fromEntries(
        deployments.flatMap((deployment) =>
          deployment.browserHostnames.map((hostname) => [
            hostname,
            role === DEPLOYMENT_API_ROLES.Inference
              ? deployment.inferenceApiOrigin ?? deployment.apiOrigin
              : deployment.apiOrigin,
          ]),
        ),
      ),
    ),
  )

const DEPLOYMENT_ORIGINS_BY_ROLE = {
  [DEPLOYMENT_API_ROLES.Account]: createDeploymentOriginLookup(
    Object.values(SPLIT_ORIGIN_DEPLOYMENTS),
    DEPLOYMENT_API_ROLES.Account,
  ),
  [DEPLOYMENT_API_ROLES.Inference]: createDeploymentOriginLookup(
    Object.values(SPLIT_ORIGIN_DEPLOYMENTS),
    DEPLOYMENT_API_ROLES.Inference,
  ),
} as const

/**
 * Resolves the registered API origin for a request base URL.
 *
 * Only exact, registered hostnames are rewritten; the mapped origin is canonical
 * (https, no path), so the input's scheme, port and path are not carried over.
 * Anything unregistered — including the API origin itself, non-HTTP(S) schemes,
 * relative paths and unparsable input — is returned unchanged so callers can
 * apply this unconditionally.
 *
 * The default role is the account API. Callers reaching a gateway endpoint with
 * an API key pass `Inference`; both roles resolve to the same origin until a
 * deployment declares them apart.
 */
export function resolveDeploymentApiOrigin(
  value: string,
  role: DeploymentApiRole = DEPLOYMENT_API_ROLES.Account,
): string {
  const trimmed = value.trim()
  if (!trimmed) return value

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return value
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return value

  const lookup = DEPLOYMENT_ORIGINS_BY_ROLE[role]
  const hostname = parsed.hostname.toLowerCase()
  if (Object.hasOwn(lookup, hostname)) {
    const origin = lookup[hostname]
    if (typeof origin === "string") return origin
  }
  return value
}
