import {
  MANAGED_RESOURCE_KINDS,
  type ManagedResourceKind,
} from "~/services/accountSiteDefinitions/contracts"

export const MANAGED_SITE_MUTATION_OUTCOMES = {
  Succeeded: "succeeded",
  Rejected: "rejected",
  Partial: "partial",
  Uncertain: "uncertain",
} as const

export type ManagedSiteMutationOutcome =
  (typeof MANAGED_SITE_MUTATION_OUTCOMES)[keyof typeof MANAGED_SITE_MUTATION_OUTCOMES]

export const MANAGED_SITE_MUTATION_COMPLETIONS = {
  Rejected: "rejected",
  Uncertain: "uncertain",
} as const

export type ManagedSiteMutationCompletion =
  (typeof MANAGED_SITE_MUTATION_COMPLETIONS)[keyof typeof MANAGED_SITE_MUTATION_COMPLETIONS]

export const MANAGED_SITE_MUTATION_EFFECT_KINDS = {
  ResourceCreated: "resource-created",
  ResourceUpdated: "resource-updated",
  ResourceDeleted: "resource-deleted",
  StatusUpdated: "status-updated",
  ModelsUpdated: "models-updated",
  ModelMappingUpdated: "model-mapping-updated",
} as const

export type ManagedSiteMutationEffectKind =
  (typeof MANAGED_SITE_MUTATION_EFFECT_KINDS)[keyof typeof MANAGED_SITE_MUTATION_EFFECT_KINDS]

export const MANAGED_SITE_MUTATION_DISPATCH_STATES = {
  NotDispatched: "not-dispatched",
  Dispatched: "dispatched",
} as const

export type ManagedSiteMutationDispatchState =
  (typeof MANAGED_SITE_MUTATION_DISPATCH_STATES)[keyof typeof MANAGED_SITE_MUTATION_DISPATCH_STATES]

export const MANAGED_SITE_MUTATION_FINAL_STATES = {
  Confirmed: "confirmed",
  Unconfirmed: "unconfirmed",
} as const

export type ManagedSiteMutationFinalState =
  (typeof MANAGED_SITE_MUTATION_FINAL_STATES)[keyof typeof MANAGED_SITE_MUTATION_FINAL_STATES]

export interface ManagedSiteMutationDiagnostic {
  message: string
  code?: string | number
  statusCode?: number
  raw?: unknown
}

export interface ManagedSiteMutationConfirmedEffect {
  kind: ManagedSiteMutationEffectKind
  resourceKind: ManagedResourceKind | "channel"
  resourceId?: string | number
}

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

export interface ManagedSiteMutationSucceeded<
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
  data: TData
  confirmedEffects: readonly TEffect[]
  message?: string
}

export interface ManagedSiteMutationRejected {
  outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Rejected
  diagnostic: ManagedSiteMutationDiagnostic
}

export interface ManagedSiteMutationPartial<
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
> {
  outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Partial
  data?: TData
  confirmedEffects: NonEmptyReadonlyArray<TEffect>
  completion: ManagedSiteMutationCompletion
  diagnostic: ManagedSiteMutationDiagnostic
}

export interface ManagedSiteMutationUncertain {
  outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Uncertain
  diagnostic: ManagedSiteMutationDiagnostic
}

export type ManagedSiteMutationResult<
  TData = void,
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
> =
  | ManagedSiteMutationSucceeded<TData, TEffect>
  | ManagedSiteMutationRejected
  | ManagedSiteMutationPartial<TData, TEffect>
  | ManagedSiteMutationUncertain

export type ManagedSiteVoidMutationResult<
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
> = ManagedSiteMutationResult<void, TEffect>

export type ManagedSiteResourceMutationResult<
  TResource,
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
> = ManagedSiteMutationResult<TResource, TEffect>

const outcomeValues = new Set<string>(
  Object.values(MANAGED_SITE_MUTATION_OUTCOMES),
)
const completionValues = new Set<string>(
  Object.values(MANAGED_SITE_MUTATION_COMPLETIONS),
)
const effectKindValues = new Set<string>(
  Object.values(MANAGED_SITE_MUTATION_EFFECT_KINDS),
)
const resourceKindValues = new Set<string>(
  Object.values(MANAGED_RESOURCE_KINDS),
)

type ContractRecord = {
  keys: readonly string[]
  values: Record<string, unknown>
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

const isDataPropertyDescriptor = (
  descriptor: PropertyDescriptor,
): descriptor is PropertyDescriptor & { value: unknown } =>
  "value" in descriptor

const readContractRecord = (
  value: unknown,
  allowedKeys: readonly string[],
): ContractRecord | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return null
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys: string[] = []
  const values = Object.create(null) as Record<string, unknown>

  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowedKeys.includes(key)) {
      return null
    }

    const descriptor = descriptors[key]
    if (!isDataPropertyDescriptor(descriptor)) {
      return null
    }

    keys.push(key)
    values[key] = descriptor.value
  }

  return { keys, values }
}

const hasOnlyContractKeys = (
  record: ContractRecord,
  allowedKeys: readonly string[],
) => record.keys.every((key) => allowedKeys.includes(key))

const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0

const isOptionalDefined = (record: ContractRecord, key: string) =>
  !hasOwn(record.values, key) || record.values[key] !== undefined

const isDiagnostic = (
  value: unknown,
): value is ManagedSiteMutationDiagnostic => {
  const diagnostic = readContractRecord(value, [
    "message",
    "code",
    "statusCode",
    "raw",
  ])
  if (
    diagnostic === null ||
    !hasOwn(diagnostic.values, "message") ||
    typeof diagnostic.values.message !== "string" ||
    !isOptionalDefined(diagnostic, "code") ||
    !isOptionalDefined(diagnostic, "statusCode") ||
    !isOptionalDefined(diagnostic, "raw")
  ) {
    return false
  }

  if (
    hasOwn(diagnostic.values, "code") &&
    typeof diagnostic.values.code !== "string" &&
    !isSafeInteger(diagnostic.values.code)
  ) {
    return false
  }

  return (
    !hasOwn(diagnostic.values, "statusCode") ||
    (isSafeInteger(diagnostic.values.statusCode) &&
      diagnostic.values.statusCode >= 100 &&
      diagnostic.values.statusCode <= 599)
  )
}

const isConfirmedEffect = (
  value: unknown,
): value is ManagedSiteMutationConfirmedEffect => {
  const effect = readContractRecord(value, [
    "kind",
    "resourceKind",
    "resourceId",
  ])
  if (
    effect === null ||
    !hasOwn(effect.values, "kind") ||
    !hasOwn(effect.values, "resourceKind") ||
    !isOptionalDefined(effect, "resourceId") ||
    typeof effect.values.kind !== "string" ||
    !effectKindValues.has(effect.values.kind) ||
    typeof effect.values.resourceKind !== "string" ||
    !resourceKindValues.has(effect.values.resourceKind)
  ) {
    return false
  }

  return (
    !hasOwn(effect.values, "resourceId") ||
    isNonEmptyString(effect.values.resourceId) ||
    isSafeInteger(effect.values.resourceId)
  )
}

const hasConfirmedEffects = (value: unknown): value is readonly unknown[] => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return false
  }

  const descriptors: Record<string, PropertyDescriptor> =
    Object.getOwnPropertyDescriptors(value)
  const lengthDescriptor = descriptors.length
  if (
    !isDataPropertyDescriptor(lengthDescriptor) ||
    !isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    Reflect.ownKeys(descriptors).length !== lengthDescriptor.value + 1
  ) {
    return false
  }

  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)]
    if (
      descriptor === undefined ||
      !isDataPropertyDescriptor(descriptor) ||
      !isConfirmedEffect(descriptor.value)
    ) {
      return false
    }
  }

  return true
}

const invalidMutationResult = (): never => {
  throw new TypeError("Invalid managed site mutation result")
}

/**
 * Validates the provider-neutral mutation envelope at runtime.
 *
 * Generic arguments express compile-time expectations; their data-specific schemas are not validated here.
 */
export function assertManagedSiteMutationResult<
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  value: unknown,
  options: { idempotent: boolean },
): asserts value is ManagedSiteMutationResult<TData, TEffect> {
  const result = readContractRecord(value, [
    "outcome",
    "data",
    "confirmedEffects",
    "message",
    "diagnostic",
    "completion",
  ])

  if (result === null) {
    return invalidMutationResult()
  }

  const outcome = result.values.outcome
  if (
    !hasOwn(result.values, "outcome") ||
    typeof outcome !== "string" ||
    !outcomeValues.has(outcome)
  ) {
    return invalidMutationResult()
  }

  switch (outcome) {
    case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
      if (
        !hasOnlyContractKeys(result, [
          "outcome",
          "data",
          "confirmedEffects",
          "message",
        ]) ||
        !hasOwn(result.values, "data") ||
        !hasOwn(result.values, "confirmedEffects") ||
        !hasConfirmedEffects(result.values.confirmedEffects) ||
        !isOptionalDefined(result, "message") ||
        (hasOwn(result.values, "message") &&
          typeof result.values.message !== "string") ||
        // A succeeded outcome embodies authoritative final-state confirmation.
        (result.values.confirmedEffects.length === 0 &&
          options.idempotent !== true)
      ) {
        invalidMutationResult()
      }
      return
    case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
    case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
      if (
        !hasOnlyContractKeys(result, ["outcome", "diagnostic"]) ||
        !hasOwn(result.values, "diagnostic") ||
        !isDiagnostic(result.values.diagnostic)
      ) {
        invalidMutationResult()
      }
      return
    case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
      if (
        !hasOnlyContractKeys(result, [
          "outcome",
          "data",
          "confirmedEffects",
          "completion",
          "diagnostic",
        ]) ||
        !isOptionalDefined(result, "data") ||
        !hasOwn(result.values, "confirmedEffects") ||
        !hasConfirmedEffects(result.values.confirmedEffects) ||
        result.values.confirmedEffects.length === 0 ||
        !hasOwn(result.values, "completion") ||
        typeof result.values.completion !== "string" ||
        !completionValues.has(result.values.completion) ||
        !hasOwn(result.values, "diagnostic") ||
        !isDiagnostic(result.values.diagnostic)
      ) {
        invalidMutationResult()
      }
      return
  }
}
