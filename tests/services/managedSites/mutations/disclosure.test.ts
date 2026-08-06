import { describe, expect, expectTypeOf, it } from "vitest"

import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  parseManagedSiteExternalMutationSummary,
  parseManagedSitePersistedMutationState,
  parsePrivateManagedSiteMutationOutput,
  toManagedSiteExternalMutationSummary,
  toManagedSitePersistedMutationState,
  toPrivateManagedSiteMutationOutput,
  toPrivateManagedSiteThrownErrorMessage,
  type ManagedSiteExternalMutationSummary,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationPartial,
  type ManagedSiteMutationRejected,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSucceeded,
  type ManagedSitePersistedMutationState,
  type ManagedSitePrivateMutationOutput,
} from "~/services/managedSites/mutations"

const effect: ManagedSiteMutationConfirmedEffect = {
  kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
  resourceKind: "channel",
  resourceId: "resource-42",
}

const succeeded = (
  message = "Saved",
): ManagedSiteMutationSucceeded<
  { id: string },
  ManagedSiteMutationConfirmedEffect
> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data: { id: "private-resource-id" },
  confirmedEffects: [effect],
  message,
})

const rejected = (
  diagnostic: {
    message: string
    code?: string | number
    statusCode?: number
    raw?: unknown
  } = { message: "Rejected", code: "request_rejected", statusCode: 400 },
): ManagedSiteMutationRejected => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  diagnostic,
})

const partial = (): ManagedSiteMutationPartial<
  { id: string },
  ManagedSiteMutationConfirmedEffect
> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
  data: { id: "private-resource-id" },
  confirmedEffects: [effect],
  completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
  diagnostic: {
    message: "The final state could not be confirmed",
    code: "confirmation_failed",
    statusCode: 502,
  },
})

describe("managed site mutation disclosure boundaries", () => {
  it("does not mutate internal diagnostics or traverse their raw nested cause", () => {
    const nestedCause = { token: "nested-secret", message: "Nested failure" }
    const raw = Object.create(null) as Record<string, unknown>
    Object.defineProperty(raw, "cause", {
      enumerable: true,
      get: () => {
        throw new Error("raw cause getter must not run")
      },
    })
    const diagnostic = {
      message: "Bearer known-secret upstream failure",
      code: "known-secret-code",
      statusCode: 502,
      raw,
      cause: nestedCause,
    }
    const result = rejected(diagnostic)

    const output = toPrivateManagedSiteMutationOutput(result, {
      knownSecrets: ["known-secret"],
    })

    expect(output).toEqual({
      outcome: "rejected",
      message: "Bearer [REDACTED] upstream failure",
      code: "[REDACTED]-code",
      statusCode: 502,
    })
    expect(diagnostic.message).toBe("Bearer known-secret upstream failure")
    expect(diagnostic.code).toBe("known-secret-code")
    expect(diagnostic.statusCode).toBe(502)
    expect(diagnostic.raw).toBe(raw)
    expect(diagnostic.cause).toBe(nestedCause)
  })

  it("projects thrown errors through known-secret and structural redaction", () => {
    const secret = "thrown-secret-placeholder"
    const message = toPrivateManagedSiteThrownErrorMessage(
      new Error(
        `Provider failed ${secret} authorization=secondary-private-value`,
        { cause: new Error(`cause ${secret}`) },
      ),
      { knownSecrets: [secret] },
    )

    expect(message).toContain("Provider failed")
    expect(message).not.toContain(secret)
    expect(message).not.toContain("secondary-private-value")
  })

  it("fails closed when a thrown value cannot be inspected safely", () => {
    const thrown = new Proxy(
      {},
      {
        has() {
          throw new Error("inspection unavailable")
        },
      },
    )

    expect(
      toPrivateManagedSiteThrownErrorMessage(thrown, { knownSecrets: [] }),
    ).toBeUndefined()
  })

  it("redacts exact known secrets from success and failure messages and codes", () => {
    const knownSecrets = ["secret-value"]

    expect(
      toPrivateManagedSiteMutationOutput(
        succeeded("Created with secret-value"),
        { knownSecrets },
      ),
    ).toEqual({
      outcome: "succeeded",
      message: "Created with [REDACTED]",
    })

    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "Provider returned secret-value",
          code: "secret-value",
          statusCode: 401,
        }),
        { knownSecrets },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Provider returned [REDACTED]",
      code: "[REDACTED]",
      statusCode: 401,
    })
  })

  it("preserves unknown provider text that only resembles a compact credential", () => {
    const compactText = "eyJhbGciOiJIUzI1NiJ9.payload.signaturevalue"
    const message = `Provider diagnostic ${compactText} rejected`

    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message })
  })

  it.each([
    ["Authorization: Bearer abc.def-123", "Authorization: [REDACTED]"],
    ["Cookie: session=private; theme=dark", "Cookie: [REDACTED]"],
    [
      "Request https://user:password@example.invalid/v1/items?token=private#part failed",
      "Request https://example.invalid/v1/items failed",
    ],
    ["api_key=private-credential", "api_key=[REDACTED]"],
    ["password: private-credential", "password=[REDACTED]"],
  ])("redacts common secret-bearing text %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("applies structural redaction to string codes", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "Safe provider message",
          code: "token=private-credential",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Safe provider message",
      code: "token=[REDACTED]",
    })
  })

  it("drops mutation payloads, effects, raw values, and unknown fields", () => {
    const successResult = {
      ...succeeded(),
      unknown: "private metadata",
    }
    const failureResult = {
      ...rejected({ message: "Rejected", raw: { secret: "private" } }),
      unknown: "private metadata",
    }

    expect(
      toPrivateManagedSiteMutationOutput(successResult, { knownSecrets: [] }),
    ).toEqual({ outcome: "succeeded", message: "Saved" })
    expect(
      toPrivateManagedSiteMutationOutput(failureResult, { knownSecrets: [] }),
    ).toEqual({ outcome: "rejected", message: "Rejected" })
  })

  it("truncates messages at a complete code-point boundary and omits overlong codes", () => {
    const message = `${"a".repeat(4095)}😀trailing`
    const output = toPrivateManagedSiteMutationOutput(
      rejected({
        message,
        code: "x".repeat(257),
      }),
      { knownSecrets: [] },
    )

    expect(output.message).toBe("a".repeat(4095))
    expect(output.message).toHaveLength(4095)
    expect(output).not.toHaveProperty("code")

    const exactBoundary = toPrivateManagedSiteMutationOutput(
      succeeded(`${"a".repeat(4094)}😀trailing`),
      { knownSecrets: [] },
    )
    expect(exactBoundary.message).toHaveLength(4096)
    expect(exactBoundary.message?.endsWith("😀")).toBe(true)
  })

  it("omits a code when redaction expands it beyond the disclosure limit", () => {
    const output = toPrivateManagedSiteMutationOutput(
      rejected({
        message: "Rejected",
        code: `${"a".repeat(250)}x`,
      }),
      { knownSecrets: ["x"] },
    )

    expect(output).toEqual({ outcome: "rejected", message: "Rejected" })
  })

  it("retains an overlong code when known-secret redaction makes it safe", () => {
    const secretCode = "s".repeat(257)
    const output = toPrivateManagedSiteMutationOutput(
      rejected({ message: "Rejected", code: secretCode }),
      { knownSecrets: [secretCode] },
    )

    expect(output).toEqual({
      outcome: "rejected",
      message: "Rejected",
      code: "[REDACTED]",
    })
  })

  it("preserves only valid private status and numeric code values", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({ message: "Rejected", code: 42, statusCode: 429 }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Rejected",
      code: 42,
      statusCode: 429,
    })

    const invalid = rejected({
      message: "Rejected",
      code: Number.POSITIVE_INFINITY,
      statusCode: 99,
    })
    expect(
      toPrivateManagedSiteMutationOutput(invalid, { knownSecrets: [] }),
    ).toEqual({ outcome: "rejected", message: "Rejected" })
  })

  it("keeps persisted and external DTOs minimal and nominally distinct", () => {
    const persisted = toManagedSitePersistedMutationState(partial())
    const external = toManagedSiteExternalMutationSummary(partial())

    expect(persisted).toEqual({
      outcome: "partial",
      completion: "uncertain",
      category: MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES.Partial,
    })
    expect(external).toEqual(persisted)
    expect(Object.keys(persisted)).toEqual([
      "outcome",
      "completion",
      "category",
    ])
    expectTypeOf<ManagedSitePersistedMutationState>().not.toEqualTypeOf<ManagedSiteExternalMutationSummary>()
    expectTypeOf<ManagedSitePrivateMutationOutput>().not.toEqualTypeOf<ManagedSitePersistedMutationState>()

    // @ts-expect-error Persisted state must be revalidated for the external boundary.
    const externalFromPersisted: ManagedSiteExternalMutationSummary = persisted
    // @ts-expect-error External summaries must be revalidated for persistence.
    const persistedFromExternal: ManagedSitePersistedMutationState = external
    void externalFromPersisted
    void persistedFromExternal
  })

  it.each([
    [succeeded(), { outcome: "succeeded", category: "succeeded" }],
    [rejected(), { outcome: "rejected", category: "rejected" }],
    [
      partial(),
      { outcome: "partial", completion: "uncertain", category: "partial" },
    ],
    [
      {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "Not confirmed" },
      } satisfies ManagedSiteMutationResult,
      { outcome: "uncertain", category: "uncertain" },
    ],
  ])(
    "maps controlled categories only from mutation outcome %#",
    (result, expected) => {
      expect(toManagedSitePersistedMutationState(result)).toEqual(expected)
      expect(toManagedSiteExternalMutationSummary(result)).toEqual(expected)
    },
  )

  it("exact-validates unknown serialized input and rebrands it per boundary", () => {
    const serialized: unknown = JSON.parse(
      JSON.stringify({
        outcome: "partial",
        completion: "rejected",
        category: "partial",
      }),
    )

    const privateOutput = parsePrivateManagedSiteMutationOutput({
      outcome: "rejected",
      statusCode: 409,
      code: "conflict",
      message: "Already changed",
    })
    const persisted = parseManagedSitePersistedMutationState(serialized)
    const external = parseManagedSiteExternalMutationSummary(serialized)

    expect(privateOutput).toEqual({
      outcome: "rejected",
      statusCode: 409,
      code: "conflict",
      message: "Already changed",
    })
    expect(persisted).toEqual(serialized)
    expect(external).toEqual(serialized)
    expect(persisted).not.toBe(serialized)
    expect(external).not.toBe(serialized)
  })

  it.each([
    { outcome: "rejected", unknown: true },
    { outcome: "rejected", message: undefined },
    { outcome: "rejected", statusCode: Number.NaN },
    { outcome: "rejected", statusCode: Number.POSITIVE_INFINITY },
    { outcome: "rejected", statusCode: 99 },
    { outcome: "rejected", statusCode: 600 },
    { outcome: "rejected", statusCode: 400.5 },
    { outcome: "rejected", code: Number.NaN },
    { outcome: "rejected", code: Number.POSITIVE_INFINITY },
    { outcome: "rejected", code: Number.MAX_SAFE_INTEGER + 1 },
    { outcome: "rejected", code: "x".repeat(257) },
    { outcome: "rejected", message: "x".repeat(4097) },
    { outcome: "invalid" },
    { outcome: "partial" },
    { outcome: "partial", completion: "complete" },
    { outcome: "succeeded", completion: "rejected" },
  ])("rejects an invalid private DTO %#", (value) => {
    expect(() => parsePrivateManagedSiteMutationOutput(value)).toThrow(
      TypeError,
    )
  })

  it.each([
    { outcome: "rejected", unknown: true },
    { outcome: "rejected", category: undefined },
    { outcome: "rejected", category: "provider-specific" },
    { outcome: "invalid" },
    { outcome: "partial", category: "partial" },
    { outcome: "partial", completion: "complete", category: "partial" },
    { outcome: "succeeded", completion: "rejected", category: "succeeded" },
    { outcome: "rejected", completion: "uncertain", category: "rejected" },
    { outcome: "rejected", category: "succeeded" },
  ])("rejects an invalid persisted or external DTO %#", (value) => {
    expect(() => parseManagedSitePersistedMutationState(value)).toThrow(
      TypeError,
    )
    expect(() => parseManagedSiteExternalMutationSummary(value)).toThrow(
      TypeError,
    )
  })

  it("rejects accessors, symbols, and inherited fields without reading getters", () => {
    let outcomeReads = 0
    const accessor = { category: "rejected" }
    Object.defineProperty(accessor, "outcome", {
      enumerable: true,
      get: () => {
        outcomeReads += 1
        return "rejected"
      },
    })

    expect(() => parseManagedSitePersistedMutationState(accessor)).toThrow(
      TypeError,
    )
    expect(outcomeReads).toBe(0)

    expect(() =>
      parseManagedSiteExternalMutationSummary({
        outcome: "rejected",
        category: "rejected",
        [Symbol("unknown")]: true,
      }),
    ).toThrow(TypeError)

    expect(() =>
      parsePrivateManagedSiteMutationOutput(
        Object.assign(Object.create({ message: "inherited" }), {
          outcome: "rejected",
        }),
      ),
    ).toThrow(TypeError)
  })

  it("accepts null-prototype DTOs with exact own data properties", () => {
    const value = Object.assign(Object.create(null), {
      outcome: "rejected",
      category: "rejected",
    })

    expect(parseManagedSitePersistedMutationState(value)).toEqual({
      outcome: "rejected",
      category: "rejected",
    })
  })

  it("produces cloneable and JSON-round-trippable DTOs without brand fields", () => {
    const privateOutput = toPrivateManagedSiteMutationOutput(
      rejected({ message: "Rejected", code: "safe", statusCode: 400 }),
      { knownSecrets: [] },
    )
    const persisted = toManagedSitePersistedMutationState(partial())
    const external = toManagedSiteExternalMutationSummary(partial())

    expect(structuredClone(privateOutput)).toEqual(privateOutput)
    for (const dto of [privateOutput, persisted, external]) {
      expect(JSON.parse(JSON.stringify(dto))).toEqual(dto)
      expect(Reflect.ownKeys(dto)).toEqual(Object.keys(dto))
    }
  })
})
