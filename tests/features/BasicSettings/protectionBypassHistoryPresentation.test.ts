import { describe, expect, it } from "vitest"

import {
  describeProtectionBypassHistory,
  getProtectionBypassHistoryLabels,
} from "~/features/BasicSettings/components/tabs/Refresh/protectionBypassHistoryPresentation"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ProtectionBypassHistoryEntry } from "~/services/protectionBypass/historyStorage"
import { testI18n } from "~~/tests/test-utils/i18n"

/** Describe a retained record through the history presentation contract. */
function describeEntry(overrides: Partial<ProtectionBypassHistoryEntry>) {
  const entry: ProtectionBypassHistoryEntry = {
    id: "history-entry",
    startedAt: 1_700_000_000_000,
    status: "failed",
    execution: createAutomaticProtectionBypassExecution(
      "checkin",
      "scheduled",
      "background",
    ),
    taskKind: "turnstile_fetch",
    origin: "https://example.com",
    incognito: false,
    ...overrides,
  }
  return describeProtectionBypassHistory(
    entry,
    getProtectionBypassHistoryLabels(testI18n.t),
    testI18n.t,
  )
}

describe("protection bypass history presentation", () => {
  it("identifies a manual refresh and the newly created browser context", () => {
    expect(
      describeEntry({
        execution: {
          version: 2,
          kind: "user_command",
          command: "refresh_account",
          surface: "options",
        },
        taskKind: "api_fallback_fetch",
        status: "completed",
        contextReused: false,
      }),
    ).toMatchObject({
      operation: "shieldBypass:history.commands.refresh_account",
      trigger: "shieldBypass:history.manual",
      status: "shieldBypass:history.statuses.completed",
      context: "shieldBypass:history.created",
    })
  })

  it("keeps an unconfirmed mutation prominent alongside its execution failure", () => {
    expect(
      describeEntry({
        mutationState: "dispatched_unconfirmed",
        failureReason: "execution_error",
      }),
    ).toMatchObject({
      reason: "shieldBypass:history.mutations.dispatched_unconfirmed",
      mutation: "shieldBypass:history.mutations.dispatched_unconfirmed",
    })
  })

  it("explains why the browser context was unavailable", () => {
    expect(
      describeEntry({
        status: "unavailable",
        failureReason: "incognito_access_required",
      }),
    ).toMatchObject({
      reason: "shieldBypass:history.failures.incognito_access_required",
      status: "shieldBypass:history.statuses.unavailable",
    })
  })

  it.each(["timeout", "error"] as const)(
    "shows the Turnstile %s as both the reason and verification result",
    (turnstileStatus) => {
      expect(describeEntry({ turnstileStatus })).toMatchObject({
        reason: `shieldBypass:history.turnstile.${turnstileStatus}`,
        verification: `shieldBypass:history.turnstile.${turnstileStatus}`,
      })
    },
  )
})
