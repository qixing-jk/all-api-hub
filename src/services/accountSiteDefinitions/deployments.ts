import { AGENT_ROUTER_ORIGIN } from "./identifiers"

/** Canonical deployment policy, verified at https://agentrouter.org on 2026-09-13. */
export const AGENT_ROUTER_ACCOUNT_LOGIN = Object.freeze({
  origin: AGENT_ROUTER_ORIGIN,
  displayName: "AgentRouter",
  systemName: "Agent Router",
  loginPath: "/login",
  userIdHeader: "New-Api-User",
  completionPaths: Object.freeze(["/console/token"] as const),
  methods: Object.freeze(["github", "linuxdo"] as const),
})
