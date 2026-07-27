import { describe, expect, expectTypeOf, it } from "vitest"

import {
  createOpenRouterBootstrapLabel,
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  type OpenRouterBootstrapCreatedAttemptOutcome,
  type OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome,
  type OpenRouterBootstrapNotDispatchedAttemptOutcome,
} from "~/constants/openRouterBootstrap"
import * as openRouterBootstrap from "~/constants/openRouterBootstrap"
import type {
  TempWindowOpenRouterManagementKeyActionParams,
  TempWindowOpenRouterManagementKeyActionResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import type {
  OpenRouterAccountOnboardingResult,
  OpenRouterProvisioningOutcome,
} from "~/services/apiAdapters/openrouter/types"

describe("OpenRouter bootstrap constants", () => {
  it("creates a user-facing label with the request UUID short code", () => {
    const requestId = "account-auto-detect-c8f94b6b-88a9-4287-b9f1-22a84e57aa47"

    const label = createOpenRouterBootstrapLabel(requestId)

    expect(label).toBe("All API Hub - Account Connection (c8f94b6b)")
    expect(label).not.toContain("account-auto-detect")
    expect(label).not.toContain("c8f94b6b-88a9-4287-b9f1-22a84e57aa47")
  })

  it("keeps labels for different request UUIDs distinguishable", () => {
    expect(
      createOpenRouterBootstrapLabel(
        "account-auto-detect-c8f94b6b-88a9-4287-b9f1-22a84e57aa47",
      ),
    ).not.toBe(
      createOpenRouterBootstrapLabel(
        "account-auto-detect-a1b2c3d4-1111-4222-8333-123456789abc",
      ),
    )
  })

  it("creates a bounded stable label without exposing a non-UUID request ID", () => {
    const requestId = "private-arbitrary-request-identifier"
    const firstLabel = createOpenRouterBootstrapLabel(requestId)

    expect(firstLabel).toBe(createOpenRouterBootstrapLabel(requestId))
    expect(firstLabel).not.toBe("")
    expect(firstLabel).not.toContain(requestId)
    expect(firstLabel.length).toBeLessThanOrEqual(96)
  })

  it("distinguishes non-UUID request IDs with different astral code points", () => {
    expect(createOpenRouterBootstrapLabel("request-😀")).not.toBe(
      createOpenRouterBootstrapLabel("request-😁"),
    )
  })

  it("defines the mutation, attempt, and cancellation vocabularies", () => {
    expect(OPENROUTER_BOOTSTRAP_MUTATION_STATES).toEqual({
      NotDispatched: "not_dispatched",
      DispatchedUnconfirmed: "dispatched_unconfirmed",
      Created: "created",
    })
    expect(OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES).toEqual({
      Success: "success",
      LoggedOut: "logged_out",
      PageChanged: "page_changed",
      InvalidOrigin: "invalid_origin",
      Timeout: "timeout",
      Failed: "failed",
      CancelledBeforeCreate: "cancelled_before_create",
      CancelledAfterCreate: "cancelled_after_create",
      ValidationFailed: "validation_failed",
    })
    expect(openRouterBootstrap).not.toHaveProperty(
      "OPENROUTER_BOOTSTRAP_CLEANUP_OUTCOMES",
    )
    expect(openRouterBootstrap).toHaveProperty(
      "OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES",
      {
        Known: "known",
        Unknown: "unknown",
      },
    )
  })

  it("keeps branch-specific attempt outcomes narrow", () => {
    expectTypeOf<OpenRouterBootstrapCreatedAttemptOutcome>().toEqualTypeOf<
      "success" | "cancelled_after_create"
    >()
    expectTypeOf<OpenRouterBootstrapNotDispatchedAttemptOutcome>().toEqualTypeOf<
      | "logged_out"
      | "page_changed"
      | "invalid_origin"
      | "timeout"
      | "failed"
      | "cancelled_before_create"
    >()
    expectTypeOf<OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome>().toEqualTypeOf<
      "timeout" | "failed"
    >()
    expectTypeOf<
      TempWindowOpenRouterManagementKeyActionParams["operation"]
    >().toEqualTypeOf<{ kind: "create"; label: string }>()
    expectTypeOf<
      TempWindowOpenRouterManagementKeyActionResult["operation"]
    >().toEqualTypeOf<"create">()
  })

  it("keeps completion state, reason, and attempt combinations discriminated", () => {
    type Completed = Extract<
      OpenRouterAccountOnboardingResult,
      { kind: "bootstrap_completed" }
    >
    type Failed = Extract<
      OpenRouterAccountOnboardingResult,
      { kind: "bootstrap_failure" }
    >
    type ValidationRecovery = Extract<
      OpenRouterProvisioningOutcome,
      { reason: "post_create_validation_failed" }
    >
    type CancellationRecovery = Extract<
      OpenRouterProvisioningOutcome,
      { reason: "cancelled_after_create" }
    >
    type UnconfirmedRecovery = Extract<
      OpenRouterProvisioningOutcome,
      { reason: "mutation_unconfirmed" }
    >

    expectTypeOf<Completed["attemptOutcome"]>().toEqualTypeOf<"success">()
    expectTypeOf<
      Completed["provisioning"]["mutationState"]
    >().toEqualTypeOf<"created">()
    expectTypeOf<Completed["provisioning"]>().not.toHaveProperty(
      "remoteCredentialId",
    )
    expectTypeOf<Failed["mutationState"]>().toEqualTypeOf<"not_dispatched">()
    expectTypeOf<
      ValidationRecovery["attemptOutcome"]
    >().toEqualTypeOf<"validation_failed">()
    expectTypeOf<
      CancellationRecovery["attemptOutcome"]
    >().toEqualTypeOf<"cancelled_after_create">()
    expectTypeOf<UnconfirmedRecovery["attemptOutcome"]>().toEqualTypeOf<
      "timeout" | "failed"
    >()
  })
})
