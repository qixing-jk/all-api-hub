import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_FINAL_STATES,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationDiagnostic,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSucceeded,
} from "~/services/managedSites/mutations/contracts"

const MAX_OPERATIONAL_CAUSE_DEPTH = 8

const ATTEMPT_STAGES = {
  NotDispatched: 0,
  PossiblyDispatched: 1,
  ResponseReceived: 2,
} as const

type AttemptStage = (typeof ATTEMPT_STAGES)[keyof typeof ATTEMPT_STAGES]

type AttemptState<TEffect extends ManagedSiteMutationConfirmedEffect> = {
  stage: AttemptStage
  effect?: TEffect
  nonApplication: boolean
  completed: boolean
}

type SequenceState<TEffect extends ManagedSiteMutationConfirmedEffect> = {
  activeAttempt?: AttemptState<TEffect>
  confirmedEffects: TEffect[]
  lastCompletion?:
    | typeof MANAGED_SITE_MUTATION_COMPLETIONS.Rejected
    | typeof MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain
  finished: boolean
}

export interface ManagedSiteMutationStepAttempt<
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  markPossiblyDispatched(): void
  markResponseReceived(): void
  confirmNonApplication(): void
  confirmEffect(effect: TEffect): void
  complete(): void
}

export interface ManagedSiteMutationSequence<
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  beginStep(): ManagedSiteMutationStepAttempt<TEffect>
  finish<TData>(input: {
    finalState: "confirmed"
    data: TData
  }): ManagedSiteMutationSucceeded<TData, TEffect>
  finish<TData = never>(input: {
    finalState: "unconfirmed"
    data?: TData
    diagnostic: ManagedSiteMutationDiagnostic
  }): Exclude<
    ManagedSiteMutationResult<TData, TEffect>,
    { outcome: "succeeded" }
  >
}

const invalidExecutionEvidence = (): never => {
  throw new TypeError("Invalid managed site mutation execution evidence")
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

/** Validates provider-authored diagnostic evidence through the shared contract guard. */
function assertDiagnostic(
  diagnostic: unknown,
): asserts diagnostic is ManagedSiteMutationDiagnostic {
  assertManagedSiteMutationResult(
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic,
    },
    { idempotent: false },
  )
}

const assertEffect = <TEffect extends ManagedSiteMutationConfirmedEffect>(
  effect: TEffect,
): void => {
  assertManagedSiteMutationResult(
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [effect],
    },
    { idempotent: false },
  )
}

const getAttemptCompletion = <
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  attempt: AttemptState<TEffect>,
) => {
  if (
    attempt.nonApplication ||
    attempt.stage === ATTEMPT_STAGES.NotDispatched
  ) {
    return MANAGED_SITE_MUTATION_COMPLETIONS.Rejected
  }

  return MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain
}

/** Composes ordered step evidence into one provider-neutral mutation result. */
export function createManagedSiteMutationSequence<
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(options: { idempotent: boolean }): ManagedSiteMutationSequence<TEffect> {
  const state: SequenceState<TEffect> = {
    confirmedEffects: [],
    finished: false,
  }

  const assertAttemptActive = (attempt: AttemptState<TEffect>) => {
    if (
      state.finished ||
      state.activeAttempt !== attempt ||
      attempt.completed
    ) {
      invalidExecutionEvidence()
    }
  }

  const completeAttempt = (attempt: AttemptState<TEffect>) => {
    assertAttemptActive(attempt)

    if (attempt.effect !== undefined) {
      state.confirmedEffects.push(attempt.effect)
      state.lastCompletion = undefined
    } else {
      state.lastCompletion = getAttemptCompletion(attempt)
    }

    attempt.completed = true
    state.activeAttempt = undefined
  }

  const beginStep = (): ManagedSiteMutationStepAttempt<TEffect> => {
    if (
      state.finished ||
      state.activeAttempt !== undefined ||
      state.lastCompletion !== undefined
    ) {
      return invalidExecutionEvidence()
    }

    const attempt: AttemptState<TEffect> = {
      stage: ATTEMPT_STAGES.NotDispatched,
      nonApplication: false,
      completed: false,
    }
    state.activeAttempt = attempt

    return {
      markPossiblyDispatched() {
        assertAttemptActive(attempt)
        if (attempt.stage !== ATTEMPT_STAGES.NotDispatched) {
          invalidExecutionEvidence()
        }
        attempt.stage = ATTEMPT_STAGES.PossiblyDispatched
      },
      markResponseReceived() {
        assertAttemptActive(attempt)
        if (attempt.stage !== ATTEMPT_STAGES.PossiblyDispatched) {
          invalidExecutionEvidence()
        }
        attempt.stage = ATTEMPT_STAGES.ResponseReceived
      },
      confirmNonApplication() {
        assertAttemptActive(attempt)
        if (
          attempt.stage !== ATTEMPT_STAGES.ResponseReceived ||
          attempt.nonApplication ||
          attempt.effect !== undefined
        ) {
          invalidExecutionEvidence()
        }
        attempt.nonApplication = true
      },
      confirmEffect(effect) {
        assertAttemptActive(attempt)
        if (
          attempt.stage !== ATTEMPT_STAGES.ResponseReceived ||
          attempt.nonApplication ||
          attempt.effect !== undefined
        ) {
          invalidExecutionEvidence()
        }
        assertEffect(effect)
        attempt.effect = effect
      },
      complete() {
        completeAttempt(attempt)
      },
    }
  }

  function finish<TData>(input: {
    finalState: "confirmed"
    data: TData
  }): ManagedSiteMutationSucceeded<TData, TEffect>
  function finish<TData = never>(input: {
    finalState: "unconfirmed"
    data?: TData
    diagnostic: ManagedSiteMutationDiagnostic
  }): Exclude<
    ManagedSiteMutationResult<TData, TEffect>,
    { outcome: "succeeded" }
  >
  /** Produces the sequence result exactly once from confirmed or terminal evidence. */
  function finish<TData>(
    input:
      | { finalState: "confirmed"; data: TData }
      | {
          finalState: "unconfirmed"
          data?: TData
          diagnostic: ManagedSiteMutationDiagnostic
        },
  ): ManagedSiteMutationResult<TData, TEffect> {
    if (state.finished || typeof input !== "object" || input === null) {
      return invalidExecutionEvidence()
    }

    if (input.finalState === MANAGED_SITE_MUTATION_FINAL_STATES.Confirmed) {
      if (state.activeAttempt !== undefined || !hasOwn(input, "data")) {
        return invalidExecutionEvidence()
      }

      const result = {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: input.data,
        confirmedEffects: [...state.confirmedEffects],
      }
      assertManagedSiteMutationResult<TData, TEffect>(result, options)
      state.finished = true
      return result
    }

    if (input.finalState !== MANAGED_SITE_MUTATION_FINAL_STATES.Unconfirmed) {
      return invalidExecutionEvidence()
    }

    assertDiagnostic(input.diagnostic)

    if (state.activeAttempt !== undefined) {
      const activeAttempt = state.activeAttempt
      if (activeAttempt.effect !== undefined) {
        return invalidExecutionEvidence()
      }
      state.lastCompletion = getAttemptCompletion(activeAttempt)
      activeAttempt.completed = true
      state.activeAttempt = undefined
    }

    const completion =
      state.lastCompletion ??
      (state.confirmedEffects.length > 0
        ? MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain
        : MANAGED_SITE_MUTATION_COMPLETIONS.Rejected)

    const data =
      hasOwn(input, "data") && input.data !== undefined
        ? { data: input.data }
        : {}
    const result =
      state.confirmedEffects.length > 0
        ? {
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
            ...data,
            confirmedEffects: [...state.confirmedEffects] as [
              TEffect,
              ...TEffect[],
            ],
            completion,
            diagnostic: input.diagnostic,
          }
        : completion === MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain
          ? {
              outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
              diagnostic: input.diagnostic,
            }
          : {
              outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
              diagnostic: input.diagnostic,
            }

    assertManagedSiteMutationResult<TData, TEffect>(result, options)
    state.finished = true
    return result
  }

  return { beginStep, finish }
}

type SafePropertyRead =
  | { read: true; value: unknown }
  | { read: false; value?: never }

const safeReadProperty = (
  value: unknown,
  key: PropertyKey,
): SafePropertyRead => {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return { read: false }
  }

  try {
    return { read: true, value: Reflect.get(value, key) }
  } catch {
    return { read: false }
  }
}

const safeInstanceOfApiError = (value: unknown): boolean => {
  try {
    return value instanceof ApiError
  } catch {
    return false
  }
}

const apiErrorCodes = new Set<string>(Object.values(API_ERROR_CODES))
const transportErrorCodes = new Set(["ABORT_ERR", "ECONNABORTED", "ETIMEDOUT"])
const operationalErrorNames = new Set([
  "ApiError",
  "AbortError",
  "TimeoutError",
  "NetworkError",
])
const operationalMessagePattern =
  /\b(?:timed?\s*out|timeout|failed to fetch|fetch failed|network request failed|network error|networkerror when attempting to fetch resource|load failed)\b/i

const readStringProperty = (
  value: unknown,
  key: PropertyKey,
): string | undefined => {
  const property = safeReadProperty(value, key)
  return property.read && typeof property.value === "string"
    ? property.value
    : undefined
}

const readDiagnosticCode = (value: unknown): string | number | undefined => {
  const property = safeReadProperty(value, "code")
  if (!property.read) return undefined
  if (typeof property.value === "string" && property.value.length > 0) {
    return property.value
  }
  return typeof property.value === "number" &&
    Number.isSafeInteger(property.value)
    ? property.value
    : undefined
}

const readStatusCode = (value: unknown): number | undefined => {
  const property = safeReadProperty(value, "statusCode")
  return property.read &&
    typeof property.value === "number" &&
    Number.isSafeInteger(property.value) &&
    property.value >= 100 &&
    property.value <= 599
    ? property.value
    : undefined
}

const readSafeMessage = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.trim() ? value : undefined
  const message = readStringProperty(value, "message")
  return message?.trim() ? message : undefined
}

const isRecognizedTypedOperationalValue = (value: unknown): boolean => {
  if (safeInstanceOfApiError(value)) return true

  const name = readStringProperty(value, "name")
  const code = readDiagnosticCode(value)
  const statusCode = readStatusCode(value)

  if (name && operationalErrorNames.has(name)) return true
  if (
    typeof code === "string" &&
    (apiErrorCodes.has(code) || transportErrorCodes.has(code))
  ) {
    return true
  }
  return statusCode !== undefined
}

const isRecognizedTransportMessageValue = (value: unknown): boolean => {
  const message = readSafeMessage(value)
  if (!message || !operationalMessagePattern.test(message)) return false

  if (typeof value === "string") return true
  const name = readStringProperty(value, "name")
  return name === "TypeError" || name === undefined
}

const diagnosticFromCandidate = (
  candidate: unknown,
  raw: unknown,
  outerMessage: string | undefined,
): ManagedSiteMutationDiagnostic => {
  const message =
    readSafeMessage(candidate) ?? outerMessage ?? "Mutation failed"
  const code = readDiagnosticCode(candidate)
  const statusCode = readStatusCode(candidate)

  return {
    message,
    ...(code !== undefined ? { code } : {}),
    ...(statusCode !== undefined ? { statusCode } : {}),
    raw,
  }
}

/** Normalizes only recognized provider, protocol, and transport failures. */
export function toManagedSiteMutationDiagnostic(
  error: unknown,
): ManagedSiteMutationDiagnostic {
  const outerMessage = readSafeMessage(error)
  if (isRecognizedTypedOperationalValue(error)) {
    return diagnosticFromCandidate(error, error, outerMessage)
  }

  const seen = new WeakSet<object>()
  if (
    (typeof error === "object" && error !== null) ||
    typeof error === "function"
  ) {
    seen.add(error)
  }

  let current = error
  for (let depth = 0; depth < MAX_OPERATIONAL_CAUSE_DEPTH; depth += 1) {
    const causeRead = safeReadProperty(current, "cause")
    if (!causeRead.read) break
    const cause = causeRead.value
    if (
      (typeof cause === "object" && cause !== null) ||
      typeof cause === "function"
    ) {
      if (seen.has(cause)) break
      seen.add(cause)
    }

    if (
      isRecognizedTypedOperationalValue(cause) ||
      isRecognizedTransportMessageValue(cause)
    ) {
      return diagnosticFromCandidate(cause, error, outerMessage)
    }
    current = cause
  }

  if (outerMessage && operationalMessagePattern.test(outerMessage)) {
    return { message: outerMessage, raw: error }
  }

  throw error
}

export interface ManagedSiteMutationRequestObserver {
  onDispatch(): void
  onResponse(): void
}

export type ManagedSiteMutationStepRunResult<TData> =
  | { outcome: "applied"; data: TData }
  | {
      outcome: "rejected" | "uncertain"
      diagnostic: ManagedSiteMutationDiagnostic
    }

type ClassifierRecord = Record<string, unknown>

const readClassifierRecord = (value: unknown): ClassifierRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidExecutionEvidence()
  }

  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return invalidExecutionEvidence()
    }

    const descriptors = Object.getOwnPropertyDescriptors(value)
    const record = Object.create(null) as ClassifierRecord
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string" || !("value" in descriptors[key])) {
        return invalidExecutionEvidence()
      }
      record[key] = descriptors[key].value
    }
    return record
  } catch {
    return invalidExecutionEvidence()
  }
}

const hasExactKeys = (
  record: ClassifierRecord,
  expected: readonly string[],
) => {
  const keys = Object.keys(record)
  return (
    keys.length === expected.length &&
    expected.every((key) => hasOwn(record, key))
  )
}

/** Executes and classifies one provider-owned mutation request step. */
export async function runManagedSiteMutationStep<
  TEffect extends ManagedSiteMutationConfirmedEffect,
  TResponse,
  TData,
>(input: {
  sequence: ManagedSiteMutationSequence<TEffect>
  effect: NoInfer<TEffect>
  execute(observer: ManagedSiteMutationRequestObserver): Promise<TResponse>
  classifyResponse(
    response: TResponse,
  ):
    | { outcome: "applied"; data: TData }
    | { outcome: "rejected"; diagnostic: ManagedSiteMutationDiagnostic }
}): Promise<ManagedSiteMutationStepRunResult<TData>> {
  const attempt = input.sequence.beginStep()
  const executionState: { stage: AttemptStage } = {
    stage: ATTEMPT_STAGES.NotDispatched,
  }
  const observer: ManagedSiteMutationRequestObserver = {
    onDispatch() {
      attempt.markPossiblyDispatched()
      executionState.stage = ATTEMPT_STAGES.PossiblyDispatched
    },
    onResponse() {
      attempt.markResponseReceived()
      executionState.stage = ATTEMPT_STAGES.ResponseReceived
    },
  }

  const completeOperationalFailure = (
    error: unknown,
  ): Exclude<
    ManagedSiteMutationStepRunResult<TData>,
    { outcome: "applied" }
  > => {
    let diagnostic: ManagedSiteMutationDiagnostic
    try {
      diagnostic = toManagedSiteMutationDiagnostic(error)
    } catch {
      throw error
    }

    attempt.complete()
    return {
      outcome:
        executionState.stage === ATTEMPT_STAGES.NotDispatched
          ? MANAGED_SITE_MUTATION_OUTCOMES.Rejected
          : MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic,
    }
  }

  let response: TResponse
  try {
    response = await input.execute(observer)
  } catch (error) {
    return completeOperationalFailure(error)
  }

  if (executionState.stage !== ATTEMPT_STAGES.ResponseReceived) {
    return invalidExecutionEvidence()
  }

  let classifiedResponse: ReturnType<typeof input.classifyResponse>
  try {
    classifiedResponse = input.classifyResponse(response)
  } catch (error) {
    return completeOperationalFailure(error)
  }

  const classification = readClassifierRecord(classifiedResponse)
  if (
    classification.outcome === "applied" &&
    hasExactKeys(classification, ["outcome", "data"])
  ) {
    attempt.confirmEffect(input.effect)
    attempt.complete()
    return { outcome: "applied", data: classification.data as TData }
  }

  if (
    classification.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Rejected &&
    hasExactKeys(classification, ["outcome", "diagnostic"])
  ) {
    assertDiagnostic(classification.diagnostic)
    attempt.confirmNonApplication()
    attempt.complete()
    return {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: classification.diagnostic,
    }
  }

  return invalidExecutionEvidence()
}
