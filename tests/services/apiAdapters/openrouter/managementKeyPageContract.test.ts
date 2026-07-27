import { readFileSync } from "node:fs"
import { describe, expect, expectTypeOf, it } from "vitest"

import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import {
  isOpenRouterClerkSessionIdentity,
  normalizeOpenRouterManagementKeyActionResult,
  normalizeOpenRouterManagementKeyCancelResult,
  OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
  OPENROUTER_MANAGEMENT_KEYS_URL,
  type TempWindowOpenRouterManagementKeyActionParams,
  type TempWindowOpenRouterManagementKeyActionResult,
  type TempWindowOpenRouterManagementKeyCancelResult,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"

describe("OpenRouter Management Key page contract", () => {
  const createRequest: TempWindowOpenRouterManagementKeyActionParams = {
    requestId: "request-example",
    operation: { kind: "create", label: "extension-request-example" },
  }

  it("owns the canonical page route and bounded label contract", () => {
    expect(OPENROUTER_MANAGEMENT_KEYS_PATH).toBe("/settings/management-keys")
    expect(OPENROUTER_MANAGEMENT_KEYS_URL).toMatch(
      /^https:\/\/[^/]+\/settings\/management-keys$/,
    )
    expect(OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH).toBe(96)
  })

  it("accepts only exact normalized Clerk identity hints", () => {
    expect(
      isOpenRouterClerkSessionIdentity({
        userId: "user_example",
        username: "Example User",
      }),
    ).toBe(true)
    expect(
      isOpenRouterClerkSessionIdentity({
        userId: " user_example ",
        username: "Example User",
      }),
    ).toBe(false)
    expect(
      isOpenRouterClerkSessionIdentity({
        userId: "user_example",
        username: "Example User",
        extra: true,
      }),
    ).toBe(false)
  })

  it("owns the create and result transport contract", () => {
    expectTypeOf<
      TempWindowOpenRouterManagementKeyActionParams["operation"]
    >().toEqualTypeOf<{ kind: "create"; label: string }>()
    expectTypeOf<
      TempWindowOpenRouterManagementKeyActionResult["operation"]
    >().toEqualTypeOf<"create">()

    type KnownCancellation = Extract<
      TempWindowOpenRouterManagementKeyCancelResult,
      { certainty: "known" }
    >
    type UnknownCancellation = Extract<
      TempWindowOpenRouterManagementKeyCancelResult,
      { certainty: "unknown" }
    >

    expectTypeOf<
      KnownCancellation["cancellationAccepted"]
    >().toEqualTypeOf<boolean>()
    expectTypeOf<KnownCancellation["mutationState"]>().toEqualTypeOf<
      "not_dispatched" | "dispatched_unconfirmed" | "created"
    >()
    expectTypeOf<UnknownCancellation>().not.toHaveProperty("mutationState")
    expectTypeOf<UnknownCancellation>().not.toHaveProperty("label")
  })

  it("fails closed for mismatched create evidence", () => {
    expect(
      normalizeOpenRouterManagementKeyActionResult(createRequest, {
        requestId: "another-request",
        operation: "create",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
        accessToken: "sk-or-example-placeholder",
        label: createRequest.operation.label,
      }),
    ).toEqual({
      requestId: createRequest.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: createRequest.operation.label,
    })
  })

  it("retains valid cancellation-after-create evidence and Clerk identity", () => {
    expect(
      normalizeOpenRouterManagementKeyActionResult(createRequest, {
        requestId: createRequest.requestId,
        operation: "create",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
        attemptOutcome:
          OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate,
        accessToken: "  sk-or-example-placeholder  ",
        label: createRequest.operation.label,
        sessionIdentity: {
          userId: "user_example",
          username: "Example User",
        },
      }),
    ).toEqual({
      requestId: createRequest.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome:
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate,
      accessToken: "sk-or-example-placeholder",
      label: createRequest.operation.label,
      sessionIdentity: {
        userId: "user_example",
        username: "Example User",
      },
    })
  })

  it("accepts only timeout or failure as dispatched-unconfirmed evidence", () => {
    for (const attemptOutcome of [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    ]) {
      expect(
        normalizeOpenRouterManagementKeyActionResult(createRequest, {
          requestId: createRequest.requestId,
          operation: "create",
          mutationState:
            OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
          attemptOutcome,
          label: createRequest.operation.label,
        }),
      ).toMatchObject({
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
        attemptOutcome,
      })
    }

    expect(
      normalizeOpenRouterManagementKeyActionResult(createRequest, {
        requestId: createRequest.requestId,
        operation: "create",
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
        label: createRequest.operation.label,
      }),
    ).toMatchObject({
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    })
  })

  it("accepts every declared pre-dispatch outcome and rejects created-only outcomes", () => {
    const preDispatchOutcomes = [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate,
    ]
    for (const attemptOutcome of preDispatchOutcomes) {
      expect(
        normalizeOpenRouterManagementKeyActionResult(createRequest, {
          requestId: createRequest.requestId,
          operation: "create",
          mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
          attemptOutcome,
          label: createRequest.operation.label,
        }),
      ).toMatchObject({
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
        attemptOutcome,
      })
    }

    expect(
      normalizeOpenRouterManagementKeyActionResult(createRequest, {
        requestId: createRequest.requestId,
        operation: "create",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
        label: createRequest.operation.label,
      }),
    ).toMatchObject({
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    })
  })

  it("normalizes cancellation evidence without inferring mutation state", () => {
    expect(
      normalizeOpenRouterManagementKeyCancelResult(createRequest.requestId, {
        requestId: createRequest.requestId,
        certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
      }),
    ).toEqual({
      requestId: createRequest.requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
    })
    expect(
      normalizeOpenRouterManagementKeyCancelResult(createRequest.requestId, {
        requestId: createRequest.requestId,
        certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
        cancellationAccepted: "yes",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      }),
    ).toEqual({
      requestId: createRequest.requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
    })
    expect(
      normalizeOpenRouterManagementKeyCancelResult(createRequest.requestId, {
        requestId: createRequest.requestId,
        certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
        cancellationAccepted: true,
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      }),
    ).toEqual({
      requestId: createRequest.requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
      cancellationAccepted: true,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    })
    expect(
      normalizeOpenRouterManagementKeyCancelResult(createRequest.requestId, {
        requestId: createRequest.requestId,
        certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
        cancellationAccepted: true,
        mutationState: "invalid",
      }),
    ).toEqual({
      requestId: createRequest.requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
    })
  })

  it("is the shared contract imported by background and content consumers", () => {
    const consumerPaths = [
      "../../../../src/entrypoints/background/openrouter/managementKeyAction.ts",
      "../../../../src/entrypoints/content/messageHandlers/handlers/openRouterManagementKey.ts",
      "../../../../src/entrypoints/content/messageHandlers/openrouter/managementKeyPage.ts",
    ]

    for (const consumerPath of consumerPaths) {
      const source = readFileSync(
        new URL(consumerPath, import.meta.url),
        "utf8",
      )
      expect(source).not.toContain('from "~/types/tempWindowFetch"')
      expect(source).toContain(
        'from "~/services/apiAdapters/openrouter/managementKeyPageContract"',
      )
    }
  })
})
