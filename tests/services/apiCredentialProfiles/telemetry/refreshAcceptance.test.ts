import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { apiCredentialProfilesStorage as storage } from "~/services/apiCredentialProfiles/storage/profiles"
import { refreshApiCredentialProfileTelemetry as refresh } from "~/services/apiCredentialProfiles/telemetry"
import { selectTelemetryBalances } from "~/services/apiCredentialProfiles/telemetry/facts"
import { API_CREDENTIAL_PROFILES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { SiteHealthStatus } from "~/types"
import {
  TELEMETRY_FINANCIAL_ROLES,
  TELEMETRY_FINANCIAL_SCOPES,
} from "~/types/apiCredentialProfiles"

const { storageData } = vi.hoisted(() => ({
  storageData: new Map<string, unknown>(),
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return storageData.get(key)
    }
    async set(key: string, value: unknown) {
      storageData.set(key, value)
    }
    async remove(key: string) {
      storageData.delete(key)
    }
  },
}))
vi.mock("~/services/apiCredentialProfiles/modelCatalog", () => ({
  fetchApiCredentialModelIds: async () => ["model"],
}))

const wallet = (value: string) =>
  new Response(
    JSON.stringify({
      is_available: true,
      balance_infos: [{ currency: CURRENCIES.CNY, total_balance: value }],
    }),
    { headers: { "content-type": "application/json" } },
  )
const create = () =>
  storage.createProfile({
    name: "Wallet",
    baseUrl: "https://api.deepseek.com",
    apiKey: "synthetic",
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    telemetryConfig: { mode: "deepSeekBalance" },
  })

describe("credential refresh acceptance", () => {
  it("admits only the requested owner and leaves stored profiles unchanged for a missing owner", async () => {
    const first = await create()
    const second = await storage.createProfile({
      name: "Second wallet",
      baseUrl: "https://api.deepseek.com",
      apiKey: "synthetic-second",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "deepSeekBalance" },
    })
    const before = await storage.exportConfig()
    await expect(
      storage.beginTelemetryRefresh("missing-owner"),
    ).rejects.toThrow("Profile not found")
    expect(await storage.exportConfig()).toEqual(before)
    const admitted = await storage.beginTelemetryRefresh(first.id)
    const after = await storage.exportConfig()
    expect(admitted.telemetryRefreshGeneration).toBeGreaterThan(0)
    expect(after.profiles.find((profile) => profile.id === second.id)).toEqual(
      before.profiles.find((profile) => profile.id === second.id),
    )
  })
  it("restores over malformed profile rows without rewinding the readable admission clock", async () => {
    await create()
    const backup = await storage.exportConfig()
    storageData.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      {
        version: backup.version,
        profiles: [null, 7, { telemetryRefreshGeneration: 13 }],
      },
    )
    await storage.importConfig(backup)
    const restored = await storage.exportConfig()
    expect(restored.profiles[0]?.telemetryRefreshGeneration).toBeGreaterThan(13)
    expect(restored.profiles[0]?.id).toBe(backup.profiles[0]?.id)
  })
  it.each([null, 7, { version: 2 }, { version: 2, profiles: {} }])(
    "does not overwrite malformed outer admission state %j during explicit restore",
    async (raw) => {
      await create()
      const backup = await storage.exportConfig()
      const key = API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES
      storageData.set(key, raw)
      await expect(storage.importConfig(backup)).rejects.toThrow(
        /Invalid API credential profiles config/,
      )
      expect(storageData.get(key)).toEqual(raw)
    },
  )
  it("does not replace profiles when the current admission state cannot be read", async () => {
    await create()
    const backup = await storage.exportConfig()
    const read = vi.spyOn(storageData, "get").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    try {
      await expect(storage.importConfig(backup)).rejects.toThrow(
        "storage unavailable",
      )
    } finally {
      read.mockRestore()
    }
    expect(await storage.exportConfig()).toEqual(backup)
  })
  it("does not replace an unsupported outer config while bypassing corrupt telemetry", async () => {
    await create()
    const backup = await storage.exportConfig()
    const future = { version: 999, profiles: [], financialState: "keep" }
    storageData.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      future,
    )
    await expect(storage.importConfig(backup)).rejects.toThrow(/version/i)
    expect(
      storageData.get(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      ),
    ).toEqual(future)
  })
  it("records a new subscription limit and the usage failure without deriving a fresh remaining amount", async () => {
    const profile = await storage.createProfile({
      name: "Billing",
      baseUrl: "https://billing.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "openaiBilling" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).includes("subscription")
                ? { hard_limit_usd: "20" }
                : { total_usage: "1000" },
            ),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    const original = await refresh(profile.id)
    const old = original.facts!.budgets![0]!.remaining
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("subscription")
          ? new Response(JSON.stringify({ hard_limit_usd: "30" }), {
              headers: { "content-type": "application/json" },
            })
          : new Response("unavailable", { status: 503 }),
      ),
    )
    const partial = await refresh(profile.id)
    expect(partial.facts?.budgets?.[0]).toMatchObject({
      limit: { status: "known", value: "30" },
      remaining: {
        status: "stale",
        value: "10",
        observedAt: "observedAt" in old ? old.observedAt : undefined,
      },
    })
    expect(partial.health.status).toBe(SiteHealthStatus.Warning)
    expect(partial.lastError).toContain("503")
    expect(partial.attempts).toContainEqual(
      expect.objectContaining({ source: "openaiBilling", status: "error" }),
    )
  })
  it("keeps the old finite budget state separately from a fresh used-only reading", async () => {
    const profile = await storage.createProfile({
      name: "Budget",
      baseUrl: "https://budget.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "newApiTokenUsage" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                total_granted: "50000000",
                total_used: "15000000",
                total_available: "35000000",
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    const original = await refresh(profile.id)
    const state = original.facts!.budgets![0]!.stateObservation
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { total_used: "20000000" } }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    const partial = await refresh(profile.id)
    expect(partial.facts?.budgets?.[0]).toMatchObject({
      limitState: "finite",
      stateObservation: {
        status: "stale",
        observedAt: "observedAt" in state ? state.observedAt : undefined,
      },
      used: { status: "known", value: "40" },
      remaining: { status: "stale", value: "70" },
    })
  })
  it.each([-1, 1.5, "bad"])(
    "does not decode a corrupt persisted profile admission generation %s",
    async (generation) => {
      const profile = await create()
      const raw = await storage.exportConfig()
      raw.profiles[0]!.telemetryRefreshGeneration = generation as never
      storageData.set(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
        raw,
      )
      await expect(storage.getProfileById(profile.id)).rejects.toThrow(
        "Invalid telemetry refresh generation",
      )
    },
  )
  it.each([
    { balance_infos: [{ total_balance: "120" }] },
    {
      balance_infos: [
        { currency: "CNY", total_balance: "120" },
        { currency: "CNY", total_balance: "130" },
      ],
    },
  ])(
    "retains identified wallets when the next enumeration loses usable identities",
    async (response) => {
      const profile = await create()
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => wallet("110")),
      )
      const original = await refresh(profile.id)
      const old = original.facts!.balanceSnapshot!.positions[0]!.amount
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify(response), {
              headers: { "content-type": "application/json" },
            }),
        ),
      )
      const partial = await refresh(profile.id)
      expect(partial.facts?.balanceSnapshot?.positions).toContainEqual(
        expect.objectContaining({
          id: "available:CNY",
          amount: expect.objectContaining({
            status: "stale",
            value: "110",
            observedAt: "observedAt" in old ? old.observedAt : undefined,
          }),
        }),
      )
    },
  )
  it.each([-1, 1.5, "bad", Number.MAX_SAFE_INTEGER])(
    "rejects corrupt or overflowing admission clocks %s without changing saved profiles",
    async (clock) => {
      const profile = await create()
      const before = await storage.exportConfig()
      storageData.set(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.TELEMETRY_GENERATION,
        clock,
      )
      await expect(storage.beginTelemetryRefresh(profile.id)).rejects.toThrow(
        /clock|overflow/i,
      )
      expect(await storage.exportConfig()).toEqual(before)
    },
  )
  it("replaces corrupt financial telemetry while keeping admission newer than prior requests", async () => {
    const profile = await create()
    const backup = await storage.exportConfig()
    const admitted = await storage.beginTelemetryRefresh(profile.id)
    const raw = await storage.exportConfig()
    raw.profiles[0]!.telemetrySnapshot = {
      lastSyncTime: 1000,
      attempts: [],
      facts: { balanceSnapshot: { schemaVersion: 999 } },
    } as never
    storageData.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      raw,
    )
    await expect(storage.exportConfig()).rejects.toThrow(/canonical.*balance/i)
    const restored = await storage.importConfig(backup)
    expect(restored.profiles[0]?.telemetryRefreshGeneration).toBeGreaterThan(
      admitted.telemetryRefreshGeneration!,
    )
    expect(await storage.getProfileById(profile.id)).toMatchObject({
      id: profile.id,
    })
  })
  it.each([BUDGET_LIMIT_STATES.Unlimited, BUDGET_LIMIT_STATES.Unconfigured])(
    "does not retain finite limit or remaining amounts when the budget becomes %s",
    async (limitState) => {
      const profile = await create()
      const source = {
        adapter: "budget",
        operation: "budget",
        contractVersion: "1",
        kind: "reported" as const,
      }
      const scope = {
        subject: { kind: "credential" as const, profileId: profile.id },
        authority: "https://budget.example",
        projects: { kind: "unknown" as const },
        keys: { kind: "unknown" as const },
        models: { kind: "unknown" as const },
        groups: { kind: "unknown" as const },
      }
      const original = budgetConstraint({
        source,
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        observedAt: 1000,
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: "100",
        used: "30",
        remaining: "70",
      })
      await storage.updateTelemetrySnapshot(profile.id, {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 1000,
        attempts: [],
        facts: { budgets: [original] },
      })
      await storage.updateTelemetrySnapshot(profile.id, {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 2000,
        attempts: [],
        facts: {
          budgets: [
            budgetConstraint({
              source,
              scope,
              asset: original.asset,
              observedAt: 2000,
              limitState,
            }),
          ],
        },
      })
      const stored = (await storage.getProfileById(profile.id))!
        .telemetrySnapshot!
      expect(stored.facts?.budgets?.[0]).toMatchObject({
        limitState,
        stateObservation: { status: "known", observedAt: 2000 },
        limit: { status: "unknown" },
        remaining: { status: "unknown" },
      })
      expect(selectTelemetryBalances(stored.facts)[0]).toMatchObject({
        status: "known",
        observedAt: 2000,
      })
      expect(selectTelemetryBalances(stored.facts)[0]?.amount).toBeNaN()
    },
  )
  it.each(["reset", "timeZone", "interval"] as const)(
    "does not carry old remaining into a partial budget whose %s changes",
    async (changed) => {
      const profile = await create()
      const source = {
        adapter: "budget",
        operation: "budget",
        contractVersion: "1",
        kind: "reported" as const,
      }
      const scope = {
        subject: { kind: "credential" as const, profileId: profile.id },
        authority: "https://budget.example",
        projects: { kind: "unknown" as const },
        keys: { kind: "unknown" as const },
        models: { kind: "unknown" as const },
        groups: { kind: "unknown" as const },
      }
      const window = {
        kind: BUDGET_WINDOW_KINDS.Periodic,
        period: BUDGET_PERIODS.Day,
        timeZone: "UTC",
        resetsAt: 10000,
        observation: { start: 0, end: 10000, timeZone: "UTC" },
      } as const
      const original = budgetConstraint({
        source,
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        observedAt: 1000,
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: "100",
        used: "30",
        remaining: "70",
        window,
      })
      await storage.updateTelemetrySnapshot(profile.id, {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 1000,
        attempts: [],
        facts: { budgets: [original] },
      })
      const incoming = budgetConstraint({
        source,
        scope,
        asset: original.asset,
        observedAt: 2000,
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: "120",
        window: {
          ...window,
          ...(changed === "reset" ? { resetsAt: 20000 } : {}),
          ...(changed === "timeZone" ? { timeZone: "Asia/Shanghai" } : {}),
          ...(changed === "interval"
            ? { observation: { start: 10000, end: 20000, timeZone: "UTC" } }
            : {}),
        },
      })
      await storage.updateTelemetrySnapshot(profile.id, {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 2000,
        attempts: [],
        facts: { budgets: [incoming] },
      })
      const stored = (await storage.getProfileById(profile.id))!
        .telemetrySnapshot!
      expect(stored.facts?.budgets?.[0]).toMatchObject({
        window: incoming.window,
        limit: { status: "known", value: "120", observedAt: 2000 },
        remaining: { status: "unknown" },
        used: { status: "unknown" },
      })
      expect(selectTelemetryBalances(stored.facts)[0]?.status).toBe("unknown")
    },
  )
  it("keeps a same-window budget's last-known amounts after a partial read while displaying the newly reported limit independently", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const profile = await storage.createProfile({
      name: "Partial budget",
      baseUrl: "https://budget.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "openaiBilling" },
    })
    let limit = "100"
    let usage = "3000"
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).includes("subscription")
                ? { hard_limit_usd: limit }
                : { total_usage: usage },
            ),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    const original = await refresh(profile.id)
    expect(selectTelemetryBalances(original.facts)[0]).toMatchObject({
      amount: 70,
      status: "known",
      observedAt: 1000,
    })
    vi.setSystemTime(2000)
    limit = "120"
    usage = "invalid"
    const partial = await refresh(profile.id)
    expect(partial.facts?.budgets?.[0]).toMatchObject({
      limit: { status: "known", value: "120", observedAt: 2000 },
      used: { status: "stale", value: "30", observedAt: 1000 },
      remaining: { status: "stale", value: "70", observedAt: 1000 },
    })
    expect(partial.facts?.budgets?.[0]?.remaining.source).toEqual(
      original.facts?.budgets?.[0]?.remaining.source,
    )
    const stored = (await storage.getProfileById(profile.id))!
      .telemetrySnapshot!
    expect(selectTelemetryBalances(stored.facts)[0]).toMatchObject({
      amount: 70,
      status: "stale",
      observedAt: 1000,
    })
  })
  it("retains unlimited as a stale observation with its original clock after a failed refresh and storage readback", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const profile = await storage.createProfile({
      name: "Unlimited key",
      baseUrl: "https://key.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "newApiTokenUsage" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { unlimited_quota: true } }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    const original = await refresh(profile.id)
    expect(original.facts?.budgets?.[0]).toMatchObject({
      limitState: "unlimited",
      stateObservation: { status: "known", observedAt: 1000 },
    })
    vi.setSystemTime(2000)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    const failed = await refresh(profile.id)
    expect(failed.facts?.budgets?.[0]).toMatchObject({
      limitState: "unlimited",
      stateObservation: {
        status: "stale",
        observedAt: 1000,
        reason: "refresh-unavailable",
      },
    })
    expect(failed.facts?.budgets?.[0]?.stateObservation.source).toEqual(
      original.facts?.budgets?.[0]?.stateObservation.source,
    )
    expect(
      (await storage.getProfileById(profile.id))?.telemetrySnapshot?.facts
        ?.budgets,
    ).toEqual(failed.facts?.budgets)
  })
  it("preserves the reporting authority of a cross-origin custom endpoint", async () => {
    const profile = await storage.createProfile({
      name: "Cross-origin",
      baseUrl: "https://gateway-a.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: {
        mode: "customReadOnlyEndpoint",
        customEndpoint: {
          endpoint: "https://billing-b.example/usage",
          jsonPaths: { balanceUsd: "remaining" },
          financialMapping: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
            role: TELEMETRY_FINANCIAL_ROLES.Available,
            scope: TELEMETRY_FINANCIAL_SCOPES.Credential,
          },
        },
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://billing-b.example/usage")
        return new Response(JSON.stringify({ remaining: "12" }), {
          headers: { "content-type": "application/json" },
        })
      }),
    )
    const result = await refresh(profile.id)
    expect(result.facts?.balanceSnapshot?.positions[0]?.scope).toMatchObject({
      authority: "https://billing-b.example",
      subject: { kind: "credential", profileId: profile.id },
    })
    expect((await storage.getProfileById(profile.id))?.baseUrl).toBe(
      "https://gateway-a.example",
    )
  })
  it("continues automatic probing after an unrelated empty New API response", async () => {
    const profile = await storage.createProfile({
      name: "Auto",
      baseUrl: "https://auto.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "auto" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).includes("/usage/token/")
                ? {}
                : { data: { balance: "12" } },
            ),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    const next = await refresh(profile.id)
    expect(next.source).toBe("sub2apiUsage")
    expect(next.facts?.balanceSnapshot?.positions[0]?.amount).toMatchObject({
      status: "known",
      value: "12",
    })
  })
  it("does not retain an unlimited flag after a finite key budget is reported", async () => {
    const profile = await storage.createProfile({
      name: "Key",
      baseUrl: "https://key.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "newApiTokenUsage" },
    })
    let unlimited = true
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                unlimited_quota: unlimited,
                total_granted: 100,
                total_available: 70,
                total_used: 30,
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    await refresh(profile.id)
    unlimited = false
    const next = await refresh(profile.id)
    expect(next.facts?.usage?.unlimited).not.toBe(true)
    expect(next.facts?.budgets?.[0]).toMatchObject({
      limitState: "finite",
      remaining: { value: "0.00014" },
    })
  })
  it.each([
    "corrupt",
    [],
    null,
    { version: 8, profiles: "corrupt" },
    { version: 8 },
  ])("refuses to rebuild malformed stored profiles %j", async (raw) => {
    storageData.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      raw,
    )
    await expect(create()).rejects.toThrow(/config/i)
    expect(
      storageData.get(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      ),
    ).toEqual(raw)
  })
  it("retains legacy balances and usage as stale references after a failed acquisition", async () => {
    const profile = await create()
    await storage.updateTelemetrySnapshot(profile.id, {
      health: { status: SiteHealthStatus.Healthy },
      lastSyncTime: 1000,
      lastSuccessTime: 1000,
      attempts: [],
      facts: {
        balances: [
          {
            amount: 20,
            unit: {
              kind: MEASUREMENT_UNIT_KINDS.Money,
              currency: CURRENCIES.USD,
              decimalPlaces: 2,
            },
            semantics: "legacy",
          },
        ],
        usage: {
          totalUsed: {
            value: 30,
            unit: {
              kind: MEASUREMENT_UNIT_KINDS.Money,
              currency: CURRENCIES.USD,
              decimalPlaces: 2,
            },
          },
        },
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    await refresh(profile.id)
    const stored = (await storage.getProfileById(profile.id))!
      .telemetrySnapshot!
    expect(stored.facts?.balances?.[0]).toMatchObject({
      amount: 20,
      semantics: "legacy",
      status: "stale",
      observedAt: 1000,
    })
    expect(stored.facts?.usage?.totalUsed).toMatchObject({
      value: 30,
      status: "stale",
      observedAt: 1000,
    })
  })
  it("keeps admission order across restoring a pre-refresh backup", async () => {
    const profile = await create()
    const backup = await storage.exportConfig()
    let release!: (response: Response) => void
    let started!: () => void
    const pending = new Promise<void>((resolve) => {
      started = resolve
    })
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        if (++calls === 1) {
          started()
          return new Promise<Response>((resolve) => {
            release = resolve
          })
        }
        return Promise.resolve(wallet("30"))
      }),
    )
    const old = refresh(profile.id)
    await pending
    await storage.importConfig(backup)
    const current = await refresh(profile.id)
    release(wallet("10"))
    await expect(old).rejects.toMatchObject({
      name: "TelemetryRefreshSupersededError",
    })
    expect(
      (await storage.getProfileById(profile.id))?.telemetrySnapshot,
    ).toEqual(current)
  })
  beforeEach(() => {
    storageData.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  it.each([999, "bad", 0, -1, 1.5])(
    "refuses to overwrite unsupported profile config version %s during admission",
    async (version) => {
      const future = {
        version,
        profiles: [],
        unknownFinancialState: { value: "keep" },
      }
      storageData.set(
        API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
        future,
      )
      await expect(storage.exportConfig()).rejects.toThrow(/version/i)
      await expect(create()).rejects.toThrow(/version/i)
      expect(
        storageData.get(
          API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
        ),
      ).toEqual(future)
    },
  )
  it("keeps a failed wallet observation stale while model success has its own clock", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const profile = await create()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => wallet("20")),
    )
    const original = await refresh(profile.id)
    expect(
      original.facts?.balanceSnapshot?.positions[0]?.scope.subject,
    ).toEqual({ kind: "credential", profileId: profile.id })
    vi.setSystemTime(2000)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    const failed = await refresh(profile.id)
    expect(failed.facts?.balanceSnapshot?.positions[0]?.amount).toMatchObject({
      value: "20",
      status: "stale",
      observedAt: 1000,
    })
    expect(failed.lastSuccessTime).toBe(1000)
    expect(failed.facts?.models).toMatchObject({ count: 1 })
    expect(failed.health.status).toBe("warning")
    expect(failed.lastError).toBeTruthy()
  })
  it("rejects an older success that finishes after a newer admitted request", async () => {
    const profile = await create()
    let release!: (response: Response) => void
    let started!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        calls += 1
        if (calls === 1) {
          started()
          return new Promise<Response>((resolve) => {
            release = resolve
          })
        }
        return Promise.resolve(wallet("30"))
      }),
    )
    const old = refresh(profile.id)
    await firstStarted
    const current = await refresh(profile.id)
    release(wallet("10"))
    await expect(old).rejects.toMatchObject({
      name: "TelemetryRefreshSupersededError",
    })
    expect(
      (await storage.getProfileById(profile.id))?.telemetrySnapshot,
    ).toEqual(current)
  })
  it("marks old quota windows stale when a new request fails without discarding the reported remaining", async () => {
    const profile = await storage.createProfile({
      name: "Plan",
      baseUrl: "https://api.kimi.com",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "kimiQuota" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ usage: { remaining: 20 } }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    await refresh(profile.id)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    const failed = await refresh(profile.id)
    expect(failed.facts?.quota?.windows[0]).toMatchObject({
      remaining: 20,
      status: "stale",
    })
  })
  it("retains budget observations with their original clock after a failed refresh", async () => {
    const profile = await storage.createProfile({
      name: "Budget",
      baseUrl: "https://budget.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "openaiBilling" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).includes("subscription")
                ? { hard_limit_usd: "100" }
                : { total_usage: "3000" },
            ),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    const original = await refresh(profile.id)
    expect(original.facts?.budgets?.[0]?.remaining).toMatchObject({
      status: "known",
      value: "70",
    })
    const priorBudget = original.facts!.budgets![0]!
    await storage.updateTelemetrySnapshot(profile.id, {
      ...original,
      facts: {
        budgets: [
          {
            ...priorBudget,
            usedIncludesByok: {
              status: OBSERVATION_STATUSES.Known,
              value: true,
              source: priorBudget.used.source,
              observedAt: 1000,
            },
          },
        ],
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )
    const failed = await refresh(profile.id)
    expect(failed.facts?.budgets?.[0]?.remaining).toMatchObject({
      status: "stale",
      value: "70",
      observedAt:
        "observedAt" in priorBudget.remaining
          ? priorBudget.remaining.observedAt
          : undefined,
    })
    expect(failed.facts?.budgets?.[0]?.usedIncludesByok).toMatchObject({
      status: "stale",
      value: true,
      observedAt: 1000,
    })
    expect(
      (await storage.getProfileById(profile.id))?.telemetrySnapshot?.facts
        ?.budgets?.[0]?.remaining,
    ).toEqual(failed.facts?.budgets?.[0]?.remaining)
  })
  it("does not remove an omitted quota window when another window succeeds", async () => {
    const profile = await storage.createProfile({
      name: "Plan",
      baseUrl: "https://api.kimi.com",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "kimiQuota" },
    })
    let response: unknown = {
      usage: { remaining: 20 },
      limits: [{ window: { duration: 300 }, detail: { remaining: 5 } }],
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    await refresh(profile.id)
    response = { usage: { remaining: 10 } }
    const next = await refresh(profile.id)
    expect(next.facts?.quota?.windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "weekly", remaining: 10 }),
        expect.objectContaining({
          type: "fiveHour",
          remaining: 5,
          status: "stale",
        }),
      ]),
    )
  })
  it("accepts an authoritative empty wallet list but preserves unreadable amounts as stale", async () => {
    const profile = await create()
    let response: unknown = {
      is_available: true,
      balance_infos: [{ currency: CURRENCIES.CNY, total_balance: "20" }],
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
          }),
      ),
    )
    await refresh(profile.id)
    response = {
      balance_infos: [{ currency: CURRENCIES.CNY, total_balance: "invalid" }],
    }
    expect(
      (await refresh(profile.id)).facts?.balanceSnapshot?.positions[0]?.amount,
    ).toMatchObject({ status: "stale", value: "20" })
    response = { balance_infos: [] }
    expect(
      (await refresh(profile.id)).facts?.balanceSnapshot?.positions,
    ).toEqual([])
  })
  it("preserves omitted budget windows separately from a newly observed window", async () => {
    const profile = await storage.createProfile({
      name: "Budget",
      baseUrl: "https://budget.example",
      apiKey: "synthetic",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      telemetryConfig: { mode: "openaiBilling" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          new Response(
            JSON.stringify(
              String(input).includes("subscription")
                ? { hard_limit_usd: "100" }
                : { total_usage: "3000" },
            ),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
    const first = await refresh(profile.id)
    const budget = first.facts!.budgets![0]!
    const updated = await storage.updateTelemetrySnapshot(profile.id, {
      ...first,
      facts: {
        budgets: [
          {
            ...budget,
            window: {
              kind: BUDGET_WINDOW_KINDS.Periodic,
              period: BUDGET_PERIODS.Day,
            },
          },
        ],
      },
    })
    expect(updated.profile.telemetrySnapshot?.facts?.budgets).toHaveLength(2)
    expect(
      updated.profile.telemetrySnapshot?.facts?.budgets?.find(
        (item) => item.window.kind === budget.window.kind,
      )?.remaining,
    ).toMatchObject({ status: "stale", value: "70" })
  })
})
