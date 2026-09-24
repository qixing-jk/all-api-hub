/**
 * Canonical and verified mirror origins supporting the AgentRouter login check-in protocol.
 *
 * Source: https://agentrouter.org/api/status (FAQ: new domain ps.air-outer.com)
 */
export const AGENT_ROUTER_ORIGINS = [
  "https://agentrouter.org",
  "https://ps.air-outer.com",
] as const

const AGENT_ROUTER_ORIGIN_SET: ReadonlySet<string> = new Set(
  AGENT_ROUTER_ORIGINS,
)

/** Pattern matching deployment system_name values identifying AgentRouter. */
const AGENT_ROUTER_SYSTEM_NAME_PATTERN = /\bagent\s*router\b/i

/** Validates whether the deployment system_name matches AgentRouter. */
export function isAgentRouterSystemName(value: unknown): boolean {
  return (
    typeof value === "string" && AGENT_ROUTER_SYSTEM_NAME_PATTERN.test(value)
  )
}

/** This browser login protocol is verified on canonical and known mirror deployments. */
export function isAgentRouterLoginUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  try {
    return AGENT_ROUTER_ORIGIN_SET.has(new URL(value).origin)
  } catch {
    return false
  }
}
