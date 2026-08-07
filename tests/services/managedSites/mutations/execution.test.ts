import { describe, expect, it } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  createManagedSiteMutationSequence,
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  runManagedSiteMutationStep,
  toManagedSiteMutationDiagnostic,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"

const firstEffect: ManagedSiteMutationConfirmedEffect = {
  kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
  resourceKind: "channel",
  resourceId: 1,
}

const secondEffect: ManagedSiteMutationConfirmedEffect = {
  kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
  resourceKind: "channel",
  resourceId: 2,
}

const diagnostic = {
  message: "The provider rejected the request.",
  code: API_ERROR_CODES.BUSINESS_ERROR,
}

const completeAppliedStep = (
  sequence: ReturnType<
    typeof createManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  >,
  effect = firstEffect,
) => {
  const attempt = sequence.beginStep()
  attempt.markPossiblyDispatched()
  attempt.markResponseReceived()
  attempt.confirmEffect(effect)
  attempt.complete()
}

describe("managed site mutation execution evidence", () => {
  it("returns rejected for a pre-dispatch operational failure with no active step", () => {
    const error = new ApiError(
      "The provider rejected the request.",
      400,
      "/api/resource",
      API_ERROR_CODES.BUSINESS_ERROR,
    )
    const normalized = toManagedSiteMutationDiagnostic(error)
    const sequence = createManagedSiteMutationSequence({ idempotent: false })

    expect(
      sequence.finish({
        finalState: "unconfirmed",
        diagnostic: normalized,
      }),
    ).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: normalized,
    })
  })

  it("accepts only monotonic dispatch evidence before completing an applied step", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const attempt = sequence.beginStep()

    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    attempt.confirmEffect(firstEffect)
    attempt.complete()

    expect(
      sequence.finish({ finalState: "confirmed", data: "created" }),
    ).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: "created",
      confirmedEffects: [firstEffect],
    })
  })

  it("rejects backwards, overlapping, and repeated completion transitions", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const attempt = sequence.beginStep()

    expect(() => attempt.markResponseReceived()).toThrow(TypeError)
    expect(() => sequence.beginStep()).toThrow(TypeError)

    attempt.markPossiblyDispatched()
    expect(() => attempt.markPossiblyDispatched()).toThrow(TypeError)
    attempt.markResponseReceived()
    expect(() => attempt.markPossiblyDispatched()).toThrow(TypeError)
    expect(() => attempt.markResponseReceived()).toThrow(TypeError)

    attempt.confirmEffect(firstEffect)
    expect(() => attempt.confirmNonApplication()).toThrow(TypeError)
    attempt.complete()
    expect(() => attempt.complete()).toThrow(TypeError)
  })

  it("rejects effect-plus-non-application evidence in either order", () => {
    const effectFirst = createManagedSiteMutationSequence({ idempotent: false })
    const effectAttempt = effectFirst.beginStep()
    effectAttempt.markPossiblyDispatched()
    effectAttempt.markResponseReceived()
    effectAttempt.confirmEffect(firstEffect)
    expect(() => effectAttempt.confirmNonApplication()).toThrow(TypeError)

    const rejectionFirst = createManagedSiteMutationSequence({
      idempotent: false,
    })
    const rejectionAttempt = rejectionFirst.beginStep()
    rejectionAttempt.markPossiblyDispatched()
    rejectionAttempt.markResponseReceived()
    rejectionAttempt.confirmNonApplication()
    expect(() => rejectionAttempt.confirmEffect(firstEffect)).toThrow(TypeError)
  })

  it("seals the sequence after rejected or uncertain terminal evidence", () => {
    for (const possiblyDispatched of [false, true]) {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const attempt = sequence.beginStep()
      if (possiblyDispatched) attempt.markPossiblyDispatched()
      attempt.complete()

      expect(() => sequence.beginStep()).toThrow(TypeError)
    }
  })

  it("requires final-state confirmation and effects according to idempotency", () => {
    const nonIdempotent = createManagedSiteMutationSequence({
      idempotent: false,
    })
    expect(() =>
      nonIdempotent.finish({ finalState: "confirmed", data: "created" }),
    ).toThrow(TypeError)

    const unresolved = createManagedSiteMutationSequence({ idempotent: true })
    unresolved.beginStep()
    expect(() =>
      unresolved.finish({ finalState: "confirmed", data: undefined }),
    ).toThrow(TypeError)

    const idempotent = createManagedSiteMutationSequence({ idempotent: true })
    expect(
      idempotent.finish({ finalState: "confirmed", data: undefined }),
    ).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    })

    const missingData = createManagedSiteMutationSequence({ idempotent: true })
    expect(() =>
      missingData.finish({ finalState: "confirmed" } as never),
    ).toThrow(TypeError)
  })

  it("rejects repeated, malformed, and unsupported terminal evidence", () => {
    const finished = createManagedSiteMutationSequence({ idempotent: true })
    finished.finish({ finalState: "confirmed", data: undefined })
    expect(() =>
      finished.finish({ finalState: "confirmed", data: undefined }),
    ).toThrow(TypeError)

    const malformed = createManagedSiteMutationSequence({ idempotent: true })
    expect(() =>
      (malformed.finish as (input: unknown) => unknown)(null),
    ).toThrow(TypeError)

    const unsupported = createManagedSiteMutationSequence({ idempotent: true })
    expect(() =>
      unsupported.finish({ finalState: "unknown" } as never),
    ).toThrow(TypeError)
  })

  it("rejects an unconfirmed finish while an active step owns an effect", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const attempt = sequence.beginStep()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    attempt.confirmEffect(firstEffect)

    expect(() =>
      sequence.finish({ finalState: "unconfirmed", diagnostic }),
    ).toThrow(TypeError)
  })

  it("defaults a prior confirmed effect without terminal step evidence to partial uncertainty", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    completeAppliedStep(sequence)

    expect(sequence.finish({ finalState: "unconfirmed", diagnostic })).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      confirmedEffects: [firstEffect],
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
      diagnostic,
    })
  })

  it("classifies a prior effect followed by pre-dispatch rejection as partial/rejected", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    completeAppliedStep(sequence)
    sequence.beginStep()

    expect(sequence.finish({ finalState: "unconfirmed", diagnostic })).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      confirmedEffects: [firstEffect],
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Rejected,
      diagnostic,
    })
  })

  it("classifies a prior effect followed by affirmative non-application as partial/rejected", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    completeAppliedStep(sequence)
    const attempt = sequence.beginStep()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    attempt.confirmNonApplication()
    attempt.complete()

    expect(sequence.finish({ finalState: "unconfirmed", diagnostic })).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      confirmedEffects: [firstEffect],
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Rejected,
      diagnostic,
    })
  })

  it.each([
    new DOMException("Timed out", "TimeoutError"),
    new DOMException("Aborted", "AbortError"),
    new TypeError("Failed to fetch"),
  ])(
    "classifies a prior effect followed by post-dispatch %s as partial/uncertain",
    async (error) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      completeAppliedStep(sequence)

      const stepResult = await runManagedSiteMutationStep({
        sequence,
        effect: secondEffect,
        execute: async (observer) => {
          observer.onDispatch()
          throw error
        },
        classifyResponse: () => ({ outcome: "applied", data: "unused" }),
      })

      expect(stepResult.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Uncertain)
      if (stepResult.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Uncertain) {
        expect(stepResult.diagnostic.raw).toBe(error)
        expect(
          sequence.finish({
            finalState: "unconfirmed",
            diagnostic: stepResult.diagnostic,
          }),
        ).toEqual({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
          confirmedEffects: [firstEffect],
          completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
          diagnostic: stepResult.diagnostic,
        })
      }
    },
  )

  it("returns uncertain for post-dispatch ambiguity with no confirmed effect", () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const attempt = sequence.beginStep()
    attempt.markPossiblyDispatched()

    expect(sequence.finish({ finalState: "unconfirmed", diagnostic })).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic,
    })
  })

  it("runs applied and affirmative rejected provider classifications", async () => {
    const appliedSequence = createManagedSiteMutationSequence({
      idempotent: false,
    })
    const applied = await runManagedSiteMutationStep({
      sequence: appliedSequence,
      effect: firstEffect,
      execute: async (observer) => {
        observer.onDispatch()
        observer.onResponse()
        return { id: 1 }
      },
      classifyResponse: (response) => ({ outcome: "applied", data: response }),
    })
    expect(applied).toEqual({ outcome: "applied", data: { id: 1 } })
    if (applied.outcome === "applied") {
      expect(
        appliedSequence.finish({ finalState: "confirmed", data: applied.data }),
      ).toMatchObject({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        confirmedEffects: [firstEffect],
      })
    }

    const rejectedSequence = createManagedSiteMutationSequence({
      idempotent: false,
    })
    const rejected = await runManagedSiteMutationStep({
      sequence: rejectedSequence,
      effect: firstEffect,
      execute: async (observer) => {
        observer.onDispatch()
        observer.onResponse()
        return { accepted: false }
      },
      classifyResponse: () => ({ outcome: "rejected", diagnostic }),
    })
    expect(rejected).toEqual({ outcome: "rejected", diagnostic })
    expect(
      rejectedSequence.finish({ finalState: "unconfirmed", diagnostic }),
    ).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic,
    })
  })

  it("normalizes a protocol error thrown while classifying a received response", async () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const protocolError = new ApiError(
      "The response body was malformed.",
      200,
      "/api/resource",
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )

    const result = await runManagedSiteMutationStep({
      sequence,
      effect: firstEffect,
      execute: async (observer) => {
        observer.onDispatch()
        observer.onResponse()
        return "malformed"
      },
      classifyResponse: () => {
        throw protocolError
      },
    })

    expect(result).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: {
        message: protocolError.message,
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
        statusCode: 200,
        raw: protocolError,
      },
    })
    expect(() => sequence.beginStep()).toThrow(TypeError)
  })

  it("requires response-received evidence before classifying a resolved request", async () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    let classifyResponseCalled = false
    const protocolError = new ApiError(
      "The response body was malformed.",
      200,
      "/api/resource",
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )

    await expect(
      runManagedSiteMutationStep({
        sequence,
        effect: firstEffect,
        execute: async () => "malformed",
        classifyResponse: () => {
          classifyResponseCalled = true
          throw protocolError
        },
      }),
    ).rejects.toThrow(TypeError)
    expect(classifyResponseCalled).toBe(false)
    expect(() => sequence.beginStep()).toThrow(TypeError)
  })

  it("retains prior effects when response classification fails operationally", async () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    completeAppliedStep(sequence)
    const protocolError = new ApiError(
      "The response body was malformed.",
      200,
      "/api/resource",
      API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
    )

    const stepResult = await runManagedSiteMutationStep({
      sequence,
      effect: secondEffect,
      execute: async (observer) => {
        observer.onDispatch()
        observer.onResponse()
        return "malformed"
      },
      classifyResponse: () => {
        throw protocolError
      },
    })

    expect(stepResult.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Uncertain)
    if (stepResult.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Uncertain) {
      expect(
        sequence.finish({
          finalState: "unconfirmed",
          diagnostic: stepResult.diagnostic,
        }),
      ).toEqual({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [firstEffect],
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
        diagnostic: stepResult.diagnostic,
      })
    }
  })

  it("rethrows programming errors from response classification", async () => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })
    const programmingError = new Error("Classifier invariant failed")

    await expect(
      runManagedSiteMutationStep({
        sequence,
        effect: firstEffect,
        execute: async (observer) => {
          observer.onDispatch()
          observer.onResponse()
          return "response"
        },
        classifyResponse: () => {
          throw programmingError
        },
      }),
    ).rejects.toBe(programmingError)
    expect(() => sequence.beginStep()).toThrow(TypeError)
  })

  it("keeps effect inference owned by the sequence specialization", () => {
    type CreatedEffect = Omit<ManagedSiteMutationConfirmedEffect, "kind"> & {
      kind: typeof MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated
    }
    const createdEffect: CreatedEffect = {
      kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
      resourceKind: "channel",
      resourceId: 1,
    }
    const updatedEffect = {
      kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
      resourceKind: "channel",
      resourceId: 2,
    } as const satisfies ManagedSiteMutationConfirmedEffect
    const broadlyTypedUpdatedEffect: ManagedSiteMutationConfirmedEffect =
      updatedEffect

    const compileOnly = () => {
      const sequence = createManagedSiteMutationSequence<CreatedEffect>({
        idempotent: false,
      })
      void runManagedSiteMutationStep({
        sequence,
        effect: createdEffect,
        execute: async (observer) => {
          observer.onDispatch()
          observer.onResponse()
          return "created"
        },
        classifyResponse: (data) => ({ outcome: "applied", data }),
      })
      void runManagedSiteMutationStep({
        sequence,
        // @ts-expect-error A broad effect must not widen the sequence specialization.
        effect: broadlyTypedUpdatedEffect,
        execute: async (observer) => {
          observer.onDispatch()
          observer.onResponse()
          return "updated"
        },
        classifyResponse: (data) => ({ outcome: "applied", data }),
      })
    }

    expect(compileOnly).toBeTypeOf("function")
  })

  it("treats malformed upstream protocol data as operational and malformed adapter evidence as invariant", async () => {
    const protocolError = new ApiError(
      "The response was not valid JSON.",
      200,
      "/api/resource",
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )

    expect(toManagedSiteMutationDiagnostic(protocolError)).toEqual({
      message: protocolError.message,
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
      statusCode: 200,
      raw: protocolError,
    })

    const malformedClassifierSequence = createManagedSiteMutationSequence({
      idempotent: false,
    })
    await expect(
      runManagedSiteMutationStep({
        sequence: malformedClassifierSequence,
        effect: firstEffect,
        execute: async (observer) => {
          observer.onDispatch()
          observer.onResponse()
          return "malformed"
        },
        classifyResponse: () => ({ outcome: "uncertain" }) as never,
      }),
    ).rejects.toThrow(TypeError)

    const malformedEffectSequence = createManagedSiteMutationSequence({
      idempotent: false,
    })
    const attempt = malformedEffectSequence.beginStep()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    expect(() =>
      attempt.confirmEffect({
        kind: "invented-effect",
        resourceKind: "channel",
      } as never),
    ).toThrow(TypeError)
  })

  it.each([
    { label: "primitive", value: null },
    {
      label: "custom prototype",
      value: Object.create({ outcome: "applied", data: "created" }),
    },
    {
      label: "accessor property",
      value: Object.defineProperty({}, "outcome", {
        enumerable: true,
        get: () => "applied",
      }),
    },
    {
      label: "throwing record proxy",
      value: new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error("classifier inspection unavailable")
          },
        },
      ),
    },
  ])("rejects $label classifier evidence", async ({ value }) => {
    const sequence = createManagedSiteMutationSequence({ idempotent: false })

    await expect(
      runManagedSiteMutationStep({
        sequence,
        effect: firstEffect,
        execute: async (observer) => {
          observer.onDispatch()
          observer.onResponse()
          return "created"
        },
        classifyResponse: () => value as never,
      }),
    ).rejects.toThrow(TypeError)
  })
})

describe("managed site mutation diagnostic normalization", () => {
  it("prefers typed outer operational fields over recognized causes", () => {
    const inner = new ApiError("inner", 429, "/inner", API_ERROR_CODES.HTTP_429)
    const outer = new ApiError(
      "outer",
      503,
      "/outer",
      API_ERROR_CODES.HTTP_OTHER,
    ) as ApiError & { cause: unknown }
    outer.cause = inner

    expect(toManagedSiteMutationDiagnostic(outer)).toEqual({
      message: "outer",
      code: API_ERROR_CODES.HTTP_OTHER,
      statusCode: 503,
      raw: outer,
    })
  })

  it("uses the nearest recognized cause and falls back to the outer safe message", () => {
    const nearest = new ApiError(
      "nearest",
      429,
      "/nearest",
      API_ERROR_CODES.HTTP_429,
    ) as ApiError & { cause: unknown }
    nearest.cause = new ApiError(
      "farther",
      503,
      "/farther",
      API_ERROR_CODES.HTTP_OTHER,
    )
    const outer = new Error("outer context", { cause: nearest })

    expect(toManagedSiteMutationDiagnostic(outer)).toEqual({
      message: "nearest",
      code: API_ERROR_CODES.HTTP_429,
      statusCode: 429,
      raw: outer,
    })

    const inaccessibleMessage = { code: API_ERROR_CODES.NETWORK_ERROR }
    Object.defineProperty(inaccessibleMessage, "message", {
      get: () => {
        throw new Error("must not escape")
      },
    })
    const wrapper = new Error("Request failed safely", {
      cause: inaccessibleMessage,
    })
    expect(toManagedSiteMutationDiagnostic(wrapper)).toEqual({
      message: "Request failed safely",
      code: API_ERROR_CODES.NETWORK_ERROR,
      raw: wrapper,
    })
  })

  it("prefers a typed cause over the outer network-message heuristic", () => {
    const cause = new ApiError(
      "typed cause",
      429,
      "/resource",
      API_ERROR_CODES.HTTP_429,
    )
    const outer = { message: "Network error", cause }

    expect(toManagedSiteMutationDiagnostic(outer)).toEqual({
      message: "typed cause",
      code: API_ERROR_CODES.HTTP_429,
      statusCode: 429,
      raw: outer,
    })
  })

  it.each([
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "fetch failed",
  ])("recognizes the browser fetch failure %s", (message) => {
    const error = new TypeError(message)

    expect(toManagedSiteMutationDiagnostic(error)).toEqual({
      message,
      raw: error,
    })
  })

  it.each([
    {
      label: "Chromium TypeError",
      cause: new TypeError("Failed to fetch"),
      message: "Failed to fetch",
    },
    {
      label: "Firefox TypeError",
      cause: new TypeError("NetworkError when attempting to fetch resource."),
      message: "NetworkError when attempting to fetch resource.",
    },
    {
      label: "string cause",
      cause: "fetch failed",
      message: "fetch failed",
    },
    {
      label: "message-shaped cause",
      cause: { message: "Network error" },
      message: "Network error",
    },
  ])("recognizes a nested $label transport failure", ({ cause, message }) => {
    const outer = new Error("neutral wrapper", { cause })

    expect(toManagedSiteMutationDiagnostic(outer)).toEqual({
      message,
      raw: outer,
    })
  })

  it("prefers a nearer message-recognized cause over a farther typed cause", () => {
    const farther = new ApiError(
      "farther typed failure",
      503,
      "/resource",
      API_ERROR_CODES.HTTP_OTHER,
    )
    const nearer = new TypeError("Failed to fetch", { cause: farther })
    const outer = new Error("neutral wrapper", { cause: nearer })

    expect(toManagedSiteMutationDiagnostic(outer)).toEqual({
      message: "Failed to fetch",
      raw: outer,
    })
  })

  it.each([
    new TypeError("Cannot read properties of undefined"),
    "provider rejected the request",
  ])("does not recognize the arbitrary nested cause %s", (cause) => {
    const outer = new Error("neutral wrapper", { cause })

    expect(() => toManagedSiteMutationDiagnostic(outer)).toThrow(outer)
  })

  it("bounds cause traversal to eight levels", () => {
    const wrap = (cause: unknown) => new Error("wrapper", { cause })
    let atLimit: unknown = new ApiError(
      "at limit",
      502,
      "/resource",
      API_ERROR_CODES.HTTP_OTHER,
    )
    for (let depth = 0; depth < 8; depth += 1) atLimit = wrap(atLimit)
    expect(toManagedSiteMutationDiagnostic(atLimit)).toMatchObject({
      message: "at limit",
      statusCode: 502,
      raw: atLimit,
    })

    let beyondLimit: unknown = new ApiError(
      "beyond limit",
      502,
      "/resource",
      API_ERROR_CODES.HTTP_OTHER,
    )
    for (let depth = 0; depth < 9; depth += 1) beyondLimit = wrap(beyondLimit)
    expect(() => toManagedSiteMutationDiagnostic(beyondLimit)).toThrow(
      beyondLimit as Error,
    )
  })

  it("is cycle-safe and getter-safe", () => {
    const cyclic = new Error("wrapper") as Error & { cause: unknown }
    cyclic.cause = cyclic
    expect(() => toManagedSiteMutationDiagnostic(cyclic)).toThrow(cyclic)

    const getterCause = { message: "Request timed out" }
    Object.defineProperty(getterCause, "cause", {
      get: () => {
        throw new Error("must not escape")
      },
    })
    expect(toManagedSiteMutationDiagnostic(getterCause)).toEqual({
      message: "Request timed out",
      raw: getterCause,
    })
  })

  it("contains instanceof prototype traps while preserving the original value", () => {
    const prototypeTrap = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("prototype unavailable")
        },
      },
    )
    let caught: unknown

    try {
      toManagedSiteMutationDiagnostic(prototypeTrap)
    } catch (error) {
      caught = error
    }

    expect(caught).toBe(prototypeTrap)
  })

  it("traverses a callable wrapper to its recognized operational cause", () => {
    const cause = new ApiError(
      "provider unavailable",
      503,
      "/api/resource",
      API_ERROR_CODES.HTTP_OTHER,
    )
    const wrapper = Object.assign(() => undefined, { cause })

    expect(toManagedSiteMutationDiagnostic(wrapper)).toEqual({
      message: cause.message,
      code: API_ERROR_CODES.HTTP_OTHER,
      statusCode: 503,
      raw: wrapper,
    })
  })

  it("does not convert arbitrary programming errors into operational diagnostics", () => {
    const programmingError = new TypeError(
      "Cannot read properties of undefined",
    )

    expect(() => toManagedSiteMutationDiagnostic(programmingError)).toThrow(
      programmingError,
    )
  })
})
