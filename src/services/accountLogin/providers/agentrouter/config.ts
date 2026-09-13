/** This browser login protocol is verified only on the canonical deployment. */
export function isAgentRouterLoginUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  try {
    return new URL(value).origin === "https://agentrouter.org"
  } catch {
    return false
  }
}
