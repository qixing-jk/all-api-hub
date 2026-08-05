import { describe, expect, it, vi } from "vitest"

import {
  consumeManagedSiteMutationResult,
  invokeManagedSiteMutationAttempt,
  MANAGED_SITE_MUTATION_ATTEMPT_STATES,
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  MANAGED_SITE_MUTATION_RETRY_DECISIONS,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationRetryDecision,
} from "~/services/managedSites/mutations"

const effect: ManagedSiteMutationConfirmedEffect = {
  kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ModelsUpdated,
  resourceKind: "channel",
  resourceId: "channel-placeholder",
}

const createOptions = (
  overrides: Partial<
    Parameters<typeof consumeManagedSiteMutationResult>[1]
  > = {},
) => ({
  idempotent: true,
  retryableRejection: true,
  knownSecrets: [] as readonly string[],
  knownSecretsComplete: true,
  reconcile: vi.fn().mockResolvedValue(undefined),
  rejectedFallbackMessage: "Mutation was rejected",
  ambiguousFallbackMessage: "Mutation requires reconciliation",
  createError: (message: string) => new Error(message),
  ...overrides,
})

describe("consumeManagedSiteMutationResult", () => {
  it("returns succeeded results without reconciling or creating an error", async () => {
    const reconcile = vi.fn()
    const createError = vi.fn((message: string) => new Error(message))

    await expect(
      consumeManagedSiteMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
          data: undefined,
          confirmedEffects: [],
        },
        createOptions({ reconcile, createError }),
      ),
    ).resolves.toBeUndefined()

    expect(reconcile).not.toHaveBeenCalled()
    expect(createError).not.toHaveBeenCalled()
  })

  it.each([
    {
      retryableRejection: true,
      expectedDecision: MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryAllowed,
    },
    {
      retryableRejection: false,
      expectedDecision: MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryDisallowed,
    },
  ])(
    "projects a rejected result with retryableRejection=$retryableRejection",
    async ({ retryableRejection, expectedDecision }) => {
      const secret = "rejected-secret-placeholder"
      const raw = { authorization: secret }
      const factoryError = new Error("factory error identity")
      const createError = vi.fn(
        (_message: string, _retryDecision: ManagedSiteMutationRetryDecision) =>
          factoryError,
      )

      await expect(
        consumeManagedSiteMutationResult(
          {
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: `Provider rejected ${secret}`,
              code: "upstream_rejected",
              raw,
            },
          },
          createOptions({
            retryableRejection,
            knownSecrets: [secret],
            createError,
          }),
        ),
      ).rejects.toBe(factoryError)

      expect(createError).toHaveBeenCalledOnce()
      const [message, retryDecision] = createError.mock.calls[0]
      expect(message).toContain("Provider rejected")
      expect(message).not.toContain(secret)
      expect(retryDecision).toBe(expectedDecision)
      expect(createError.mock.calls.flat()).not.toContain(raw)
      expect(factoryError).not.toHaveProperty("cause")
    },
  )

  it("reconciles a partial result exactly once before throwing the caller error", async () => {
    const reconcile = vi.fn().mockResolvedValue(undefined)
    const factoryError = new Error("partial identity")
    const createError = vi.fn(
      (_message: string, _retryDecision: ManagedSiteMutationRetryDecision) =>
        factoryError,
    )

    await expect(
      consumeManagedSiteMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
          confirmedEffects: [effect],
          completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
          diagnostic: { message: "Partial provider result" },
        },
        createOptions({ reconcile, createError }),
      ),
    ).rejects.toBe(factoryError)

    expect(reconcile).toHaveBeenCalledOnce()
    expect(createError).toHaveBeenCalledWith(
      "Partial provider result",
      MANAGED_SITE_MUTATION_RETRY_DECISIONS.ReconcileRequired,
    )
  })

  it("treats an uncertain reconciliation failure as best effort without replaying", async () => {
    const reconcileFailure = new Error("refresh unavailable")
    const reconcile = vi.fn().mockRejectedValue(reconcileFailure)
    const factoryError = new Error("uncertain identity")
    const createError = vi.fn(
      (_message: string, _retryDecision: ManagedSiteMutationRetryDecision) =>
        factoryError,
    )

    await expect(
      consumeManagedSiteMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
          diagnostic: { message: "Uncertain provider result" },
        },
        createOptions({ reconcile, createError }),
      ),
    ).rejects.toBe(factoryError)

    expect(reconcile).toHaveBeenCalledOnce()
    expect(createError).toHaveBeenCalledOnce()
  })

  it("uses caller fallbacks when the projected diagnostic message is empty", async () => {
    const factoryError = new Error("fallback identity")
    const createError = vi.fn(
      (_message: string, _retryDecision: ManagedSiteMutationRetryDecision) =>
        factoryError,
    )

    await expect(
      consumeManagedSiteMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
          diagnostic: { message: "" },
        },
        createOptions({
          rejectedFallbackMessage: "Caller rejection fallback",
          createError,
        }),
      ),
    ).rejects.toBe(factoryError)

    expect(createError).toHaveBeenCalledWith(
      "Caller rejection fallback",
      MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryAllowed,
    )
  })

  it("uses only the caller fallback when secret collection was incomplete", async () => {
    const providerText = "Provider diagnostic must stay private"
    const uncollectedSecret = "uncollected-secret-placeholder"
    const createError = vi.fn(
      (message: string, _retryDecision: ManagedSiteMutationRetryDecision) =>
        new Error(message),
    )

    await expect(
      consumeManagedSiteMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
          diagnostic: {
            message: `${providerText} ${uncollectedSecret}`,
          },
        },
        createOptions({
          knownSecrets: [],
          knownSecretsComplete: false,
          rejectedFallbackMessage: "Local rejection fallback",
          createError,
        }),
      ),
    ).rejects.toThrow("Local rejection fallback")

    expect(createError).toHaveBeenCalledWith(
      "Local rejection fallback",
      MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryAllowed,
    )
    expect(JSON.stringify(createError.mock.calls)).not.toContain(providerText)
    expect(JSON.stringify(createError.mock.calls)).not.toContain(
      uncollectedSecret,
    )
  })

  it("rejects malformed input before reconciliation or error construction", async () => {
    const reconcile = vi.fn()
    const createError = vi.fn((message: string) => new Error(message))

    await expect(
      consumeManagedSiteMutationResult(
        { outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain },
        createOptions({ reconcile, createError }),
      ),
    ).rejects.toThrow("Invalid managed site mutation result")

    expect(reconcile).not.toHaveBeenCalled()
    expect(createError).not.toHaveBeenCalled()
  })

  it("does not swallow errors thrown by the caller error factory", async () => {
    const factoryFailure = new Error("error factory failed")

    await expect(
      consumeManagedSiteMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
          diagnostic: { message: "Rejected" },
        },
        createOptions({
          createError: () => {
            throw factoryFailure
          },
        }),
      ),
    ).rejects.toBe(factoryFailure)
  })
})

describe("invokeManagedSiteMutationAttempt", () => {
  const createAttemptOptions = (
    overrides: Partial<
      Parameters<typeof invokeManagedSiteMutationAttempt>[1]
    > = {},
  ) => ({
    idempotent: false,
    knownSecrets: [] as readonly string[],
    knownSecretsComplete: true,
    uncertainFallbackMessage: "Mutation state requires reconciliation",
    ...overrides,
  })

  it("returns a validated provider result without changing its identity", async () => {
    const result = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: 7 },
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
          resourceKind: "channel" as const,
          resourceId: 7,
        },
      ],
    }
    const invoke = vi.fn().mockResolvedValue(result)

    await expect(
      invokeManagedSiteMutationAttempt(invoke, createAttemptOptions()),
    ).resolves.toEqual({
      state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Result,
      result,
    })
    expect(invoke).toHaveBeenCalledOnce()
  })

  it("classifies a malformed post-invocation result as controlled uncertain", async () => {
    const invoke = vi.fn().mockResolvedValue({ outcome: "invalid" })

    await expect(
      invokeManagedSiteMutationAttempt(invoke, createAttemptOptions()),
    ).resolves.toEqual({
      state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain,
      message: "Mutation state requires reconciliation",
    })
    expect(invoke).toHaveBeenCalledOnce()
  })

  it("sanitizes a thrown post-invocation error from the caller snapshot", async () => {
    const secret = "attempt-secret-placeholder"
    const source = { secret }
    const thrown = new Error(`Provider write failed with ${secret}`, {
      cause: new Error(`Cause ${secret}`),
    })
    const invoke = vi.fn(async () => {
      source.secret = "mutated-secret"
      throw thrown
    })

    const attempt = await invokeManagedSiteMutationAttempt(
      invoke,
      createAttemptOptions({ knownSecrets: [secret] }),
    )

    expect(attempt).toMatchObject({
      state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain,
      message: expect.stringContaining("Provider write failed"),
    })
    expect(JSON.stringify(attempt)).not.toContain(secret)
    expect(attempt).not.toHaveProperty("error")
    expect(attempt).not.toHaveProperty("cause")
    expect(invoke).toHaveBeenCalledOnce()
  })

  it("uses only the local fallback when secret collection is incomplete", async () => {
    const providerText = "Provider private post-invocation diagnostic"
    const secret = "uncollected-attempt-secret-placeholder"
    const invoke = vi
      .fn()
      .mockRejectedValue(new Error(`${providerText} ${secret}`))

    const attempt = await invokeManagedSiteMutationAttempt(
      invoke,
      createAttemptOptions({ knownSecretsComplete: false }),
    )

    expect(attempt).toEqual({
      state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain,
      message: "Mutation state requires reconciliation",
    })
    expect(JSON.stringify(attempt)).not.toContain(providerText)
    expect(JSON.stringify(attempt)).not.toContain(secret)
  })
})
