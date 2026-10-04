/**
 * gpt-load (https://github.com/tbphp/gpt-load) managed-site configuration.
 *
 * gpt-load is self-hosted, so the deployment address is user supplied and there
 * is no enumerable official hostname. Authentication uses the gateway's root
 * management key (`AUTH_KEY`, `Auth-Key`, or a generated `data/auth.key`); it is
 * presented as a bearer token and gives full read/write control-plane access,
 * so it is stored as a secret. The gateway has no per-deployment scoped keys
 * that can write channels, unlike account-style gateways.
 */
export interface GptLoadConfig {
  /** gpt-load dashboard/control-plane root, e.g. `http://localhost:3001`. */
  baseUrl: string
  /**
   * The gateway's management key (`AUTH_KEY`). Treated as secret; the gateway
   * validates it on every control-plane request.
   */
  managementKey: string
}

export const DEFAULT_GPT_LOAD_CONFIG: GptLoadConfig = {
  baseUrl: "",
  managementKey: "",
}

/** Trims the stored deployment URL so request paths never double a slash. */
export function normalizeGptLoadBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}
