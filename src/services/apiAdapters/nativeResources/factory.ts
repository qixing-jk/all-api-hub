import type {
  NativeResourceMutationResult,
  ResourceDisplayFact,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"

export type { NativeResourceMutationResult } from "~/services/apiAdapters/contracts/resourceNative"

type NativeResourceRef = { resourceId: string }

type NativeResourceFacts<TRef> = {
  ref: TRef
  fields: readonly ResourceDisplayFact[]
  searchValues?: readonly string[]
}

export class NativeResourceBoundaryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NativeResourceBoundaryError"
  }
}

export const isNativeResourceBoundaryError = (
  value: unknown,
): value is NativeResourceBoundaryError =>
  value instanceof NativeResourceBoundaryError

const isValidScopeKey = (scopeKey: unknown): scopeKey is string =>
  typeof scopeKey === "string" && scopeKey.length > 0 && scopeKey.length <= 2048

const isValidResourceId = (resourceId: unknown): resourceId is string =>
  typeof resourceId === "string" &&
  resourceId.length > 0 &&
  resourceId.length <= 512

/** Builds and validates canonical provider-owned opaque resource references. */
export function createNativeResourceRefBoundary<
  TRef extends NativeResourceRef,
  TLocator,
>(options: {
  scopeKey: string
  encodeLocator(locator: TLocator): string
  decodeLocator(resourceId: string): TLocator
  buildRef(resourceId: string): TRef
  matchesRef(value: unknown): value is TRef
}) {
  if (!isValidScopeKey(options.scopeKey)) {
    throw new NativeResourceBoundaryError("Invalid native resource scope key")
  }

  const assertBuiltRef = (ref: TRef, expectedResourceId: string): TRef => {
    if (
      !options.matchesRef(ref) ||
      !isValidResourceId(ref.resourceId) ||
      ref.resourceId !== expectedResourceId
    ) {
      throw new NativeResourceBoundaryError("Invalid native resource ref")
    }
    return ref
  }

  const createRef = (locator: TLocator): TRef => {
    const resourceId = options.encodeLocator(locator)
    if (!isValidResourceId(resourceId)) {
      throw new NativeResourceBoundaryError("Invalid native resource id")
    }
    return assertBuiltRef(options.buildRef(resourceId), resourceId)
  }

  const refsMatch = (actual: TRef, expected: TRef): boolean =>
    options.matchesRef(actual) &&
    options.matchesRef(expected) &&
    actual.resourceId === expected.resourceId

  const decodeRef = (value: unknown) => {
    if (!options.matchesRef(value) || !isValidResourceId(value.resourceId)) {
      throw new NativeResourceBoundaryError("Invalid native resource ref")
    }
    const ref = assertBuiltRef(
      options.buildRef(value.resourceId),
      value.resourceId,
    )
    return { ref, locator: options.decodeLocator(ref.resourceId) }
  }

  return { createRef, decodeRef, refsMatch }
}

export const assertNativeResourceFacts = <
  TRef,
  TFacts extends NativeResourceFacts<TRef>,
>(
  facts: TFacts,
  expectedRef: TRef,
  refsMatch: (actual: TRef, expected: TRef) => boolean,
): TFacts => {
  if (!refsMatch(facts.ref, expectedRef)) {
    throw new NativeResourceBoundaryError(
      "Native resource facts do not match the requested ref",
    )
  }

  if (
    facts.searchValues !== undefined &&
    (!Array.isArray(facts.searchValues) ||
      facts.searchValues.some((value) => typeof value !== "string"))
  ) {
    throw new NativeResourceBoundaryError(
      "Native resource facts contain unsafe search values",
    )
  }

  const fieldIds = new Set<string>()
  for (const field of facts.fields) {
    if (fieldIds.has(field.fieldId)) {
      throw new NativeResourceBoundaryError(
        "Native resource facts contain duplicate field ids",
      )
    }
    fieldIds.add(field.fieldId)
  }
  return facts
}

type NativeResourceMutationResolution<T, TFailure> =
  | { status: "applied"; value: T }
  | { status: "not-applied"; failure: TFailure }
  | { status: "uncertain"; failure: TFailure }

const snapshotNativeResourceMutation = <T, TFailure>(
  result: unknown,
): NativeResourceMutationResult<T, TFailure> => {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new NativeResourceBoundaryError("Invalid native resource mutation")
  }

  let certainty: unknown
  try {
    certainty = (result as { certainty: unknown }).certainty
  } catch {
    throw new NativeResourceBoundaryError("Invalid native resource mutation")
  }

  const hasOwn = (key: string) =>
    Object.prototype.hasOwnProperty.call(result, key)
  if (certainty === "applied") {
    if (!hasOwn("value")) {
      throw new NativeResourceBoundaryError("Invalid native resource mutation")
    }
    try {
      return {
        certainty,
        value: (result as { value: T }).value,
      }
    } catch {
      throw new NativeResourceBoundaryError("Invalid native resource mutation")
    }
  }
  if (certainty === "not-applied") {
    if (!hasOwn("failure")) {
      throw new NativeResourceBoundaryError("Invalid native resource mutation")
    }
    try {
      return {
        certainty,
        failure: (result as { failure: TFailure }).failure,
      }
    } catch {
      throw new NativeResourceBoundaryError("Invalid native resource mutation")
    }
  }
  if (certainty === "possibly-applied" || certainty === "partially-applied") {
    if (!hasOwn("failure")) {
      throw new NativeResourceBoundaryError("Invalid native resource mutation")
    }
    try {
      return {
        certainty,
        failure: (result as { failure: TFailure }).failure,
      }
    } catch {
      throw new NativeResourceBoundaryError("Invalid native resource mutation")
    }
  }
  throw new NativeResourceBoundaryError("Invalid native resource mutation")
}

export const resolveNativeResourceMutation = <T, TFailure>(
  result: NativeResourceMutationResult<T, TFailure>,
): NativeResourceMutationResolution<T, TFailure> => {
  const snapshot = snapshotNativeResourceMutation<T, TFailure>(result)
  if (snapshot.certainty === "applied") {
    return { status: "applied", value: snapshot.value }
  }
  if (snapshot.certainty === "not-applied") {
    return { status: "not-applied", failure: snapshot.failure }
  }
  return { status: "uncertain", failure: snapshot.failure }
}

/** Serializes editor mutations and closes only after applied or uncertain work. */
export function createNativeEditorSubmitGate<
  TValues,
  TCommand,
  TMutationValue,
  TFailure,
  TResult,
>(options: {
  validate(values: TValues): void
  buildCommand(values: TValues): TCommand
  mutate(
    command: TCommand,
    operationOptions?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TMutationValue, TFailure>>
  resolve(
    result: NativeResourceMutationResult<TMutationValue, TFailure>,
  ): TResult
  normalizeError?(error: unknown): unknown
  shouldCloseAfterError?(error: unknown): boolean
  closedError?(): Error
}) {
  let closed = false
  let inflight: Promise<TResult> | undefined

  const submit = (
    values: TValues,
    operationOptions?: ResourceOperationOptions,
  ) => {
    if (inflight !== undefined) return inflight
    if (closed) {
      return Promise.reject(
        options.closedError?.() ??
          new Error("Native resource editor is closed"),
      )
    }

    const run = (async () => {
      try {
        options.validate(values)
        const command = options.buildCommand(values)
        const result = snapshotNativeResourceMutation<TMutationValue, TFailure>(
          await options.mutate(command, operationOptions),
        )
        if (result.certainty !== "not-applied") closed = true
        return options.resolve(result)
      } catch (error) {
        const normalizedError = options.normalizeError?.(error) ?? error
        if (options.shouldCloseAfterError?.(normalizedError)) closed = true
        throw normalizedError
      }
    })()
    const tracked = run.finally(() => {
      if (inflight === tracked) inflight = undefined
    })
    inflight = tracked
    return tracked
  }

  return { submit }
}
