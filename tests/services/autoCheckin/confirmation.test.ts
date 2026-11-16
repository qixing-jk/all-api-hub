import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  completeSessionCheckIn,
  confirmCheckInAttempt,
  withCheckInConfirmation,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { reconcileCheckInResult } from "~/services/checkin/autoCheckin/resultReconciliation"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("check-in confirmation", () => {
  const account = buildSiteAccount()
  const now = new Date(2026, 0, 31, 12).getTime()
  const startedAt = now - 1_000

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(now)
  })
  afterEach(() => vi.useRealTimers())

  it("does not query status for an attempt that was skipped", async () => {
    const readStatus = vi.fn()
    await expect(
      confirmCheckInAttempt({
        account,
        startedAt,
        readStatus,
        result: { status: "skipped", reasonCode: "auto_checkin_disabled" },
      }),
    ).resolves.toMatchObject({
      result: { status: "skipped" },
      confirmation: { kind: "not_required" },
    })
    expect(readStatus).not.toHaveBeenCalled()
  })

  it.each([
    ["success", "response"],
    ["already_checked", "response"],
    ["skipped", "not_required"],
    ["failed", "unavailable"],
    ["uncertain", "unavailable"],
  ] as const)("retains %s evidence after session cleanup", (status, kind) => {
    const result = completeSessionCheckIn(
      account,
      status === "success" || status === "already_checked"
        ? { status }
        : {
            status,
            reasonCode:
              status === "skipped" ? "auto_checkin_disabled" : "upstream_error",
          },
    )
    expect(result).toMatchObject({ status, confirmation: { kind } })
  })

  it.each([
    {
      completion: { timestamp: "2026-01-30T10:00:00Z" },
      expected: Date.UTC(2026, 0, 30, 10),
    },
    {
      completion: { day: "2026-01-30" },
      expected: new Date(2026, 0, 31).getTime() - 1,
    },
    { completion: { day: "2026-01-31" }, expected: now },
    { completion: { day: "2026-02-01" }, expected: undefined },
    {
      completion: { timestamp: "2026-02-01T10:00:00Z", day: "2026-01-30" },
      expected: new Date(2026, 0, 31).getTime() - 1,
    },
    { completion: { timestamp: "2026-02-30T10:00:00Z" }, expected: undefined },
    { completion: { timestamp: "2025-02-30T10:00:00Z" }, expected: undefined },
    { completion: { day: "2026-02-30" }, expected: undefined },
    { completion: {}, expected: undefined },
  ])("attributes a response using $completion", ({ completion, expected }) => {
    const result = withCheckInResponseConfirmation(
      account,
      { status: "success" },
      completion,
    )
    expect(result.confirmation).toMatchObject({
      kind: "response",
      observedAt: now,
    })
    if (expected === undefined)
      expect(result.confirmation).not.toHaveProperty("completedAt")
    else expect(result.confirmation).toHaveProperty("completedAt", expected)
  })

  it.each(["response", "not_required"] as const)(
    "reads status instead of trusting incompatible %s evidence",
    async (kind) => {
      const readStatus = vi.fn().mockResolvedValue({
        status: {
          outcome: "known",
          today: "checked",
          evidence: { source: "probe", observedAt: now },
        },
        reward: { quota: 27 },
      })
      const result = withCheckInConfirmation(
        account,
        { status: "uncertain", reasonCode: "checkin_unconfirmed" },
        { kind },
      )
      const confirmed = await confirmCheckInAttempt({
        account,
        result,
        startedAt,
        readStatus,
      })
      expect(confirmed).toMatchObject({
        result: { status: "success", reward: { quota: 27 } },
        confirmation: { kind: "observed" },
      })
      expect(readStatus).toHaveBeenCalledTimes(1)
    },
  )

  it.each([now - 2_000, now, now + 1_000])(
    "reuses unknown evidence only when its attempt time %s belongs to this execution",
    async (attemptedAt) => {
      const result = withCheckInConfirmation(
        account,
        { status: "uncertain", reasonCode: "checkin_unconfirmed" },
        {
          kind: "observed",
        status: { outcome: "unknown", reason: "network", attemptedAt },
        },
      )
      const readStatus = vi.fn().mockResolvedValue(undefined)
      const confirmed = await confirmCheckInAttempt({
        account,
        startedAt,
        readStatus,
        result: {
          ...result,
          confirmation: { ...result.confirmation, observedAt: now },
        },
      })
      expect(confirmed).toMatchObject({
        result: {
          status: "uncertain",
          reconciliation: attemptedAt === now ? "unknown" : "unavailable",
        },
        confirmation: {
          kind: attemptedAt === now ? "observed" : "unavailable",
        },
      })
      expect(readStatus).toHaveBeenCalledTimes(attemptedAt === now ? 0 : 1)
    },
  )

  it.each([
    { source: "legacy_migration", legacyObservedAt: now },
    { source: "probe", observedAt: now + 1_000 },
  ] as const)(
    "does not promote invalid checked evidence $source to a protocol grant",
    async (evidence) => {
      const result = withCheckInConfirmation(
        account,
        { status: "success", reward: { quota: 99 } },
        {
          kind: "observed",
          status: { outcome: "known", today: "checked", evidence },
        },
      )
      const confirmed = await confirmCheckInAttempt({
        account,
        startedAt,
        result: {
          ...result,
          confirmation: { ...result.confirmation, observedAt: now },
        },
      })
      expect(confirmed).toMatchObject({
        result: { status: "uncertain", reasonCode: "checkin_unconfirmed" },
        confirmation: { kind: "unsupported" },
      })
      expect(confirmed.result).not.toHaveProperty("reward")
    },
  )

  it.each([true, false])(
    "explains an unconfirmed not-checked result with existing reason=%s",
    (hasReason) => {
      const status: CheckInMethodStatus = {
        outcome: "known",
        availability: "enabled",
        today: "not_checked",
        evidence: { source: "probe", observedAt: now },
      }
      const result = reconcileCheckInResult({
        result: {
          status: "uncertain",
          ...(hasReason
            ? ({
                reasonCode: "timeout",
                messageKey: "original-timeout",
              } as const)
            : {}),
        },
        status,
      })
      expect(result).toMatchObject({
        status: "failed",
        reasonCode: hasReason ? "timeout" : "checkin_unconfirmed",
        messageKey: hasReason
          ? "original-timeout"
          : "autoCheckin:skipReasons.checkin_unconfirmed",
        reconciliation: "not_checked",
      })
    },
  )
})
