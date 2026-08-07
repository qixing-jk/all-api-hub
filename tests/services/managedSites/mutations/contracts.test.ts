import { describe, expect, it } from "vitest"

import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

const effect: ManagedSiteMutationConfirmedEffect = {
  kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
  resourceKind: "channel",
  resourceId: 42,
}

const diagnostic = {
  message: "The operation could not be confirmed.",
  code: "confirmation_failed",
  statusCode: 502,
}

function assertMutationResult(
  value: unknown,
  options: { idempotent: boolean } = {
    idempotent: false,
  },
): asserts value is ManagedSiteMutationResult<
  string,
  ManagedSiteMutationConfirmedEffect
> {
  assertManagedSiteMutationResult<string, ManagedSiteMutationConfirmedEffect>(
    value,
    options,
  )
}

describe("managed site mutation contracts", () => {
  it("accepts all four valid outcomes and narrows them by outcome", () => {
    const succeeded: unknown = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: "saved-resource",
      confirmedEffects: [effect],
      message: "Saved",
    }
    const rejected: unknown = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic,
    }
    const partial: unknown = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: "saved-resource",
      confirmedEffects: [effect],
      completion: "uncertain",
      diagnostic,
    }
    const uncertain: unknown = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic,
    }

    for (const result of [succeeded, rejected, partial, uncertain]) {
      assertMutationResult(result, { idempotent: false })

      switch (result.outcome) {
        case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
          expect(result.data).toBe("saved-resource")
          expect(result.confirmedEffects).toHaveLength(1)
          break
        case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
          expect(result.diagnostic).toEqual(diagnostic)
          break
        case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
          expect(result.confirmedEffects).toHaveLength(1)
          expect(result.completion).toBe("uncertain")
          break
        case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
          expect(result.diagnostic).toEqual(diagnostic)
          break
      }
    }
  })

  it("rejects partial without a non-empty confirmedEffects tuple", () => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [],
        completion: "rejected",
        diagnostic,
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: new Array(1),
        completion: "rejected",
        diagnostic,
      }),
    ).toThrow(TypeError)
  })

  it("rejects completion on non-partial outcomes and requires it on partial", () => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [effect],
        completion: "rejected",
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [effect],
        diagnostic,
      }),
    ).toThrow(TypeError)
  })

  it("rejects unknown outcome, effect, and resource keys", () => {
    expect(() =>
      assertMutationResult({
        outcome: "complete",
        data: "saved-resource",
        confirmedEffects: [effect],
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [{ ...effect, kind: "created" }],
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [{ ...effect, resourceKind: "token" }],
      }),
    ).toThrow(TypeError)
  })

  it("rejects invalid IDs, unsafe numbers, and malformed diagnostics", () => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [
          { ...effect, resourceId: Number.MAX_SAFE_INTEGER + 1 },
        ],
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: { message: "No", statusCode: 99 },
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: undefined, code: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(TypeError)
  })

  it("accepts an empty diagnostic message", () => {
    expect(() =>
      assertMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
          diagnostic: { message: "" },
        },
        { idempotent: false },
      ),
    ).not.toThrow()
  })

  it("accepts data undefined only when the success object explicitly owns data", () => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: undefined,
        confirmedEffects: [effect],
      }),
    ).not.toThrow()

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        confirmedEffects: [effect],
      }),
    ).toThrow(TypeError)
  })

  it("accepts an empty success effect list only when idempotent", () => {
    const result = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: "already-current",
      confirmedEffects: [],
    }

    expect(() =>
      assertMutationResult(result, { idempotent: true }),
    ).not.toThrow()
  })

  it("rejects a non-idempotent success without an effect", () => {
    expect(() =>
      assertMutationResult(
        {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
          data: "saved-resource",
          confirmedEffects: [],
        },
        { idempotent: false },
      ),
    ).toThrow(TypeError)
  })

  it("rejects present but undefined optional fields and unknown keys", () => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { ...diagnostic, raw: undefined },
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [effect],
        message: undefined,
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic,
        unexpected: true,
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [{ ...effect, unexpected: true }],
      }),
    ).toThrow(TypeError)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { ...diagnostic, unexpected: true },
      }),
    ).toThrow(TypeError)
  })

  it("rejects accessor-backed contract fields without invoking their values", () => {
    let outcomeReads = 0
    const accessorOutcome = {
      data: "saved-resource",
      confirmedEffects: [effect],
    }
    Object.defineProperty(accessorOutcome, "outcome", {
      enumerable: true,
      get: () => {
        outcomeReads += 1
        return outcomeReads === 1
          ? MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
          : MANAGED_SITE_MUTATION_OUTCOMES.Uncertain
      },
    })

    expect(() => assertMutationResult(accessorOutcome)).toThrow(TypeError)
    expect(outcomeReads).toBe(0)

    const accessorDiagnostic = { message: "Not confirmed" }
    Object.defineProperty(accessorDiagnostic, "raw", {
      enumerable: true,
      get: () => {
        throw new Error("raw getter should not run")
      },
    })

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: accessorDiagnostic,
      }),
    ).toThrow(TypeError)
  })

  it("rejects symbol keys and contract fields inherited from custom prototypes", () => {
    const symbolKeyResult = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: "saved-resource",
      confirmedEffects: [effect],
      [Symbol("unexpected")]: true,
    }

    expect(() => assertMutationResult(symbolKeyResult)).toThrow(TypeError)

    const inheritedSuccessMessage = Object.assign(
      Object.create({ message: "inherited" }),
      {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [effect],
      },
    )
    expect(() => assertMutationResult(inheritedSuccessMessage)).toThrow(
      TypeError,
    )

    const inheritedDiagnosticRaw = Object.assign(Object.create({ raw: null }), {
      message: "Not confirmed",
    })
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: inheritedDiagnosticRaw,
      }),
    ).toThrow(TypeError)

    const inheritedDiagnosticMessage = Object.create({ message: "inherited" })
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: inheritedDiagnosticMessage,
      }),
    ).toThrow(TypeError)
  })

  it("accepts null-prototype contract objects with own data properties", () => {
    const result = Object.assign(Object.create(null), {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: Object.assign(Object.create(null), { message: "" }),
    })

    expect(() => assertMutationResult(result)).not.toThrow()
  })

  it("rejects effect arrays with extra own string or symbol keys", () => {
    const stringKeyEffects = [effect]
    Object.defineProperty(stringKeyEffects, "unexpected", { value: true })

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: stringKeyEffects,
      }),
    ).toThrow(TypeError)

    const symbolKeyEffects = [effect]
    Object.defineProperty(symbolKeyEffects, Symbol("unexpected"), {
      value: true,
    })

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: symbolKeyEffects,
        completion: "uncertain",
        diagnostic,
      }),
    ).toThrow(TypeError)
  })

  it("rejects effect arrays with a non-array prototype", () => {
    const exoticEffects = [effect]
    Object.setPrototypeOf(exoticEffects, null)

    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: exoticEffects,
      }),
    ).toThrow(TypeError)
  })

  it.each([
    { code: Number.NaN },
    { code: Number.POSITIVE_INFINITY },
    { code: 1.5 },
    { code: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects invalid numeric diagnostic code $code", ({ code }) => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "Not confirmed", code },
      }),
    ).toThrow(TypeError)
  })

  it.each([99, 600, 200.5])(
    "rejects invalid HTTP status code %s",
    (statusCode) => {
      expect(() =>
        assertMutationResult({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
          diagnostic: { message: "Not confirmed", statusCode },
        }),
      ).toThrow(TypeError)
    },
  )

  it.each([
    "",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid resource ID %s", (resourceId) => {
    expect(() =>
      assertMutationResult({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: "saved-resource",
        confirmedEffects: [{ ...effect, resourceId }],
      }),
    ).toThrow(TypeError)
  })

  it.each([
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { message: "Not confirmed", code: undefined },
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { message: "Not confirmed", statusCode: undefined },
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { message: "Not confirmed", raw: undefined },
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: "saved-resource",
      confirmedEffects: [{ ...effect, resourceId: undefined }],
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: "saved-resource",
      confirmedEffects: [effect],
      message: undefined,
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: undefined,
      confirmedEffects: [effect],
      completion: "uncertain",
      diagnostic,
    },
  ])("rejects present but undefined optional field %#", (result) => {
    expect(() => assertMutationResult(result)).toThrow(TypeError)
  })
})
