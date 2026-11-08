import { afterEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { replaceCheckInMethodStatus } from "~/services/checkin/autoCheckin/state"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  automaticExecution,
  userCommandExecution,
} from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

afterEach(() => vi.restoreAllMocks())

it.each(["daily-first", "manual-first"] as const)(
  "%s: overlapping daily and manual admission sends one check-in mutation",
  async (order) => {
    const registration = autoCheckinMethodRegistry.resolveById(
      "new-api:daily-checkin",
    )
    if (!registration?.provider.getStatus)
      throw new Error("Missing New API provider")
    const account = buildSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      checkIn: createCompatibilityCheckInConfig({
        siteType: SITE_TYPES.NEW_API,
        supported: true,
        automaticExecutionEnabled: true,
      }),
    })
    let checked = false
    const statusRead = vi
      .spyOn(registration.provider, "getStatus")
      .mockImplementation(async () => ({
        outcome: "known",
        availability: "enabled",
        today: checked ? "checked" : "not_checked",
        evidence: { source: "probe", observedAt: Date.now() },
      }))
    const mutation = vi
      .spyOn(newApiFamilyRequests, "envelope")
      .mockImplementation(async () => {
        checked = true
        return { success: true, message: "checked", data: null }
      })
    const daily = {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: automaticExecution(
        PROTECTION_BYPASS_FEATURES.Checkin,
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
      ),
    }
    const manual = {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      ),
    }
    const contexts = order === "daily-first" ? [daily, manual] : [manual, daily]
    const results = await Promise.all(
      contexts.map((context) =>
        executeSelectedCheckIn({
          account,
          globalAutomaticExecutionEnabled: true,
          context,
        }),
      ),
    )
    expect(results).toHaveLength(2)
    expect(statusRead).toHaveBeenCalled()
    expect(
      mutation.mock.calls.map(([, request]) => ({
        endpoint: request.endpoint,
        method: request.options?.method,
      })),
    ).toEqual([{ endpoint: "/api/user/checkin", method: "POST" }])
  },
)

/** Controls when an in-flight provider attempt settles. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const dailyContext = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: automaticExecution(
    PROTECTION_BYPASS_FEATURES.Checkin,
    PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
  ),
}
const manualContext = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Options,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}

/** Provides an account and a held mutation for overlapping public execution calls. */
function setup(readback = true, nonRepeatSafe = false) {
  const siteType = nonRepeatSafe
    ? SITE_TYPES.SUB2API
    : readback
      ? SITE_TYPES.NEW_API
      : SITE_TYPES.ANYROUTER
  const registration = autoCheckinMethodRegistry.resolveById(
    nonRepeatSafe
      ? "hiyo:daily-checkin"
      : readback
        ? "new-api:daily-checkin"
        : "anyrouter:daily-checkin",
  )!
  const account = buildSiteAccount({
    site_type: siteType,
    checkIn: createCompatibilityCheckInConfig({
      siteType,
      supported: true,
      automaticExecutionEnabled: true,
    }),
  })
  if (nonRepeatSafe) {
    account.checkIn = buildCheckInConfig({
      automaticExecutionEnabled: true,
      selection: { mode: "manual", methodId: "hiyo:daily-checkin" },
      methodKnowledge: {
        methods: {
          "hiyo:daily-checkin": {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
          },
        },
      },
    })
    vi.spyOn(registration.provider, "getReadiness").mockReturnValue({
      ready: true,
    })
  }
  const status = readback
    ? vi.spyOn(registration.provider, "getStatus").mockResolvedValue({
        outcome: "known",
        availability: "enabled",
        today: "not_checked",
        evidence: { source: "probe", observedAt: Date.now() },
      })
    : undefined
  const started = deferred<void>()
  const completion = deferred<AutoCheckinProviderOutcome>()
  const checkIn = vi
    .spyOn(registration.provider, "checkIn")
    .mockImplementationOnce(async () => {
      started.resolve()
      return completion.promise
    })
    .mockResolvedValue({ status: "success" })
  const input = {
    account,
    context: manualContext,
    globalAutomaticExecutionEnabled: true,
  }
  return { registration, account, input, status, started, completion, checkIn }
}

it.each([true, false])(
  "coalesces three manual submissions even with stale or absent readback (%s)",
  async (readback) => {
    const { input, started, completion, checkIn } = setup(readback)
    const first = executeSelectedCheckIn(input)
    await started.promise
    const second = executeSelectedCheckIn(input)
    const third = executeSelectedCheckIn(input)
    completion.resolve({ status: "success" })
    const results = await Promise.all([first, second, third])
    expect(checkIn).toHaveBeenCalledOnce()
    expect(results.slice(1)).toMatchObject([
      { kind: "executed", result: { status: "success" }, reused: true },
      { kind: "executed", result: { status: "success" }, reused: true },
    ])
  },
)

it.each([true, false])(
  "does not replay an overlapping uncertain mutation (%s)",
  async (readback) => {
    const { input, started, completion, checkIn, status } = setup(readback)
    const first = executeSelectedCheckIn({ ...input, context: dailyContext })
    await started.promise
    status?.mockResolvedValue({
      outcome: "unknown",
      reason: "network",
      attemptedAt: Date.now(),
    })
    const second = executeSelectedCheckIn(input)
    completion.resolve({
      status: "uncertain",
      reasonCode: "checkin_unconfirmed",
    })
    const results = await Promise.all([first, second])
    expect(checkIn).toHaveBeenCalledOnce()
    expect(results[1]).toMatchObject({
      kind: "executed",
      result: { status: "uncertain" },
    })
  },
)

it("keeps different accounts parallel and admits a later independent attempt", async () => {
  const { input, started, completion, checkIn } = setup()
  const first = executeSelectedCheckIn(input)
  await started.promise
  const other = await executeSelectedCheckIn({
    ...input,
    account: { ...input.account, id: "other" },
  })
  expect(other).toMatchObject({
    kind: "executed",
    result: { status: "success" },
  })
  completion.resolve({ status: "success" })
  await first
  await executeSelectedCheckIn(input)
  expect(checkIn).toHaveBeenCalledTimes(3)
})

it("shares one blocked status read without spending another retry attempt", async () => {
  const { input, status, checkIn } = setup()
  const entered = deferred<void>()
  const release = deferred<void>()
  status!.mockImplementationOnce(async () => {
    entered.resolve()
    await release.promise
    return { outcome: "unknown", reason: "network", attemptedAt: Date.now() }
  })
  const request = {
    ...input,
    context: dailyContext,
    requireStatusConfirmationBeforeMutation: true,
  }
  const first = executeSelectedCheckIn(request)
  await entered.promise
  const second = executeSelectedCheckIn(request)
  release.resolve()
  const [owner, waiter] = await Promise.all([first, second])
  expect(owner).toMatchObject({ kind: "blocked", retryable: true })
  expect(waiter).toMatchObject({ ...owner, reused: true })
  expect(status).toHaveBeenCalledOnce()
  expect(checkIn).not.toHaveBeenCalled()
})

it.each(["authentication_required", "manual_verification_required"] as const)(
  "allows a waiting manual command to recover an automatic %s failure with its own authority",
  async (reasonCode) => {
    const { input, started, completion, checkIn } = setup()
    const first = executeSelectedCheckIn({ ...input, context: dailyContext })
    await started.promise
    const second = executeSelectedCheckIn(input)
    completion.resolve({ status: "failed", reasonCode })
    const results = await Promise.all([first, second])
    expect(results[1]).toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(checkIn).toHaveBeenCalledTimes(2)
    expect(checkIn.mock.calls[1]?.[1]).toMatchObject(manualContext)
  },
)

it("requires fresh status for manual recovery after waiting", async () => {
  const { input, started, completion, checkIn, status } = setup()
  const first = executeSelectedCheckIn({ ...input, context: dailyContext })
  await started.promise
  status!.mockResolvedValue({
    outcome: "unknown",
    reason: "network",
    attemptedAt: Date.now(),
  })
  const second = executeSelectedCheckIn(input)
  completion.resolve({
    status: "failed",
    reasonCode: "manual_verification_required",
  })
  const results = await Promise.all([first, second])
  expect(results[1]).toMatchObject({ kind: "blocked", reason: "network_error" })
  expect(checkIn).toHaveBeenCalledOnce()
})

it("does not replay a failed non-repeat-safe method even when readback permits a claim", async () => {
  const { input, started, completion, checkIn } = setup(true, true)
  const first = executeSelectedCheckIn({ ...input, context: dailyContext })
  await started.promise
  const second = executeSelectedCheckIn(input)
  completion.resolve({
    status: "failed",
    reasonCode: "manual_verification_required",
  })
  await first
  await expect(second).resolves.toMatchObject({
    kind: "executed",
    result: { status: "failed" },
  })
  expect(checkIn).toHaveBeenCalledOnce()
})

it.each([false, true])(
  "allows a manual command after an automatic skip (non-repeat-safe %s)",
  async (nonRepeatSafe) => {
    const { input, checkIn } = setup(nonRepeatSafe, nonRepeatSafe)
    checkIn.mockReset().mockResolvedValue({ status: "success" })
    const enteredAdmission = deferred<void>()
    const automaticEnabled = deferred<boolean>()
    const first = executeSelectedCheckIn({
      ...input,
      context: dailyContext,
      isAutomaticExecutionEnabled: async () => {
        enteredAdmission.resolve()
        return automaticEnabled.promise
      },
    })
    await enteredAdmission.promise
    const second = executeSelectedCheckIn(input)
    automaticEnabled.resolve(false)
    await expect(first).resolves.toMatchObject({
      kind: "skipped",
      reason: "global_automatic_execution_disabled",
    })
    await expect(second).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success" },
    })
    expect(checkIn).toHaveBeenCalledOnce()
  },
)

it("refreshes a cached disabled method before a queued manual recovery", async () => {
  const { input, started, completion, checkIn } = setup()
  const first = executeSelectedCheckIn({ ...input, context: dailyContext })
  await started.promise
  const disabledConfig = replaceCheckInMethodStatus({
    config: input.account.checkIn,
    methodId: "new-api:daily-checkin",
    status: {
      outcome: "known",
      availability: "disabled",
      evidence: { source: "probe", observedAt: Date.now() },
    },
  })
  const second = executeSelectedCheckIn({
    ...input,
    revalidateAccount: async (refreshedConfig) => ({
      ...input.account,
      checkIn: refreshedConfig ?? disabledConfig,
    }),
  })
  completion.resolve({
    status: "failed",
    reasonCode: "authentication_required",
  })
  await first
  await expect(second).resolves.toMatchObject({
    kind: "executed",
    result: { status: "success" },
  })
  expect(checkIn).toHaveBeenCalledTimes(2)
})

it.each(["automatic-follower", "no-readback"])(
  "does not queue a second mutation for a failed %s",
  async (scenario) => {
    const { input, started, completion, checkIn } = setup(
      scenario !== "no-readback",
    )
    const first = executeSelectedCheckIn({
      ...input,
      context: scenario === "no-readback" ? dailyContext : manualContext,
    })
    await started.promise
    const second = executeSelectedCheckIn({
      ...input,
      context: scenario === "no-readback" ? manualContext : dailyContext,
    })
    completion.resolve({
      status: "failed",
      reasonCode: "manual_verification_required",
    })
    const results = await Promise.all([first, second])
    expect(results[1]).toMatchObject({
      kind: "executed",
      result: { status: "failed" },
    })
    expect(checkIn).toHaveBeenCalledOnce()
  },
)

it.each([
  ["removed", () => null, "account_unavailable"],
  [
    "identity",
    (account: SiteAccount) => ({
      ...account,
      site_url: "https://replacement.example",
    }),
    "account_unavailable",
  ],
  [
    "disabled",
    (account: SiteAccount) => ({ ...account, disabled: true }),
    "account_disabled",
  ],
  [
    "selection",
    (account: SiteAccount) => ({
      ...account,
      checkIn: {
        ...account.checkIn,
        selection: {
          mode: "manual" as const,
          methodId: "anyrouter:daily-checkin" as const,
        },
      },
    }),
    "method_unavailable",
  ],
] as const)(
  "revalidates a queued account before any stale status request when %s",
  async (_label, change, reason) => {
    const { input, started, completion, status, checkIn } = setup()
    const first = executeSelectedCheckIn({ ...input, context: dailyContext })
    await started.promise
    const second = executeSelectedCheckIn({
      ...input,
      revalidateAccount: async () => change(input.account),
    })
    completion.resolve({
      status: "failed",
      reasonCode: "authentication_required",
    })
    await first
    const result = await second
    expect(result).toMatchObject({ kind: "skipped", reason })
    // Only the first execution's initial and reconciliation reads are allowed.
    expect(status).toHaveBeenCalledTimes(2)
    expect(checkIn).toHaveBeenCalledOnce()
  },
)

it("honors disabled automatic intent after waiting without another network request", async () => {
  const { input, started, completion, status, checkIn } = setup()
  const first = executeSelectedCheckIn(input)
  await started.promise
  const second = executeSelectedCheckIn({
    ...input,
    context: dailyContext,
    isAutomaticExecutionEnabled: async () => false,
  })
  completion.resolve({
    status: "failed",
    reasonCode: "manual_verification_required",
  })
  const results = await Promise.all([first, second])
  expect(results[1]).toMatchObject({
    kind: "skipped",
    reason: "global_automatic_execution_disabled",
  })
  expect(status).toHaveBeenCalledTimes(2)
  expect(checkIn).toHaveBeenCalledOnce()
})

it.each(["global", "automatic", "account"] as const)(
  "retains the completed reward when a queued caller becomes %s disabled",
  async (disabled) => {
    const { input, started, completion, checkIn } = setup()
    const first = executeSelectedCheckIn(input)
    await started.promise
    const second = executeSelectedCheckIn({
      ...input,
      context: dailyContext,
      isAutomaticExecutionEnabled: async () => disabled !== "global",
      revalidateAccount: async () => ({
        ...input.account,
        disabled: disabled === "account",
        checkIn: {
          ...input.account.checkIn,
          automaticExecutionEnabled: disabled !== "automatic",
        },
      }),
    })
    completion.resolve({ status: "success", reward: { quota: 95000 } })
    const [owner, waiter] = await Promise.all([first, second])
    expect(waiter).toMatchObject({ ...owner, reused: true })
    expect(checkIn).toHaveBeenCalledOnce()
  },
)

it("blocks a queued command when the saved account cannot be reloaded", async () => {
  const { input, started, completion, status, checkIn } = setup()
  const first = executeSelectedCheckIn({ ...input, context: dailyContext })
  await started.promise
  const second = executeSelectedCheckIn({
    ...input,
    revalidateAccount: async () => {
      throw new Error("Account storage unavailable")
    },
  })
  completion.resolve({
    status: "failed",
    reasonCode: "authentication_required",
  })
  await first
  await expect(second).resolves.toMatchObject({
    kind: "blocked",
    reason: "account_unavailable",
    retryable: false,
  })
  expect(status).toHaveBeenCalledTimes(2)
  expect(checkIn).toHaveBeenCalledOnce()
})

it("skips overlapping commands when the account has no selected method", async () => {
  const { input, status, checkIn } = setup()
  const account = {
    ...input.account,
    checkIn: createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: false,
      automaticExecutionEnabled: true,
    }),
  }
  const results = await Promise.all(
    [dailyContext, manualContext].map((context) =>
      executeSelectedCheckIn({ ...input, account, context }),
    ),
  )
  expect(results).toEqual([
    { kind: "skipped", reason: "no_selected_method" },
    { kind: "skipped", reason: "no_selected_method" },
  ])
  expect(status).not.toHaveBeenCalled()
  expect(checkIn).not.toHaveBeenCalled()
})

it("respects provider ownership before reusing an overlapping completion", async () => {
  const { input, started, completion, checkIn } = setup()
  const first = executeSelectedCheckIn(input)
  await started.promise
  const second = executeSelectedCheckIn({
    ...input,
    loginProviderClaimedByAnother: true,
  })
  completion.resolve({ status: "success" })
  await first
  await expect(second).resolves.toEqual({
    kind: "skipped",
    reason: "login_provider_in_use",
  })
  expect(checkIn).toHaveBeenCalledOnce()
})

it("does not share completion across account identities with the same saved id", async () => {
  const { input, started, completion, checkIn } = setup()
  const first = executeSelectedCheckIn(input)
  await started.promise
  const second = executeSelectedCheckIn({
    ...input,
    account: { ...input.account, site_url: "https://replacement.example" },
  })
  completion.resolve({ status: "success" })
  await Promise.all([first, second])
  expect(checkIn).toHaveBeenCalledTimes(2)
})

it("shares the method actually executed after selection changes during confirmation", async () => {
  const { input, started, completion, checkIn, status } = setup(true, true)
  const originalMethod = autoCheckinMethodRegistry.resolveById(
    "denxio:daily-checkin",
  )!
  const detection = {
    outcome: "matched" as const,
    evidence: { source: "probe" as const, observedAt: 100 },
  }
  vi.spyOn(originalMethod.provider, "detect").mockResolvedValue(detection)
  vi.spyOn(originalMethod.provider, "getStatus").mockResolvedValue({
    outcome: "known",
    availability: "enabled",
    today: "not_checked",
    evidence: { source: "probe", observedAt: 100 },
  })
  const latestAccount = {
    ...input.account,
    checkIn: {
      ...input.account.checkIn,
      methodKnowledge: {
        methods: {
          ...input.account.checkIn.methodKnowledge.methods,
          "denxio:daily-checkin": { detection },
        },
      },
    },
  }
  const first = executeSelectedCheckIn({
    ...input,
    account: {
      ...input.account,
      checkIn: buildCheckInConfig({
        automaticExecutionEnabled: true,
        selection: { mode: "manual", methodId: "denxio:daily-checkin" },
      }),
    },
    revalidateAccount: async () => latestAccount,
  })
  await started.promise
  status!.mockResolvedValueOnce({
    outcome: "unknown",
    reason: "network",
    attemptedAt: Date.now(),
  })
  const second = executeSelectedCheckIn({
    ...input,
    account: {
      ...input.account,
      checkIn: buildCheckInConfig({
        automaticExecutionEnabled: true,
        selection: { mode: "manual", methodId: "denxio:daily-checkin" },
      }),
    },
    revalidateAccount: async () => latestAccount,
  })
  completion.resolve({ status: "uncertain", reasonCode: "checkin_unconfirmed" })
  await expect(first).resolves.toMatchObject({
    kind: "executed",
    methodId: "hiyo:daily-checkin",
    result: { status: "uncertain" },
  })
  const secondResult = await second
  expect(checkIn).toHaveBeenCalledOnce()
  expect(secondResult).toMatchObject({
    kind: "executed",
    methodId: "hiyo:daily-checkin",
    result: { status: "uncertain" },
  })
})

it.each([false, true])(
  "retains the successful reward for overlapping callers (cached checked %s)",
  async (cachedChecked) => {
    const { input, started, completion, checkIn } = setup()
    const first = executeSelectedCheckIn(input)
    await started.promise
    const second = executeSelectedCheckIn({
      ...input,
      ...(cachedChecked
        ? {
            revalidateAccount: async () => ({
              ...input.account,
              checkIn: replaceCheckInMethodStatus({
                config: input.account.checkIn,
                methodId: "new-api:daily-checkin",
                status: {
                  outcome: "known",
                  availability: "enabled",
                  today: "checked",
                  evidence: { source: "probe", observedAt: Date.now() },
                },
              }),
            }),
          }
        : {}),
    })
    completion.resolve({ status: "success", reward: { quota: 95000 } })
    const [winner, follower] = await Promise.all([first, second])
    expect(follower).toMatchObject({
      kind: "executed",
      result: { status: "success", reward: { quota: 95000 } },
      reused: true,
    })
    expect(follower).toMatchObject({ ...winner, reused: true })
    expect(checkIn).toHaveBeenCalledOnce()
  },
)

it("retains a completed mutation when an intervening automatic waiter is disabled", async () => {
  const { input, started, completion, checkIn } = setup()
  const first = executeSelectedCheckIn(input)
  await started.promise
  const disabled = executeSelectedCheckIn({
    ...input,
    context: dailyContext,
    isAutomaticExecutionEnabled: async () => false,
  })
  const manual = executeSelectedCheckIn(input)
  completion.resolve({ status: "success" })
  const results = await Promise.all([first, disabled, manual])
  expect(results[2]).toMatchObject({
    kind: "executed",
    result: { status: "success" },
    reused: true,
  })
  expect(checkIn).toHaveBeenCalledOnce()
})

it("releases the account after provider crashes without replaying its overlapping attempt", async () => {
  const { input, started, completion, checkIn } = setup()
  checkIn
    .mockReset()
    .mockImplementationOnce(async () => {
      started.resolve()
      await completion.promise
      throw new Error("provider crashed")
    })
    .mockResolvedValue({ status: "success" })
  const first = executeSelectedCheckIn(input)
  await started.promise
  const second = executeSelectedCheckIn(input)
  const results = Promise.allSettled([first, second])
  completion.resolve({ status: "success" })
  const settled = await results
  expect(settled.map((result) => result.status)).toEqual([
    "rejected",
    "rejected",
  ])
  const failures = settled.map((result) =>
    result.status === "rejected" ? result.reason : undefined,
  )
  expect(failures[0]).toMatchObject({
    completedAt: expect.any(Number),
    reused: false,
    cause: expect.objectContaining({ message: "provider crashed" }),
  })
  expect(failures[1]).toMatchObject({
    completedAt: failures[0].completedAt,
    reused: true,
    cause: failures[0].cause,
  })
  expect(checkIn).toHaveBeenCalledOnce()
  await expect(executeSelectedCheckIn(input)).resolves.toMatchObject({
    kind: "executed",
    result: { status: "success" },
  })
  expect(checkIn).toHaveBeenCalledTimes(2)
})
