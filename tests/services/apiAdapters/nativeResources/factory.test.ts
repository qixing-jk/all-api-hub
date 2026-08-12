import { describe, expect, it, vi } from "vitest"

import {
  assertNativeResourceFacts,
  createNativeEditorSubmitGate,
  createNativeResourceRefBoundary,
  NativeResourceBoundaryError,
  resolveNativeResourceMutation,
  type NativeResourceMutationResult,
} from "~/services/apiAdapters/nativeResources/factory"

type ExampleRef = { provider: "example"; scopeKey: string; resourceId: string }

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const createBoundary = () =>
  createNativeResourceRefBoundary<ExampleRef, { id: string }>({
    scopeKey: "scope-a",
    encodeLocator: (locator) => locator.id,
    decodeLocator: (resourceId) => ({ id: resourceId }),
    buildRef: (resourceId) => ({
      provider: "example",
      scopeKey: "scope-a",
      resourceId,
    }),
    matchesRef: (value): value is ExampleRef =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      (value as Partial<ExampleRef>).provider === "example" &&
      (value as Partial<ExampleRef>).scopeKey === "scope-a" &&
      typeof (value as Partial<ExampleRef>).resourceId === "string",
  })

describe("native resource factory primitives", () => {
  it("constructs canonical opaque refs and correlates facts", () => {
    const boundary = createBoundary()
    const ref = boundary.createRef({ id: "opaque:id/alpha" })
    const decoded = boundary.decodeRef(ref)
    const facts = assertNativeResourceFacts(
      {
        ref,
        fields: [{ fieldId: "name", kind: "text", value: "Example" }],
        searchValues: ["Example"],
      },
      ref,
      boundary.refsMatch,
    )

    expect(ref.resourceId).toBe("opaque:id/alpha")
    expect(decoded).toEqual({ ref, locator: { id: "opaque:id/alpha" } })
    expect(facts.ref).toBe(ref)
  })

  it("rejects facts whose ref does not match the requested opaque resource", () => {
    const boundary = createBoundary()
    const requestedRef = boundary.createRef({ id: "opaque-id" })
    const mismatchedRef = boundary.createRef({ id: "other-opaque-id" })

    expect(() =>
      assertNativeResourceFacts(
        {
          ref: mismatchedRef,
          fields: [],
        },
        requestedRef,
        boundary.refsMatch,
      ),
    ).toThrow()
  })

  it("rejects provider builders that substitute an opaque resource id", () => {
    const buildSubstitutedBoundary = () =>
      createNativeResourceRefBoundary<ExampleRef, { id: string }>({
        scopeKey: "scope-a",
        encodeLocator: (locator) => locator.id,
        decodeLocator: (resourceId) => ({ id: resourceId }),
        buildRef: () => ({
          provider: "example",
          scopeKey: "scope-a",
          resourceId: "substituted-id",
        }),
        matchesRef: (value): value is ExampleRef =>
          typeof value === "object" &&
          value !== null &&
          (value as Partial<ExampleRef>).provider === "example" &&
          (value as Partial<ExampleRef>).scopeKey === "scope-a" &&
          typeof (value as Partial<ExampleRef>).resourceId === "string",
      })

    expect(() =>
      buildSubstitutedBoundary().createRef({ id: "opaque-id" }),
    ).toThrow()
    expect(() =>
      buildSubstitutedBoundary().decodeRef({
        provider: "example",
        scopeKey: "scope-a",
        resourceId: "opaque-id",
      }),
    ).toThrow()

    const buildMalformedBoundary = () =>
      createNativeResourceRefBoundary<ExampleRef, { id: string }>({
        scopeKey: "scope-a",
        encodeLocator: (locator) => locator.id,
        decodeLocator: (resourceId) => ({ id: resourceId }),
        buildRef: (resourceId) => ({
          provider: "other" as ExampleRef["provider"],
          scopeKey: "scope-a",
          resourceId,
        }),
        matchesRef: (value): value is ExampleRef =>
          typeof value === "object" &&
          value !== null &&
          (value as Partial<ExampleRef>).provider === "example" &&
          (value as Partial<ExampleRef>).scopeKey === "scope-a" &&
          typeof (value as Partial<ExampleRef>).resourceId === "string",
      })

    expect(() =>
      buildMalformedBoundary().createRef({ id: "opaque-id" }),
    ).toThrow()
  })

  it("rejects invalid refs, duplicate fact ids, and unsafe search values", () => {
    const boundary = createBoundary()
    const ref = boundary.createRef({ id: "opaque-id" })

    expect(() => boundary.decodeRef({ ...ref, resourceId: "" })).toThrow()
    expect(() =>
      assertNativeResourceFacts(
        {
          ref,
          fields: [
            { fieldId: "name", kind: "text", value: "first" },
            { fieldId: "name", kind: "text", value: "second" },
          ],
        },
        ref,
        boundary.refsMatch,
      ),
    ).toThrow()
    expect(() =>
      assertNativeResourceFacts(
        {
          ref,
          fields: [],
          searchValues: ["safe", 1] as unknown as readonly string[],
        },
        ref,
        boundary.refsMatch,
      ),
    ).toThrow()
  })

  it("resolves applied, rejected, and uncertain mutation certainty", () => {
    const applied = resolveNativeResourceMutation({
      certainty: "applied",
      value: "saved",
    })
    const rejected = resolveNativeResourceMutation<string, "denied">({
      certainty: "not-applied",
      failure: "denied",
    })
    const possiblyApplied = resolveNativeResourceMutation<string, string>({
      certainty: "possibly-applied",
      failure: "request timed out",
    })
    const partiallyApplied = resolveNativeResourceMutation<string, string>({
      certainty: "partially-applied",
      failure: "status update failed",
    })

    expect(applied).toEqual({ status: "applied", value: "saved" })
    expect(rejected).toEqual({ status: "not-applied", failure: "denied" })
    expect(possiblyApplied).toEqual({
      status: "uncertain",
      failure: "request timed out",
    })
    expect(partiallyApplied).toEqual({
      status: "uncertain",
      failure: "status update failed",
    })
  })

  it("rejects an invalid runtime mutation certainty discriminator", () => {
    expect(() =>
      resolveNativeResourceMutation({
        certainty: "invalid",
      } as unknown as NativeResourceMutationResult<string, "denied">),
    ).toThrow(NativeResourceBoundaryError)
  })

  it.each(["possibly-applied", "partially-applied"] as const)(
    "rejects %s mutations without a readable failure",
    (certainty) => {
      expect(() =>
        resolveNativeResourceMutation({
          certainty,
        } as unknown as NativeResourceMutationResult<string, "denied">),
      ).toThrow(NativeResourceBoundaryError)

      const mutation = { certainty } as Record<string, unknown>
      Object.defineProperty(mutation, "failure", {
        enumerable: true,
        get: () => {
          throw new Error("unreadable failure")
        },
      })
      expect(() =>
        resolveNativeResourceMutation(
          mutation as unknown as NativeResourceMutationResult<string, "denied">,
        ),
      ).toThrow(NativeResourceBoundaryError)
    },
  )

  it.each([
    ["certainty", "certainty", {}],
    ["applied value", "value", { certainty: "applied" }],
    ["not-applied failure", "failure", { certainty: "not-applied" }],
  ])("rejects a mutation with a throwing %s getter", (_, property, base) => {
    const mutation = { ...base } as Record<string, unknown>
    Object.defineProperty(mutation, property, {
      enumerable: true,
      get: () => {
        throw new Error("unreadable mutation")
      },
    })

    expect(() =>
      resolveNativeResourceMutation(
        mutation as unknown as NativeResourceMutationResult<string, "denied">,
      ),
    ).toThrow(NativeResourceBoundaryError)
  })

  it("shares an in-flight editor submission and retries only a definite rejection", async () => {
    const deferred =
      createDeferred<NativeResourceMutationResult<string, "denied">>()
    const mutate = vi.fn(() => deferred.promise)
    const gate = createNativeEditorSubmitGate({
      validate: () => undefined,
      buildCommand: (value: string) => value,
      mutate,
      resolve: (result) => {
        const resolution = resolveNativeResourceMutation(result)
        if (resolution.status === "applied") return resolution.value
        if (resolution.status === "not-applied")
          throw new Error(resolution.failure)
        throw new Error("uncertain")
      },
    })

    const first = gate.submit("first")
    const second = gate.submit("second")
    expect(first).toBe(second)
    deferred.resolve({ certainty: "not-applied", failure: "denied" })
    await expect(first).rejects.toThrow("denied")

    await expect(gate.submit("retry")).rejects.toThrow("denied")
    expect(mutate).toHaveBeenCalledTimes(2)
  })

  it("permanently closes an editor after applied or uncertain mutations", async () => {
    for (const result of [
      { certainty: "applied", value: "saved" } as const,
      { certainty: "possibly-applied", failure: "request timed out" } as const,
    ]) {
      const gate = createNativeEditorSubmitGate({
        validate: () => undefined,
        buildCommand: (value: string) => value,
        mutate: async () => result,
        resolve: (mutation) => {
          const resolution = resolveNativeResourceMutation(mutation)
          if (resolution.status === "applied") return resolution.value
          throw new Error("uncertain")
        },
      })

      await gate.submit("first").catch(() => undefined)
      await expect(gate.submit("replay")).rejects.toThrow()
    }
  })
})
