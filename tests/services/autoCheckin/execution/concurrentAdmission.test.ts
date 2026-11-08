import { afterEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
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

function setup(readback = true) {
  const siteType = readback ? SITE_TYPES.NEW_API : SITE_TYPES.ANYROUTER
  const registration = autoCheckinMethodRegistry.resolveById(
    readback ? "new-api:daily-checkin" : "anyrouter:daily-checkin",
  )!
  const account = buildSiteAccount({
    site_type: siteType,
    checkIn: createCompatibilityCheckInConfig({
      siteType,
      supported: true,
      automaticExecutionEnabled: true,
    }),
  })
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
    expect(results.slice(1)).toEqual([
      { kind: "skipped", reason: "already_checked" },
      { kind: "skipped", reason: "already_checked" },
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
    kind: "skipped",
    reason: "already_checked",
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
  expect((await results).map((result) => result.status)).toEqual([
    "rejected",
    "rejected",
  ])
  expect(checkIn).toHaveBeenCalledOnce()
  await expect(executeSelectedCheckIn(input)).resolves.toMatchObject({
    kind: "executed",
    result: { status: "success" },
  })
  expect(checkIn).toHaveBeenCalledTimes(2)
})
