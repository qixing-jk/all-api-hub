/**
 * NanoGPT protocol constants.
 *
 * NanoGPT (https://nano-gpt.com/) is a hosted multi-provider platform with its
 * own REST contract (Next.js console + Auth.js sessions), not a One API/New API
 * derivative. Verified 2026-10-25; raw captures live in
 * `.scratch/nanogpt-adaptation/evidence/`:
 * - console session/balance routes: probe-01, probe-08, probe-10
 * - inference-key account routes and public catalog: probe-10, probe-11
 * - documented contracts: probe-02 (docs markdown), probe-04 (authentication),
 *   evidence/management-openapi.json
 */

export const NANOGPT_ENDPOINTS = {
  /** Console origin: Auth.js session for the signed-in browser account. */
  session: "/api/auth/session",
  /** Console origin: local session data, including the Nano deposit address. */
  localSession: "/api/auth/local-session",
  /** Inference host: cash and Nano balances for the request's API key. */
  checkBalance: "/api/check-balance",
  /** Inference host: key-scoped aggregate usage (UTC day window). */
  usage: "/api/v1/usage",
  /** Inference host: subscription quotas and routing advice. */
  subscriptionUsage: "/api/subscription/v1/usage",
  /** Inference host: provider-wide catalog; `detailed=true` adds pricing. */
  detailedModels: "/api/v1/models?detailed=true",
} as const

export const NANOGPT_MANAGEMENT_TOKEN_PREFIX = "sk-nano-mgmt-"
export const NANOGPT_MANAGEMENT_IDENTITY_PREFIX = "nanogpt-management:"
export const NANOGPT_KEY_POLICIES = {
  ZeroDataRetention: "zdr",
  Off: "off",
  Unset: "unset",
} as const
export const NANOGPT_KEY_STATUSES = {
  Active: "active",
  Expired: "expired",
} as const
