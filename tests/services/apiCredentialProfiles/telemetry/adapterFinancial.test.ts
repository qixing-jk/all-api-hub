import { beforeEach, describe, expect, it, vi } from "vitest"

import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { acceptTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetry/acceptance"
import { runUsageAdapter } from "~/services/apiCredentialProfiles/telemetry/adapters"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import { hasTelemetryUsageData } from "~/services/apiCredentialProfiles/telemetry/modePlanner"
import { fetchTelemetryJson } from "~/services/apiCredentialProfiles/telemetry/transport"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_TELEMETRY_MODES } from "~/types/apiCredentialProfiles"

vi.mock("~/services/apiCredentialProfiles/telemetry/transport", () => ({
  fetchTelemetryJson: vi.fn(),
}))
const profile: ApiCredentialProfile = {
  id: "key",
  name: "key",
  apiType: "openai-compatible",
  apiKey: "secret",
  baseUrl: "https://gateway.example",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

describe("billing adapters retain financial contracts", () => {
  beforeEach(() => vi.mocked(fetchTelemetryJson).mockReset())
  it("keeps the subscription limit and usage failure from the same billing refresh", async () => {
    vi.mocked(fetchTelemetryJson)
      .mockResolvedValueOnce({
        endpoint: "/dashboard/billing/subscription",
        json: { hard_limit_usd: "30" },
      })
      .mockRejectedValueOnce(new Error("usage unavailable"))
    const result = await runUsageAdapter(
      profile,
      API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
      { mode: API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling },
    )
    const facts = normalizeTelemetryPatchToFacts(result.data, result.source, {
      profileId: profile.id,
      baseUrl: profile.baseUrl,
      observedAt: 2000,
    })
    expect(facts.budgets?.[0]).toMatchObject({
      limit: { value: "30", observedAt: 2000 },
      remaining: { status: "unknown" },
      used: { status: "unknown" },
    })
    expect(result.attempts).toContainEqual(
      expect.objectContaining({
        source: API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling,
        status: "error",
        message: "usage unavailable",
      }),
    )
  })
  it("retains the documented USD unit for Sub2API balances", async () => {
    vi.mocked(fetchTelemetryJson).mockResolvedValueOnce({
      endpoint: "/api/v1/usage",
      json: { balance: "12.50" },
    })
    const result = await runUsageAdapter(
      profile,
      API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage,
      { mode: API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage },
    )
    expect(
      normalizeTelemetryPatchToFacts(result.data, result.source, {
        profileId: profile.id,
        baseUrl: profile.baseUrl,
        observedAt: 1000,
      }).balanceSnapshot?.positions[0],
    ).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      amount: { value: "12.5" },
    })
  })
  it("leaves an unrelated New API endpoint response unsupported so Auto can continue", async () => {
    vi.mocked(fetchTelemetryJson).mockResolvedValueOnce({
      endpoint: "/api/usage/token",
      json: { data: { message: "not usage" } },
    })
    const result = await runUsageAdapter(profile, "newApiTokenUsage", {
      mode: "auto",
    })
    expect(hasTelemetryUsageData(result.data)).toBe(false)
  })
  it("uses the default New API USD key budget while retaining the raw quota operands", async () => {
    vi.mocked(fetchTelemetryJson).mockResolvedValueOnce({
      endpoint: "/api/usage/token",
      json: {
        data: {
          total_granted: "50000000",
          total_used: "15000000",
          total_available: "35000000.0000000001",
        },
      },
    })
    const result = await runUsageAdapter(profile, "newApiTokenUsage", {
      mode: "newApiTokenUsage",
    })
    expect(hasTelemetryUsageData(result.data)).toBe(true)
    const facts = normalizeTelemetryPatchToFacts(result.data, result.source, {
      profileId: profile.id,
      baseUrl: profile.baseUrl,
      observedAt: 1000,
    })
    expect(facts.budgets?.[0]).toMatchObject({
      asset: { kind: "currency", code: "USD" },
      scope: { keys: { kind: "restricted", ids: ["key"] } },
      remaining: {
        value: "70.0000000000000002",
        source: {
          contractVersion: "standard-usd/v1",
          amountInputs: {
            total_granted: "50000000",
            total_used: "15000000",
            total_available: "35000000.0000000001",
          },
        },
      },
    })
    expect(facts.balanceSnapshot).toBeUndefined()
    const old = structuredClone(facts.budgets![0]!)
    old.asset = {
      kind: ASSET_KINDS.Quota,
      id: `${profile.baseUrl}:new-api-quota`,
      label: "quota",
      displayScale: 1,
      displayLabel: "quota",
    }
    for (const field of ["limit", "used", "remaining"] as const)
      old[field].source.contractVersion = "2"
    const snapshot: ApiCredentialTelemetrySnapshot = {
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1000,
      source: "newApiTokenUsage",
      facts,
      attempts: [],
    }
    expect(
      acceptTelemetrySnapshot(
        { ...snapshot, facts: { budgets: [old] } },
        snapshot,
      ).facts?.budgets,
    ).toHaveLength(1)
    const otherOperation = structuredClone(old)
    for (const field of ["limit", "used", "remaining"] as const)
      otherOperation[field].source.operation = "/api/other-key-budget"
    expect(
      acceptTelemetrySnapshot(
        { ...snapshot, facts: { budgets: [otherOperation] } },
        snapshot,
      ).facts?.budgets,
    ).toHaveLength(2)
  })
})
