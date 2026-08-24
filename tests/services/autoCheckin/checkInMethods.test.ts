import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import {
  discoverCheckInMethods,
  setCheckInSelection,
} from "~/services/checkin/autoCheckin/discovery"
import {
  getSelectedCheckInStatus,
  isAutomaticCheckInConfiguredForAccount,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import {
  executeSelectedCheckIn,
  inspectSelectedCheckInCompatibility,
  markSelectedCheckInExecuted,
} from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import {
  createAutoCheckinMethodRegistry,
  getLegacyAutoCheckinMethodIds,
} from "~/services/checkin/autoCheckin/providers/registry"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/refresh"
import {
  mergeCompatibilityCheckInStatus,
  mergeDiscoveredCheckInDraft,
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("check-in methods compatibility activation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const getNewApiExecutionRegistration = () => {
    const registration = autoCheckinMethodRegistry.resolveById(
      "new-api:daily-checkin",
    )
    if (!registration?.provider.getStatus) {
      throw new Error("New API check-in status reader is not registered")
    }
    return registration
  }

  const createNewApiExecutionAccount = () =>
    buildSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    })

  const createExecutionContext = () => ({
    tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
    protectionBypassExecution: userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
    ),
  })

  it("turns a pre-registry support result into canonical evidence and selection", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })

    expect(
      resolveSelectedCheckInMethod({ config, siteType: SITE_TYPES.NEW_API }),
    ).toBe("new-api:daily-checkin")
    expect(
      config.methodKnowledge.methods["new-api:daily-checkin"]?.detection,
    ).toEqual({
      outcome: "matched",
      evidence: { source: "compatibility_registration" },
    })
  })

  it("does not invent support for a new Sub2API account and keeps execution off", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.SUB2API,
      supported: false,
      automaticExecutionEnabled: false,
    })

    expect(config).toMatchObject({
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" as const },
    })
    expect(config.selection).not.toHaveProperty("methodId")
  })

  it.each([
    {
      name: "selected enabled account",
      supported: true,
      automaticExecutionEnabled: true,
      accountDisabled: false,
      expected: true,
    },
    {
      name: "account without a selection",
      supported: false,
      automaticExecutionEnabled: true,
      accountDisabled: false,
      expected: false,
    },
    {
      name: "account without automatic intent",
      supported: true,
      automaticExecutionEnabled: false,
      accountDisabled: false,
      expected: false,
    },
    {
      name: "disabled account",
      supported: true,
      automaticExecutionEnabled: true,
      accountDisabled: true,
      expected: false,
    },
  ])("derives automatic check-in setup once: $name", (testCase) => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: testCase.supported,
      automaticExecutionEnabled: testCase.automaticExecutionEnabled,
    })

    expect(
      isAutomaticCheckInConfiguredForAccount({
        config,
        siteType: SITE_TYPES.NEW_API,
        accountDisabled: testCase.accountDisabled,
      }),
    ).toBe(testCase.expected)
  })

  it("stores a compatibility status only on the selected method", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.VELOERA,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const updated = mergeCompatibilityCheckInStatus({
      config,
      methodId: "veloera:daily-checkin",
      isCheckedInToday: true,
      observedAt: 123,
    })

    expect(
      getSelectedCheckInStatus({
        config: updated,
        siteType: SITE_TYPES.VELOERA,
      }),
    ).toEqual({
      outcome: "known",
      today: "checked",
      evidence: { source: "probe", observedAt: 123 },
    })
  })
  it("records a successful selected method with execution evidence", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const originalSnapshot = structuredClone(config)
    const updated = markSelectedCheckInExecuted({
      config,
      siteType: SITE_TYPES.NEW_API,
      observedAt: 456,
    })

    expect(
      getSelectedCheckInStatus({
        config: updated,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      outcome: "known",
      today: "checked",
      evidence: { source: "execution", observedAt: 456 },
    })
    expect(config).toEqual(originalSnapshot)
    expect(updated).not.toBe(config)
  })

  it("preserves known method availability when refreshing boolean daily status", () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    config.methodKnowledge.methods["new-api:daily-checkin"]!.status = {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: "disabled",
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      evidence: { source: "probe", observedAt: 100 },
    }

    const updated = mergeCompatibilityCheckInStatus({
      config,
      methodId: "new-api:daily-checkin",
      isCheckedInToday: false,
      observedAt: 200,
    })

    expect(
      updated.methodKnowledge.methods["new-api:daily-checkin"]?.status,
    ).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: "disabled",
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: { source: "probe", observedAt: 200 },
    })
  })

  it("refreshes only the selected method from a canonical account", async () => {
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.WONG_GONGYI,
      supported: true,
      automaticExecutionEnabled: false,
    })
    const seenMethodIds: string[] = []

    const updated = await refreshSelectedStatus({
      config,
      siteType: SITE_TYPES.WONG_GONGYI,
      observedAt: 654,
      readStatus: async (methodId) => {
        seenMethodIds.push(methodId)
        return false
      },
    })

    expect(seenMethodIds).toEqual(["wong-gongyi:daily-checkin"])
    expect(
      updated.methodKnowledge.methods["wong-gongyi:daily-checkin"]?.status,
    ).toEqual({
      outcome: "known",
      today: "not_checked",
      evidence: { source: "probe", observedAt: 654 },
    })
  })

  it("discovers a unique method and reuses its status observation", async () => {
    const getStatus = vi.fn()
    const registry = createAutoCheckinMethodRegistry([
      {
        id: "new-api:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => ({
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
            status: {
              outcome: "known",
              availability: "disabled",
              today: "not_checked",
              evidence: { source: "probe", observedAt: 100 },
            },
          }),
          getStatus,
          checkIn: async () => ({ status: "success" }),
        },
      },
      {
        id: "veloera:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => ({
            outcome: "unsupported",
            evidence: { source: "probe", observedAt: 100 },
          }),
          checkIn: async () => ({ status: "success" }),
        },
      },
    ])
    const account = buildSiteAccount({ site_type: SITE_TYPES.NEW_API })
    const config = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: false,
      automaticExecutionEnabled: false,
    })

    const result = await discoverCheckInMethods({
      account,
      config,
      registry,
      observedAt: 100,
    })

    expect(result.decision).toEqual({
      outcome: "resolved",
      methodId: "new-api:daily-checkin",
    })
    expect(result.config.selection).toEqual({
      mode: "automatic",
      methodId: "new-api:daily-checkin",
    })
    expect(
      result.config.methodKnowledge.methods["new-api:daily-checkin"]?.status,
    ).toMatchObject({ availability: "disabled", today: "not_checked" })
    expect(getStatus).not.toHaveBeenCalled()
  })

  it("keeps manual selection sticky across an incomplete discovery", async () => {
    const abortSpy = vi.fn()
    const registry = createAutoCheckinMethodRegistry([
      {
        id: "new-api:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => ({
            outcome: "matched",
            evidence: { source: "probe", observedAt: 200 },
          }),
          checkIn: async () => ({ status: "success" }),
        },
      },
      {
        id: "veloera:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async ({ signal }) =>
            new Promise<never>(() =>
              signal?.addEventListener("abort", abortSpy),
            ),
          checkIn: async () => ({ status: "success" }),
        },
      },
    ])
    const account = buildSiteAccount({ site_type: SITE_TYPES.NEW_API })
    const automatic = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const config = setCheckInSelection({
      config: automatic,
      siteType: SITE_TYPES.NEW_API,
      mode: "manual",
      methodId: "new-api:daily-checkin",
      registry,
    })

    const result = await discoverCheckInMethods({
      account,
      config,
      registry,
      observedAt: 200,
      perAdapterTimeoutMs: 1,
      deadlineMs: 20,
    })

    expect(result.decision.outcome).toBe("unknown")
    expect(result.timedOutMethodIds).toEqual(["veloera:daily-checkin"])
    expect(abortSpy).toHaveBeenCalledOnce()
    expect(result.config.selection).toEqual({
      mode: "manual",
      methodId: "new-api:daily-checkin",
    })
  })

  it.each([
    {
      name: "multiple matches",
      outcomes: ["matched", "matched"] as const,
      decision: "ambiguous",
    },
    {
      name: "a match plus an unknown",
      outcomes: ["matched", "unknown"] as const,
      decision: "unknown",
    },
    {
      name: "all authoritative negatives",
      outcomes: ["unsupported", "unsupported"] as const,
      decision: "unsupported",
    },
  ])(
    "does not create a selection for $name",
    async ({ outcomes, decision }) => {
      const methodIds = [
        "new-api:daily-checkin",
        "veloera:daily-checkin",
      ] as const
      const registry = createAutoCheckinMethodRegistry(
        methodIds.map((id, index) => ({
          id,
          siteTypes: [SITE_TYPES.NEW_API],
          provider: {
            getReadiness: () => ({ ready: true }),
            detect: async () =>
              outcomes[index] === "matched"
                ? {
                    outcome: "matched" as const,
                    evidence: { source: "probe" as const, observedAt: 300 },
                  }
                : outcomes[index] === "unsupported"
                  ? {
                      outcome: "unsupported" as const,
                      evidence: { source: "probe" as const, observedAt: 300 },
                    }
                  : {
                      outcome: "unknown" as const,
                      reason: "network" as const,
                      attemptedAt: 300,
                    },
            checkIn: async () => ({ status: "success" as const }),
          },
        })),
      )

      const result = await discoverCheckInMethods({
        account: buildSiteAccount({ site_type: SITE_TYPES.NEW_API }),
        config: createCompatibilityCheckInConfig({
          siteType: SITE_TYPES.NEW_API,
          supported: false,
          automaticExecutionEnabled: true,
        }),
        registry,
        observedAt: 300,
      })

      expect(result.decision.outcome).toBe(decision)
      expect(result.config.selection).toEqual({ mode: "automatic" })
    },
  )

  it("turns a network adapter failure into unknown without blocking discovery", async () => {
    const registry = createAutoCheckinMethodRegistry([
      {
        id: "new-api:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => {
            throw new TypeError("Failed to fetch")
          },
          checkIn: async () => ({ status: "success" }),
        },
      },
    ])

    const result = await discoverCheckInMethods({
      account: buildSiteAccount({ site_type: SITE_TYPES.NEW_API }),
      config: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: false,
        automaticExecutionEnabled: true,
      }),
      registry,
      observedAt: 400,
    })

    expect(result.detections["new-api:daily-checkin"]).toEqual({
      outcome: "unknown",
      reason: "network",
      attemptedAt: 400,
    })
    expect(result.config.selection).toEqual({ mode: "automatic" })
  })

  it("does not mislabel an unstructured discovery failure as a network problem", async () => {
    const registry = createAutoCheckinMethodRegistry([
      {
        id: "new-api:daily-checkin",
        siteTypes: [SITE_TYPES.NEW_API],
        provider: {
          getReadiness: () => ({ ready: true }),
          detect: async () => {
            throw new Error("Invalid response")
          },
          checkIn: async () => ({ status: "success" }),
        },
      },
    ])

    const result = await discoverCheckInMethods({
      account: buildSiteAccount({ site_type: SITE_TYPES.NEW_API }),
      config: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: false,
        automaticExecutionEnabled: true,
      }),
      registry,
      observedAt: 401,
    })

    expect(result.detections["new-api:daily-checkin"]).toMatchObject({
      outcome: "unknown",
      reason: "invalid_response",
    })
  })

  it("leaves a matched method without status readback unchanged on refresh", async () => {
    const account = buildSiteAccount({
      site_type: SITE_TYPES.ANYROUTER,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.ANYROUTER,
        supported: true,
        automaticExecutionEnabled: false,
      }),
    })
    const original = structuredClone(account.checkIn)

    const updated = await refreshSelectedStatus({
      config: account.checkIn,
      siteType: account.site_type,
      account,
    })

    expect(updated).toEqual(original)
    expect(updated.selection).toEqual(account.checkIn.selection)
  })

  it("isolates a selected 404 without enumerating or replacing the selection", async () => {
    const account = buildSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    })
    const registration = autoCheckinMethodRegistry.resolveById(
      "new-api:daily-checkin",
    )!
    const originalGetStatus = registration.provider.getStatus
    registration.provider.getStatus = vi
      .fn()
      .mockRejectedValue({ statusCode: 404 })
    const enumerate = vi.spyOn(autoCheckinMethodRegistry, "getCandidates")

    try {
      const updated = await refreshSelectedStatus({
        config: account.checkIn,
        siteType: account.site_type,
        account,
        observedAt: 500,
      })

      expect(enumerate).not.toHaveBeenCalled()
      expect(updated.selection).toEqual(account.checkIn.selection)
      expect(updated.methodKnowledge.lastFullDiscoveryAt).toBe(
        account.checkIn.methodKnowledge.lastFullDiscoveryAt,
      )
      expect(
        updated.methodKnowledge.methods["new-api:daily-checkin"]?.detection,
      ).toEqual({
        outcome: "unsupported",
        evidence: { source: "probe", observedAt: 500 },
      })
    } finally {
      registration.provider.getStatus = originalGetStatus
    }
  })

  it("merges user-owned draft fields without overwriting newer system facts", () => {
    const original = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
      customCheckIn: {
        url: "https://old.example.invalid/check-in",
        isCheckedInToday: false,
      },
    })
    const latest = markSelectedCheckInExecuted({
      config: original,
      siteType: SITE_TYPES.NEW_API,
      observedAt: 789,
    })
    latest.customCheckIn = {
      ...latest.customCheckIn,
      isCheckedInToday: true,
      lastCheckInDate: "2026-08-10",
    }
    const draft = {
      ...original,
      automaticExecutionEnabled: false,
      customCheckIn: {
        ...original.customCheckIn,
        url: "https://new.example.invalid/check-in",
      },
    }

    const merged = mergeUserOwnedCheckInDraft({ latest, draft })

    expect(merged.automaticExecutionEnabled).toBe(false)
    expect(merged.selection).toEqual(latest.selection)
    expect(merged.methodKnowledge).toEqual(latest.methodKnowledge)
    expect(merged.customCheckIn).toEqual({
      url: "https://new.example.invalid/check-in",
      isCheckedInToday: true,
      lastCheckInDate: "2026-08-10",
      redeemUrl: undefined,
      openRedeemWithCheckIn: undefined,
      turnstilePreTrigger: undefined,
    })
  })

  it("does not apply an older discovery round with the same timestamp", () => {
    const latest = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    latest.methodKnowledge.lastFullDiscoveryAt = 500
    const draft = structuredClone(latest)
    draft.methodKnowledge.methods["new-api:daily-checkin"]!.detection = {
      outcome: "unsupported",
      evidence: { source: "probe", observedAt: 500 },
    }

    const merged = mergeDiscoveredCheckInDraft({
      latest,
      draft,
      candidateMethodIds: ["new-api:daily-checkin"],
      discoveryBaseSelection: latest.selection,
    })

    expect(
      merged.methodKnowledge.methods["new-api:daily-checkin"]?.detection
        .outcome,
    ).toBe("matched")
  })

  it("merges refreshed status without rolling back newer user fields", () => {
    const opened = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: true,
    })
    const refreshed = markSelectedCheckInExecuted({
      config: opened,
      siteType: SITE_TYPES.NEW_API,
      observedAt: 987,
    })
    const latest = {
      ...opened,
      automaticExecutionEnabled: false,
      customCheckIn: { url: "https://latest.example.invalid/check-in" },
    }

    const merged = mergeRefreshedCheckInStatus({ latest, refreshed })

    expect(merged.automaticExecutionEnabled).toBe(false)
    expect(merged.customCheckIn).toEqual(latest.customCheckIn)
    expect(
      getSelectedCheckInStatus({
        config: merged,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toMatchObject({
      today: "checked",
      evidence: { source: "execution", observedAt: 987 },
    })
  })

  it("rechecks a cached disabled method and executes after the site enables it", async () => {
    const methodId = "new-api:daily-checkin"
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    account.checkIn.methodKnowledge.methods[methodId]!.status = {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: 100,
      },
    }
    const getStatus = vi
      .spyOn(registration.provider, "getStatus")
      .mockResolvedValue({
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: 200,
        },
      })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result.kind).toBe("executed")
    expect(getStatus).toHaveBeenCalledOnce()
    expect(checkInRequest).toHaveBeenCalledOnce()
    expect(getStatus.mock.invocationCallOrder[0]).toBeLessThan(
      checkInRequest.mock.invocationCallOrder[0],
    )
  })

  it("does not post when execution-time status says the method is disabled", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: 200,
      },
    })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({ kind: "skipped", reason: "method_disabled" })
    expect(checkInRequest).not.toHaveBeenCalled()
  })

  it("executes when the optional status readback cannot connect", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({ kind: "executed" })
    expect(checkInRequest).toHaveBeenCalledOnce()
  })

  it("executes when the optional status readback returns an invalid response", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockRejectedValue(
      new Error("Invalid response payload"),
    )
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({ kind: "executed" })
    expect(checkInRequest).toHaveBeenCalledOnce()
  })

  it.each([
    [new TypeError("Failed to fetch"), "network_error"],
    [
      Object.assign(new Error("Request timed out"), { statusCode: 408 }),
      "timeout",
    ],
    [new Error("Invalid response payload"), "status_unavailable"],
  ] as const)(
    "requires a confirmed status before a retry mutation after %s",
    async (statusError, expectedReason) => {
      const registration = getNewApiExecutionRegistration()
      const account = createNewApiExecutionAccount()
      vi.spyOn(registration.provider, "getStatus").mockRejectedValue(
        statusError,
      )
      const checkInRequest = vi
        .spyOn(registration.provider, "checkIn")
        .mockResolvedValue({ status: "success" })

      const result = await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: createExecutionContext(),
        requireStatusConfirmationBeforeMutation: true,
      })

      expect(result).toMatchObject({
        kind: "skipped",
        reason: expectedReason,
        retryable: true,
      })
      expect(checkInRequest).not.toHaveBeenCalled()
    },
  )

  it("requires a usable status observation before a retry mutation", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue(undefined)
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
      requireStatusConfirmationBeforeMutation: true,
    })

    expect(result).toMatchObject({
      kind: "skipped",
      reason: "status_unavailable",
      retryable: true,
    })
    expect(checkInRequest).not.toHaveBeenCalled()
  })

  it("does not treat an unknown status observation as retry confirmation", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
      attemptedAt: 200,
    })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
      requireStatusConfirmationBeforeMutation: true,
    })

    expect(result).toMatchObject({
      kind: "skipped",
      reason: "status_unavailable",
      retryable: true,
    })
    expect(checkInRequest).not.toHaveBeenCalled()
  })

  it("marks a failed mutation retryable only when the next attempt can confirm status", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: 200,
      },
    })
    vi.spyOn(registration.provider, "checkIn").mockResolvedValue({
      status: "failed",
      rawMessage: "Example deployment failure",
    })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({ kind: "executed", retryable: true })
  })

  it("reconciles an uncertain mutation with one authoritative checked read", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    const requestOrder: string[] = []
    vi.spyOn(registration.provider, "getStatus")
      .mockImplementationOnce(async () => {
        requestOrder.push("status-before")
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: Date.now(),
          },
        }
      })
      .mockImplementationOnce(async () => {
        requestOrder.push("status-after")
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: Date.now(),
          },
        }
      })
    vi.spyOn(registration.provider, "checkIn").mockImplementation(async () => {
      requestOrder.push("mutation")
      return { status: "uncertain" }
    })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({
      kind: "executed",
      methodId: "new-api:daily-checkin",
      result: { status: "success", reconciliation: "checked" },
      retryable: false,
    })
    expect(requestOrder).toEqual(["status-before", "mutation", "status-after"])
  })

  it("passes transport lifecycle evidence through the selected-method boundary", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: 200,
      },
    })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockImplementation(async (_account, context) => {
        context.mutationLifecycle?.onDispatch()
        context.mutationLifecycle?.onResponse()
        expect(context.mutationLifecycle).toMatchObject({
          dispatched: true,
          responseReceived: true,
        })
        return { status: "success" }
      })

    await expect(
      executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: createExecutionContext(),
      }),
    ).resolves.toMatchObject({ kind: "executed", retryable: false })
    expect(checkInRequest).toHaveBeenCalledOnce()
  })

  it.each([
    {
      name: "authoritatively not checked",
      status: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: Date.now(),
        },
      },
      reconciliation: "not_checked",
    },
    {
      name: "unknown",
      status: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
        reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
        attemptedAt: Date.now(),
      },
      reconciliation: "unknown",
    },
    {
      name: "unavailable",
      status: undefined,
      reconciliation: "unavailable",
    },
    {
      name: "known without today's state",
      status: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: Date.now(),
        },
      },
      reconciliation: "unknown",
    },
  ] as const)(
    "keeps an uncertain mutation unresolved when reconciliation is $name",
    async ({ status, reconciliation }) => {
      const registration = getNewApiExecutionRegistration()
      const account = createNewApiExecutionAccount()
      vi.spyOn(registration.provider, "getStatus")
        .mockResolvedValueOnce({
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: Date.now(),
          },
        })
        .mockResolvedValueOnce(status)
      const checkInRequest = vi
        .spyOn(registration.provider, "checkIn")
        .mockResolvedValue({ status: "uncertain" })

      const result = await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: createExecutionContext(),
      })

      expect(result).toMatchObject({
        kind: "executed",
        result: { status: "uncertain", reconciliation },
        retryable: false,
      })
      expect(checkInRequest).toHaveBeenCalledOnce()
    },
  )

  it("keeps an uncertain mutation unresolved when reconciliation is unavailable", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus")
      .mockResolvedValueOnce({
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: Date.now(),
        },
      })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "uncertain" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "uncertain", reconciliation: "unavailable" },
      retryable: false,
    })
    expect(checkInRequest).toHaveBeenCalledOnce()
  })

  it("executes a no-readback method but never retries its uncertain result", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(
      "anyrouter:daily-checkin",
    )
    if (!registration) throw new Error("AnyRouter check-in is not registered")
    const account = buildSiteAccount({
      site_type: SITE_TYPES.ANYROUTER,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.ANYROUTER,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "uncertain" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(result).toMatchObject({
      kind: "executed",
      result: { status: "uncertain", reconciliation: "unavailable" },
      retryable: false,
    })
    expect(checkInRequest).toHaveBeenCalledOnce()
  })

  it("starts a later execution with status and does not replay an uncertain mutation", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    const requestOrder: string[] = []
    vi.spyOn(registration.provider, "getStatus")
      .mockImplementationOnce(async () => {
        requestOrder.push("status-before")
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: Date.now(),
          },
        }
      })
      .mockImplementationOnce(async () => {
        requestOrder.push("reconcile")
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
          reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
          attemptedAt: Date.now(),
        }
      })
      .mockImplementationOnce(async () => {
        requestOrder.push("status-after-reentry")
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: Date.now(),
          },
        }
      })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockImplementation(async () => {
        requestOrder.push("mutation")
        return { status: "uncertain" }
      })

    await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })
    const reentryResult = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
    })

    expect(reentryResult).toMatchObject({
      kind: "skipped",
      reason: "already_checked",
    })
    expect(checkInRequest).toHaveBeenCalledOnce()
    expect(requestOrder).toEqual([
      "status-before",
      "mutation",
      "reconcile",
      "status-after-reentry",
    ])
  })

  it.each(["authentication_required", "permission_denied"] as const)(
    "does not retry a %s mutation failure",
    async (reasonCode) => {
      const registration = getNewApiExecutionRegistration()
      const account = createNewApiExecutionAccount()
      vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: 200,
        },
      })
      vi.spyOn(registration.provider, "checkIn").mockResolvedValue({
        status: "failed",
        reasonCode,
      })

      const result = await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: createExecutionContext(),
      })

      expect(result).toMatchObject({ kind: "executed", retryable: false })
    },
  )

  it("blocks an automatic retry when the method has no safe status readback", async () => {
    const registration = autoCheckinMethodRegistry.resolveById(
      "anyrouter:daily-checkin",
    )
    if (!registration) throw new Error("AnyRouter check-in is not registered")
    const account = buildSiteAccount({
      site_type: SITE_TYPES.ANYROUTER,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.ANYROUTER,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "failed", rawMessage: "Example failure" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
      requireStatusConfirmationBeforeMutation: true,
    })

    expect(result).toMatchObject({
      kind: "skipped",
      reason: "status_unavailable",
      retryable: false,
    })
    expect(checkInRequest).not.toHaveBeenCalled()
  })

  it.each([
    [401, "authentication_required", false],
    [403, "permission_denied", false],
    [408, "timeout", true],
    [500, "source_unavailable", true],
  ] as const)(
    "classifies an HTTP %s optional status failure as %s",
    async (statusCode, expectedReason, shouldExecute) => {
      const registration = getNewApiExecutionRegistration()
      const account = createNewApiExecutionAccount()
      vi.spyOn(registration.provider, "getStatus").mockRejectedValue(
        Object.assign(new Error(`Request failed with ${statusCode}`), {
          statusCode,
        }),
      )
      const checkInRequest = vi
        .spyOn(registration.provider, "checkIn")
        .mockResolvedValue({ status: "success" })

      const result = await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: createExecutionContext(),
      })

      if (shouldExecute) {
        expect(result).toMatchObject({ kind: "executed" })
        expect(checkInRequest).toHaveBeenCalledOnce()
      } else {
        expect(result).toMatchObject({
          kind: "skipped",
          reason: expectedReason,
        })
        expect(checkInRequest).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    ["returns no account", async () => null],
    [
      "cannot reload the account",
      async () => {
        throw new Error("Example storage failure")
      },
    ],
  ])(
    "skips execution when revalidation %s",
    async (_name, revalidateAccount) => {
      const registration = getNewApiExecutionRegistration()
      const account = createNewApiExecutionAccount()
      vi.spyOn(registration.provider, "getStatus").mockResolvedValue(undefined)
      const checkInRequest = vi
        .spyOn(registration.provider, "checkIn")
        .mockResolvedValue({ status: "success" })

      const result = await executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled: true,
        context: createExecutionContext(),
        revalidateAccount,
      })

      expect(result).toMatchObject({
        kind: "skipped",
        reason: "account_unavailable",
      })
      expect(checkInRequest).not.toHaveBeenCalled()
    },
  )

  it("exposes unavailable provider readiness without leaking the provider", () => {
    const account = buildSiteAccount({
      site_type: SITE_TYPES.UNKNOWN,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.UNKNOWN,
        supported: false,
        automaticExecutionEnabled: true,
      }),
    })

    expect(
      inspectSelectedCheckInCompatibility({
        account,
        globalAutomaticExecutionEnabled: true,
      }),
    ).toMatchObject({
      providerReadiness: null,
      providerAvailable: false,
    })
  })

  it("revalidates the latest account intent before posting", async () => {
    const registration = getNewApiExecutionRegistration()
    const account = createNewApiExecutionAccount()
    vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: 200,
      },
    })
    const checkInRequest = vi
      .spyOn(registration.provider, "checkIn")
      .mockResolvedValue({ status: "success" })

    const result = await executeSelectedCheckIn({
      account,
      globalAutomaticExecutionEnabled: true,
      context: createExecutionContext(),
      revalidateAccount: async (refreshedConfig) => ({
        ...account,
        checkIn: {
          ...(refreshedConfig ?? account.checkIn),
          automaticExecutionEnabled: false,
        },
      }),
    })

    expect(result).toMatchObject({
      kind: "skipped",
      reason: "automatic_execution_disabled",
    })
    expect(checkInRequest).not.toHaveBeenCalled()
  })

  it.each([
    {
      siteType: SITE_TYPES.NEW_API,
      missingTokenReady: false,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: false,
    },
    {
      siteType: SITE_TYPES.VELOERA,
      missingTokenReady: false,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: false,
    },
    {
      siteType: SITE_TYPES.WONG_GONGYI,
      missingTokenReady: false,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: false,
    },
    {
      siteType: SITE_TYPES.ANYROUTER,
      missingTokenReady: true,
      cookieWithoutTokenReady: true,
      missingUserReady: false,
      missingAuthTypeWithoutTokenReady: true,
    },
    {
      siteType: SITE_TYPES.VO_API_V2,
      missingTokenReady: false,
      cookieWithoutTokenReady: false,
      missingUserReady: true,
      missingAuthTypeWithoutTokenReady: false,
    },
  ])(
    "preserves V6 runnable and auth parity for $siteType",
    async ({
      siteType,
      missingTokenReady,
      cookieWithoutTokenReady,
      missingUserReady,
      missingAuthTypeWithoutTokenReady,
    }) => {
      const methodId = getLegacyAutoCheckinMethodIds(siteType)[0]
      const registration = methodId
        ? autoCheckinMethodRegistry.resolveById(methodId)
        : null
      expect(registration).toBeDefined()
      if (!registration) throw new Error(`Missing registration for ${siteType}`)
      if (registration.provider.getStatus) {
        vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
          today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
          evidence: {
            source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
            observedAt: 200,
          },
        })
      }

      const cases = [
        {
          name: "valid access-token account",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "test-token",
          providerReady: true,
        },
        {
          name: "missing access token",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "",
          providerReady: missingTokenReady,
        },
        {
          name: "cookie auth without token",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.Cookie,
          userId: "7",
          accessToken: "",
          providerReady: cookieWithoutTokenReady,
        },
        {
          name: "missing user id",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "",
          accessToken: "test-token",
          providerReady: missingUserReady,
        },
        {
          name: "legacy missing auth type without token",
          automaticExecutionEnabled: true,
          disabled: false,
          authType: undefined,
          userId: "7",
          accessToken: "",
          providerReady: missingAuthTypeWithoutTokenReady,
        },
        {
          name: "account disabled",
          automaticExecutionEnabled: true,
          disabled: true,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "test-token",
          providerReady: true,
        },
        {
          name: "automatic execution disabled",
          automaticExecutionEnabled: false,
          disabled: false,
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "test-token",
          providerReady: true,
        },
      ] as const

      for (const testCase of cases) {
        const baseAccount = buildSiteAccount()
        const account = buildSiteAccount({
          site_type: siteType,
          disabled: testCase.disabled,
          authType: testCase.authType,
          account_info: {
            ...baseAccount.account_info,
            id: testCase.userId,
            access_token: testCase.accessToken,
          },
          checkIn: createCompatibilityCheckInConfig({
            siteType,
            supported: true,
            automaticExecutionEnabled: testCase.automaticExecutionEnabled,
          }),
        })
        expect(
          registration.provider.getReadiness(account).ready,
          testCase.name,
        ).toBe(testCase.providerReady)

        const checkIn = vi
          .spyOn(registration.provider, "checkIn")
          .mockResolvedValue({ status: "success" })
        const result = await executeSelectedCheckIn({
          account,
          globalAutomaticExecutionEnabled: true,
          context: {
            tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
            protectionBypassExecution: userCommandExecution(
              PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
            ),
          },
        })
        const preMigrationRunnable =
          !testCase.disabled &&
          testCase.automaticExecutionEnabled &&
          testCase.providerReady

        expect(result.kind === "executed", testCase.name).toBe(
          preMigrationRunnable,
        )
        expect(checkIn, testCase.name).toHaveBeenCalledTimes(
          preMigrationRunnable ? 1 : 0,
        )
        checkIn.mockRestore()
      }
    },
  )
})
