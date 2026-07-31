import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createOpenRouterBootstrapLabel,
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  OPENROUTER_BOOTSTRAP_VALIDATION_TIMEOUT_MS,
} from "~/constants/openRouterBootstrap"
import {
  cancelOpenRouterAccountProvisioning,
  onboardOpenRouterAccount as onboardOpenRouterAccountProduction,
  provisionOpenRouterAccount as provisionOpenRouterAccountProduction,
} from "~/services/apiAdapters/openrouter/accountProvisioning"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const { createManagementKey, cancelManagementKey, validateManagementKey } =
  vi.hoisted(() => ({
    createManagementKey: vi.fn(),
    cancelManagementKey: vi.fn(),
    validateManagementKey: vi.fn(),
  }))

vi.mock("~/services/apiAdapters/openrouter/managementKeyActionClient", () => ({
  tempWindowOpenRouterManagementKeyAction: createManagementKey,
  cancelTempWindowOpenRouterManagementKeyAction: cancelManagementKey,
}))

vi.mock("~/services/apiService/openrouter", () => ({
  validateManagementKey,
}))

const tempWindowRequestSource = TEMP_WINDOW_REQUEST_SOURCES.Options
const testExecution = userCommandExecution(
  PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
)

function provisionOpenRouterAccount(
  request: Omit<
    Parameters<typeof provisionOpenRouterAccountProduction>[0],
    "protectionBypassExecution"
  > & {
    protectionBypassExecution?: Parameters<
      typeof provisionOpenRouterAccountProduction
    >[0]["protectionBypassExecution"]
  },
) {
  return provisionOpenRouterAccountProduction({
    ...request,
    protectionBypassExecution:
      request.protectionBypassExecution ?? testExecution,
  })
}

function onboardOpenRouterAccount(
  request: Omit<
    Parameters<typeof onboardOpenRouterAccountProduction>[0],
    "protectionBypassExecution"
  > & {
    protectionBypassExecution?: Parameters<
      typeof onboardOpenRouterAccountProduction
    >[0]["protectionBypassExecution"]
  },
) {
  return onboardOpenRouterAccountProduction({
    ...request,
    protectionBypassExecution:
      request.protectionBypassExecution ?? testExecution,
  })
}

describe("OpenRouter account provisioning", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("owns the canonical onboarding result mapping in the provider module", async () => {
    const protectionBypassExecution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
    )
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-onboarding",
      label: "All API Hub - Account Connection (onboard)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-onboarding-placeholder",
    })
    validateManagementKey.mockResolvedValue({ userId: "user_onboarding" })

    await expect(
      onboardOpenRouterAccount({
        requestId: "request-onboarding",
        tempWindowRequestSource,
        protectionBypassExecution,
      }),
    ).resolves.toMatchObject({
      kind: "bootstrap_completed",
      success: true,
      message: "accountDialog:messages.autoDetectSuccess",
      data: {
        siteType: "openrouter",
        userId: "user_onboarding",
        accessToken: "sk-or-onboarding-placeholder",
      },
      provisioning: {
        requestId: "request-onboarding",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      },
    })
    expect(createManagementKey).toHaveBeenCalledWith(
      expect.objectContaining({ protectionBypassExecution }),
    )
  })

  it.each([
    [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
      "messages:openrouter.bootstrap.logged_out",
    ],
    [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged,
      "messages:openrouter.bootstrap.page_changed",
    ],
    [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin,
      "messages:openrouter.bootstrap.invalid_origin",
    ],
    [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
      "messages:openrouter.bootstrap.timeout",
    ],
    [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate,
      "messages:openrouter.bootstrap.cancelled_before_create",
    ],
    [
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      "messages:openrouter.bootstrap.failed",
    ],
  ])(
    "maps the %s pre-dispatch outcome through the provider onboarding seam",
    async (attemptOutcome, message) => {
      createManagementKey.mockResolvedValue({
        operation: "create",
        requestId: "request-pre-dispatch",
        label: createOpenRouterBootstrapLabel("request-pre-dispatch"),
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
        attemptOutcome,
      })

      await expect(
        onboardOpenRouterAccount({ requestId: "request-pre-dispatch" }),
      ).resolves.toEqual({
        kind: "bootstrap_failure",
        success: false,
        message,
        requestId: "request-pre-dispatch",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
        attemptOutcome,
      })
    },
  )

  it("maps timeout after dispatch to recovery evidence without a secret", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-dispatch-timeout",
      label: createOpenRouterBootstrapLabel("request-dispatch-timeout"),
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
    })

    const result = await onboardOpenRouterAccount({
      requestId: "request-dispatch-timeout",
    })

    expect(result).toEqual({
      kind: "bootstrap_recovery",
      success: false,
      message: "messages:openrouter.bootstrap.mutationUnconfirmed",
      status: "recovery_required",
      reason: "mutation_unconfirmed",
      requestId: "request-dispatch-timeout",
      provisioning: {
        requestId: "request-dispatch-timeout",
        label: createOpenRouterBootstrapLabel("request-dispatch-timeout"),
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
    })
    expect(result).not.toHaveProperty("createdCredential")
  })

  it("maps cancellation after create to recovery with the one-time credential", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-cancelled-after-create-seam",
      label: createOpenRouterBootstrapLabel(
        "request-cancelled-after-create-seam",
      ),
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome:
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate,
      accessToken: "sk-or-cancelled-seam-placeholder",
    })

    await expect(
      onboardOpenRouterAccount({
        requestId: "request-cancelled-after-create-seam",
      }),
    ).resolves.toMatchObject({
      kind: "bootstrap_recovery",
      success: false,
      message: "messages:openrouter.bootstrap.cancelledAfterCreate",
      reason: "cancelled_after_create",
      createdCredential: {
        accessToken: "sk-or-cancelled-seam-placeholder",
      },
      attemptOutcome:
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate,
    })
  })

  it("maps post-create validation failure to recovery with evidence", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-validation-failure-seam",
      label: createOpenRouterBootstrapLabel("request-validation-failure-seam"),
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-validation-seam-placeholder",
    })
    validateManagementKey.mockRejectedValue(new Error("validation unavailable"))

    await expect(
      onboardOpenRouterAccount({
        requestId: "request-validation-failure-seam",
      }),
    ).resolves.toMatchObject({
      kind: "bootstrap_recovery",
      success: false,
      message: "messages:openrouter.bootstrap.validationFailed",
      reason: "post_create_validation_failed",
      createdCredential: {
        accessToken: "sk-or-validation-seam-placeholder",
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.ValidationFailed,
    })
  })

  it("maps a rejected create transport to unconfirmed recovery", async () => {
    createManagementKey.mockRejectedValue(new Error("transport disconnected"))

    await expect(
      onboardOpenRouterAccount({ requestId: "request-transport-failure" }),
    ).resolves.toMatchObject({
      kind: "bootstrap_recovery",
      success: false,
      message: "messages:openrouter.bootstrap.mutationUnconfirmed",
      reason: "mutation_unconfirmed",
      provisioning: {
        requestId: "request-transport-failure",
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    })
  })

  it("returns created data after one create dispatch and Management Key validation", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-example",
      label: "All API Hub - Account Connection (example1)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-example-placeholder",
      sessionIdentity: {
        userId: "user_example",
        username: "Example User",
      },
    })
    validateManagementKey.mockResolvedValue({ userId: "user_example" })

    const result = await provisionOpenRouterAccount({
      requestId: "request-example",
      tempWindowRequestSource,
    })

    expect(createManagementKey).toHaveBeenCalledOnce()
    expect(createManagementKey).toHaveBeenCalledWith({
      requestId: "request-example",
      operation: {
        kind: "create",
        label: createOpenRouterBootstrapLabel("request-example"),
      },
      protectionBypassExecution: testExecution,
      tempWindowRequestSource,
    })
    expect(result).toMatchObject({
      status: "completed",
      data: {
        accessToken: "sk-or-example-placeholder",
        userId: "user_example",
        username: "Example User",
      },
    })
  })

  it("preserves a dispatched-but-unconfirmed result without retrying", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-uncertain",
      label: "All API Hub - Account Connection (example2)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout,
    })

    await expect(
      provisionOpenRouterAccount({
        requestId: "request-uncertain",
        tempWindowRequestSource,
      }),
    ).resolves.toMatchObject({
      status: "recovery_required",
      reason: "mutation_unconfirmed",
    })
    expect(createManagementKey).toHaveBeenCalledOnce()
    expect(validateManagementKey).not.toHaveBeenCalled()
  })

  it("classifies a rejected create transport as dispatched but unconfirmed", async () => {
    createManagementKey.mockRejectedValue(new Error("transport disconnected"))

    await expect(
      provisionOpenRouterAccount({ requestId: "request-rejected" }),
    ).resolves.toMatchObject({
      status: "recovery_required",
      reason: "mutation_unconfirmed",
      provisioning: {
        requestId: "request-rejected",
        label: createOpenRouterBootstrapLabel("request-rejected"),
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    })
    expect(createManagementKey).toHaveBeenCalledOnce()
  })

  it("normalizes an unexpected create dependency result inside provisioning", async () => {
    createManagementKey.mockResolvedValue(undefined)

    await expect(
      provisionOpenRouterAccount({ requestId: "request-malformed" }),
    ).resolves.toMatchObject({
      status: "recovery_required",
      reason: "mutation_unconfirmed",
      provisioning: {
        requestId: "request-malformed",
        label: createOpenRouterBootstrapLabel("request-malformed"),
        mutationState:
          OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    })
    expect(createManagementKey).toHaveBeenCalledOnce()
  })

  it("returns a retryable failure only when create was not dispatched", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-not-dispatched",
      label: "All API Hub - Account Connection (example3)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
    })

    await expect(
      provisionOpenRouterAccount({
        requestId: "request-not-dispatched",
        tempWindowRequestSource,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
    })
  })

  it("retains the one-time key when validation fails after create", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-validation-failed",
      label: "All API Hub - Account Connection (example4)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-recovery-placeholder",
    })
    validateManagementKey.mockRejectedValue(new Error("validation failed"))

    await expect(
      provisionOpenRouterAccount({
        requestId: "request-validation-failed",
        tempWindowRequestSource,
      }),
    ).resolves.toMatchObject({
      status: "recovery_required",
      reason: "post_create_validation_failed",
      createdCredential: { accessToken: "sk-or-recovery-placeholder" },
    })
  })

  it("retains the one-time key when unexpected post-create setup fails", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-post-create-setup",
      label: "All API Hub - Account Connection (setup)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-setup-recovery-placeholder",
    })
    vi.stubGlobal(
      "AbortController",
      class {
        constructor() {
          throw new Error("abort controller unavailable")
        }
      },
    )

    try {
      await expect(
        provisionOpenRouterAccount({ requestId: "request-post-create-setup" }),
      ).resolves.toMatchObject({
        status: "recovery_required",
        reason: "post_create_validation_failed",
        createdCredential: {
          accessToken: "sk-or-setup-recovery-placeholder",
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("bounds validation and retains the one-time key on timeout", async () => {
    vi.useFakeTimers()
    try {
      createManagementKey.mockResolvedValue({
        operation: "create",
        requestId: "request-validation-timeout",
        label: "All API Hub - Account Connection (example-timeout)",
        mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
        accessToken: "sk-or-timeout-placeholder",
      })
      validateManagementKey.mockReturnValue(new Promise(() => {}))

      const pending = provisionOpenRouterAccount({
        requestId: "request-validation-timeout",
      })
      await vi.advanceTimersByTimeAsync(
        OPENROUTER_BOOTSTRAP_VALIDATION_TIMEOUT_MS,
      )

      await expect(pending).resolves.toMatchObject({
        status: "recovery_required",
        reason: "post_create_validation_failed",
        createdCredential: { accessToken: "sk-or-timeout-placeholder" },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("retains the one-time key when cancellation lands after create", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-cancelled-after-create",
      label: "All API Hub - Account Connection (example5)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome:
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate,
      accessToken: "sk-or-cancelled-placeholder",
    })

    await expect(
      provisionOpenRouterAccount({
        requestId: "request-cancelled-after-create",
        tempWindowRequestSource,
      }),
    ).resolves.toMatchObject({
      status: "recovery_required",
      reason: "cancelled_after_create",
      createdCredential: { accessToken: "sk-or-cancelled-placeholder" },
    })
  })

  it("uses Clerk metadata only when its ID matches creator_user_id", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-mismatch",
      label: "All API Hub - Account Connection (example6)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-mismatch-placeholder",
      sessionIdentity: {
        userId: "user_session",
        username: "Wrong Account",
      },
    })
    validateManagementKey.mockResolvedValue({ userId: "user_creator" })

    await expect(
      provisionOpenRouterAccount({ requestId: "request-mismatch" }),
    ).resolves.toMatchObject({
      status: "completed",
      data: { userId: "user_creator", username: "" },
    })
  })

  it("uses Clerk ID and display metadata when creator_user_id is absent", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-clerk-only",
      label: "All API Hub - Account Connection (example7)",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      accessToken: "sk-or-clerk-placeholder",
      sessionIdentity: { userId: "user_clerk", username: "Clerk User" },
    })
    validateManagementKey.mockResolvedValue({ userId: "" })

    await expect(
      provisionOpenRouterAccount({ requestId: "request-clerk-only" }),
    ).resolves.toMatchObject({
      status: "completed",
      data: { userId: "user_clerk", username: "Clerk User" },
    })
  })

  it("delegates cancellation to the OpenRouter temp-window action", async () => {
    cancelManagementKey.mockResolvedValue({
      requestId: "request-cancel",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      label: "recognizable-label",
    })

    await expect(
      cancelOpenRouterAccountProvisioning("request-cancel"),
    ).resolves.toEqual({
      requestId: "request-cancel",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      label: "recognizable-label",
    })
    expect(cancelManagementKey).toHaveBeenCalledWith("request-cancel")
  })

  it("does not dispatch cancellation without a request id", async () => {
    await expect(cancelOpenRouterAccountProvisioning("   ")).resolves.toEqual({
      requestId: "",
      certainty: "unknown",
    })
    expect(cancelManagementKey).not.toHaveBeenCalled()
  })

  it("uses the same normalized request ID for create and cancel", async () => {
    createManagementKey.mockResolvedValue({
      operation: "create",
      requestId: "request-normalized",
      label: createOpenRouterBootstrapLabel("request-normalized"),
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut,
    })
    cancelManagementKey.mockResolvedValue({
      requestId: "request-normalized",
      certainty: "unknown",
      cancellationAccepted: true,
    })

    await provisionOpenRouterAccount({ requestId: "  request-normalized  " })
    await cancelOpenRouterAccountProvisioning("  request-normalized  ")

    expect(createManagementKey).toHaveBeenCalledWith({
      requestId: "request-normalized",
      operation: {
        kind: "create",
        label: createOpenRouterBootstrapLabel("request-normalized"),
      },
      protectionBypassExecution: testExecution,
    })
    expect(cancelManagementKey).toHaveBeenCalledWith("request-normalized")
  })

  it("maps a rejected cancellation dependency to unknown", async () => {
    cancelManagementKey.mockRejectedValueOnce(new Error("transport timeout"))

    await expect(
      cancelOpenRouterAccountProvisioning("request-rejected"),
    ).resolves.toEqual({
      requestId: "request-rejected",
      certainty: "unknown",
    })
  })
})
