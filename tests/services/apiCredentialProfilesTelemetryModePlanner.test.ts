import { describe, expect, it } from "vitest"

import {
  hasTelemetryUsageData,
  resolveTelemetryModes,
} from "~/services/apiCredentialProfiles/telemetryModePlanner"
import {
  API_CREDENTIAL_TELEMETRY_MODES,
  type ApiCredentialProfile,
  type ApiCredentialTelemetryConfig,
} from "~/types/apiCredentialProfiles"

const profile = (baseUrl: string): ApiCredentialProfile =>
  ({ baseUrl }) as ApiCredentialProfile

const autoConfig: ApiCredentialTelemetryConfig = {
  mode: API_CREDENTIAL_TELEMETRY_MODES.Auto,
}

describe("api credential telemetry mode planner", () => {
  it("keeps provider probes ahead of compatibility fallbacks", () => {
    expect(
      resolveTelemetryModes(profile("https://api.deepseek.com/v1"), autoConfig),
    ).toEqual([
      API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance,
      API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
      API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
      API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
    ])
  })

  it("uses the dedicated OpenCode Go probe without generic fallbacks", () => {
    expect(
      resolveTelemetryModes(profile("https://opencode.ai/zen/go"), autoConfig),
    ).toEqual([API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage])
  })

  it("recognizes the Kimi API host before compatibility fallbacks", () => {
    expect(
      resolveTelemetryModes(profile("https://api.kimi.com/coding"), autoConfig),
    ).toEqual([
      API_CREDENTIAL_TELEMETRY_MODES.KimiQuota,
      API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage,
      API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
      API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
    ])
  })

  it("returns no modes when telemetry is disabled", () => {
    expect(
      resolveTelemetryModes(profile("https://example.invalid"), {
        mode: API_CREDENTIAL_TELEMETRY_MODES.Disabled,
      }),
    ).toEqual([])
  })

  it("recognizes meaningful usage fields while ignoring empty patches", () => {
    expect(hasTelemetryUsageData({})).toBe(false)
    expect(hasTelemetryUsageData({ todayRequests: 0 })).toBe(true)
    expect(hasTelemetryUsageData({ unlimitedQuota: false })).toBe(false)
    expect(hasTelemetryUsageData({ unlimitedQuota: true })).toBe(true)
  })
})
