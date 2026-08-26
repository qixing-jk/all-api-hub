import type { TelemetryPatch } from "~/services/apiCredentialProfiles/telemetryContracts"
import { TELEMETRY_PROVIDER_PROTOCOL } from "~/services/apiCredentialProfiles/telemetryContracts"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryCapabilityMode,
  ApiCredentialTelemetryConfig,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_TELEMETRY_MODES } from "~/types/apiCredentialProfiles"

/** Ordered compatibility fallbacks used after provider-specific probes. */
const AUTO_TELEMETRY_FALLBACK_MODES = [
  API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
  API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
  API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
] as const

/** Hostname groups that select provider-specific automatic telemetry. */
const AUTO_TELEMETRY_HOSTS = {
  deepSeek: "api.deepseek.com",
  glm: ["open.bigmodel.cn", "dev.bigmodel.cn"] as readonly string[],
  kimi: "api.kimi.com",
  zAi: "api.z.ai",
  moonshot: [
    "api.moonshot.cn",
    TELEMETRY_PROVIDER_PROTOCOL.kimi.moonshotAiHost,
  ] as readonly string[],
} as const

/** Detects the documented Z.AI Coding Plan endpoints. */
function isGlmCodingPlanBaseUrl(baseUrl: string): boolean {
  const pathname = new URL(baseUrl).pathname.toLowerCase()
  return (
    pathname.includes("/api/coding/") || pathname.startsWith("/api/anthropic")
  )
}

/** Detects OpenCode Go's provider API origin and path. */
function isOpenCodeGoBaseUrl(baseUrl: string): boolean {
  const url = new URL(baseUrl)
  return (
    url.hostname === "opencode.ai" &&
    (url.pathname === "/zen/go" || url.pathname.startsWith("/zen/go/"))
  )
}

/**
 * Expands the configured telemetry mode into concrete adapter attempts.
 * Provider-specific probes always precede the compatibility fallbacks.
 */
export function resolveTelemetryModes(
  profile: ApiCredentialProfile,
  config: ApiCredentialTelemetryConfig,
): ApiCredentialTelemetryCapabilityMode[] {
  if (config.mode === API_CREDENTIAL_TELEMETRY_MODES.Disabled) return []
  if (config.mode === API_CREDENTIAL_TELEMETRY_MODES.Auto) {
    try {
      const hostname = new URL(profile.baseUrl).hostname
      if (hostname === AUTO_TELEMETRY_HOSTS.deepSeek) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (AUTO_TELEMETRY_HOSTS.glm.includes(hostname)) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (hostname === AUTO_TELEMETRY_HOSTS.kimi) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.KimiQuota,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (
        hostname === AUTO_TELEMETRY_HOSTS.zAi &&
        isGlmCodingPlanBaseUrl(profile.baseUrl)
      ) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.GlmQuota,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (AUTO_TELEMETRY_HOSTS.moonshot.includes(hostname)) {
        return [
          API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance,
          ...AUTO_TELEMETRY_FALLBACK_MODES,
        ]
      }
      if (isOpenCodeGoBaseUrl(profile.baseUrl)) {
        return [API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage]
      }
    } catch {
      // The profile storage boundary already validates base URLs. Keep the
      // generic fallback for legacy or partially migrated data.
    }

    // Prefer provider-specific key telemetry. OpenAI billing endpoints often
    // expose compatibility limits, not spendable gateway balance.
    return [...AUTO_TELEMETRY_FALLBACK_MODES]
  }
  return [config.mode]
}

/** Checks whether an adapter returned user-facing usage data. */
export function hasTelemetryUsageData(data: TelemetryPatch): boolean {
  return (
    data.balance !== undefined ||
    data.balances !== undefined ||
    data.quota !== undefined ||
    data.balanceUsd !== undefined ||
    data.todayCostUsd !== undefined ||
    data.todayRequests !== undefined ||
    data.todayTokens !== undefined ||
    data.unlimitedQuota === true ||
    data.totalUsedUsd !== undefined ||
    data.totalGrantedUsd !== undefined ||
    data.totalAvailableUsd !== undefined ||
    data.expiresAt !== undefined
  )
}
