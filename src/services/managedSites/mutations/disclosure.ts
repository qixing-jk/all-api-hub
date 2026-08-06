import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"

import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationCompletion,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationOutcome,
  type ManagedSiteMutationResult,
} from "./contracts"

const PRIVATE_MESSAGE_MAX_LENGTH = 4_096
const PRIVATE_STRING_CODE_MAX_LENGTH = 256

export const MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES = {
  Succeeded: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  Rejected: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  Partial: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
  Uncertain: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
} as const

export type ManagedSiteMutationControlledCategory =
  (typeof MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES)[keyof typeof MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES]

type ManagedSiteMutationProjectedOutcome =
  | { outcome: "succeeded"; completion?: never }
  | { outcome: "rejected"; completion?: never }
  | { outcome: "partial"; completion: "rejected" | "uncertain" }
  | { outcome: "uncertain"; completion?: never }

declare const privateMutationOutputBrand: unique symbol
declare const persistedMutationStateBrand: unique symbol
declare const externalMutationSummaryBrand: unique symbol

export type ManagedSitePrivateMutationOutput =
  ManagedSiteMutationProjectedOutcome & {
    statusCode?: number
    code?: string | number
    message?: string
    readonly [privateMutationOutputBrand]: true
  }

export type ManagedSitePersistedMutationState =
  ManagedSiteMutationProjectedOutcome & {
    category?: ManagedSiteMutationControlledCategory
    readonly [persistedMutationStateBrand]: true
  }

export type ManagedSiteExternalMutationSummary =
  ManagedSiteMutationProjectedOutcome & {
    category?: ManagedSiteMutationControlledCategory
    readonly [externalMutationSummaryBrand]: true
  }

type DisclosureRecord = {
  keys: readonly string[]
  values: Record<string, unknown>
}

const outcomeValues = new Set<string>(
  Object.values(MANAGED_SITE_MUTATION_OUTCOMES),
)
const completionValues = new Set<string>(
  Object.values(MANAGED_SITE_MUTATION_COMPLETIONS),
)
const categoryValues = new Set<string>(
  Object.values(MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES),
)
const controlledCategoryByOutcome: Record<
  ManagedSiteMutationOutcome,
  ManagedSiteMutationControlledCategory
> = {
  [MANAGED_SITE_MUTATION_OUTCOMES.Succeeded]:
    MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES.Succeeded,
  [MANAGED_SITE_MUTATION_OUTCOMES.Rejected]:
    MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES.Rejected,
  [MANAGED_SITE_MUTATION_OUTCOMES.Partial]:
    MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES.Partial,
  [MANAGED_SITE_MUTATION_OUTCOMES.Uncertain]:
    MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES.Uncertain,
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

const isDataPropertyDescriptor = (
  descriptor: PropertyDescriptor,
): descriptor is PropertyDescriptor & { value: unknown } =>
  "value" in descriptor

const readDisclosureRecord = (
  value: unknown,
  allowedKeys: readonly string[],
): DisclosureRecord | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  try {
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
      if (!isDataPropertyDescriptor(descriptor) || !descriptor.enumerable) {
        return null
      }

      keys.push(key)
      values[key] = descriptor.value
    }

    return { keys, values }
  } catch {
    return null
  }
}

const isSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value)

const isValidStatusCode = (value: unknown): value is number =>
  isSafeInteger(value) && value >= 100 && value <= 599

const isValidNumericCode = (value: unknown): value is number =>
  isSafeInteger(value)

const isValidString = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.length <= maxLength

const isOptionalDefined = (record: DisclosureRecord, key: string) =>
  !hasOwn(record.values, key) || record.values[key] !== undefined

const hasValidProjectedOutcome = (record: DisclosureRecord): boolean => {
  if (
    !hasOwn(record.values, "outcome") ||
    typeof record.values.outcome !== "string" ||
    !outcomeValues.has(record.values.outcome)
  ) {
    return false
  }

  if (record.values.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    return (
      hasOwn(record.values, "completion") &&
      typeof record.values.completion === "string" &&
      completionValues.has(record.values.completion)
    )
  }

  return !hasOwn(record.values, "completion")
}

const invalidDisclosureValue = (boundary: string): never => {
  throw new TypeError(`Invalid managed site ${boundary}`)
}

const copyProjectedOutcome = (
  record: DisclosureRecord,
): ManagedSiteMutationProjectedOutcome => {
  if (record.values.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    return {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      completion: record.values.completion as ManagedSiteMutationCompletion,
    }
  }

  return {
    outcome: record.values.outcome,
  } as ManagedSiteMutationProjectedOutcome
}

const projectMutationOutcome = <
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  result: ManagedSiteMutationResult<TData, TEffect>,
): ManagedSiteMutationProjectedOutcome => {
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    return { outcome: result.outcome, completion: result.completion }
  }

  return { outcome: result.outcome }
}

const truncateAtCodePointBoundary = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value
  }

  let length = 0
  let result = ""
  for (const codePoint of value) {
    if (length + codePoint.length > maxLength) {
      break
    }
    result += codePoint
    length += codePoint.length
  }
  return result
}

const sanitizePrivateText = (value: unknown, knownSecrets: readonly string[]) =>
  sanitizeSensitiveErrorText(toSanitizedErrorSummary(value, [...knownSecrets]))

/** Safely projects an arbitrary thrown value for a private user-facing sink. */
export function toPrivateManagedSiteThrownErrorMessage(
  error: unknown,
  options: { knownSecrets: readonly string[] },
): string | undefined {
  try {
    const message = sanitizePrivateText(error, options.knownSecrets)
    return message
      ? truncateAtCodePointBoundary(message, PRIVATE_MESSAGE_MAX_LENGTH)
      : undefined
  } catch {
    return undefined
  }
}

/** Projects a mutation result into the private, safely redacted sink shape. */
export function toPrivateManagedSiteMutationOutput<
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  result: ManagedSiteMutationResult<TData, TEffect>,
  options: { knownSecrets: readonly string[] },
): ManagedSitePrivateMutationOutput {
  const output: Record<string, unknown> = projectMutationOutcome(result)
  const message =
    result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
      ? result.message
      : result.diagnostic.message

  if (message !== undefined) {
    output.message = truncateAtCodePointBoundary(
      sanitizePrivateText(message, options.knownSecrets),
      PRIVATE_MESSAGE_MAX_LENGTH,
    )
  }

  if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    const { code, statusCode } = result.diagnostic
    if (isValidStatusCode(statusCode)) {
      output.statusCode = statusCode
    }
    if (isValidNumericCode(code)) {
      output.code = code
    } else if (typeof code === "string") {
      const sanitizedCode = sanitizePrivateText(code, options.knownSecrets)
      if (sanitizedCode.length <= PRIVATE_STRING_CODE_MAX_LENGTH) {
        output.code = sanitizedCode
      }
    }
  }

  return output as ManagedSitePrivateMutationOutput
}

const projectControlledSummary = <
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  result: ManagedSiteMutationResult<TData, TEffect>,
) => ({
  ...projectMutationOutcome(result),
  // Categories deliberately mirror only the provider-neutral outcome vocabulary.
  category: controlledCategoryByOutcome[result.outcome],
})

/** Projects a mutation result into its minimal persisted state. */
export function toManagedSitePersistedMutationState<
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  result: ManagedSiteMutationResult<TData, TEffect>,
): ManagedSitePersistedMutationState {
  return projectControlledSummary(result) as ManagedSitePersistedMutationState
}

/** Projects a mutation result into its minimal external summary. */
export function toManagedSiteExternalMutationSummary<
  TData,
  TEffect extends ManagedSiteMutationConfirmedEffect,
>(
  result: ManagedSiteMutationResult<TData, TEffect>,
): ManagedSiteExternalMutationSummary {
  return projectControlledSummary(result) as ManagedSiteExternalMutationSummary
}

/** Validates and rebrands an untrusted private mutation output. */
export function parsePrivateManagedSiteMutationOutput(
  value: unknown,
): ManagedSitePrivateMutationOutput {
  const record = readDisclosureRecord(value, [
    "outcome",
    "completion",
    "statusCode",
    "code",
    "message",
  ])
  if (
    record === null ||
    !hasValidProjectedOutcome(record) ||
    !isOptionalDefined(record, "statusCode") ||
    !isOptionalDefined(record, "code") ||
    !isOptionalDefined(record, "message") ||
    (hasOwn(record.values, "statusCode") &&
      !isValidStatusCode(record.values.statusCode)) ||
    (hasOwn(record.values, "code") &&
      !isValidNumericCode(record.values.code) &&
      !isValidString(record.values.code, PRIVATE_STRING_CODE_MAX_LENGTH)) ||
    (hasOwn(record.values, "message") &&
      !isValidString(record.values.message, PRIVATE_MESSAGE_MAX_LENGTH))
  ) {
    return invalidDisclosureValue("private mutation output")
  }

  const output: Record<string, unknown> = copyProjectedOutcome(record)
  for (const key of ["statusCode", "code", "message"] as const) {
    if (hasOwn(record.values, key)) {
      output[key] = record.values[key]
    }
  }
  return output as ManagedSitePrivateMutationOutput
}

const parseControlledSummary = (
  value: unknown,
  boundary: string,
): ManagedSiteMutationProjectedOutcome & {
  category?: ManagedSiteMutationControlledCategory
} => {
  const record = readDisclosureRecord(value, [
    "outcome",
    "completion",
    "category",
  ])
  if (
    record === null ||
    !hasValidProjectedOutcome(record) ||
    !isOptionalDefined(record, "category") ||
    (hasOwn(record.values, "category") &&
      (typeof record.values.category !== "string" ||
        !categoryValues.has(record.values.category) ||
        record.values.category !== record.values.outcome))
  ) {
    return invalidDisclosureValue(boundary)
  }

  const output: Record<string, unknown> = copyProjectedOutcome(record)
  if (hasOwn(record.values, "category")) {
    output.category = record.values.category
  }
  return output as ManagedSiteMutationProjectedOutcome & {
    category?: ManagedSiteMutationControlledCategory
  }
}

/** Validates and rebrands an untrusted persisted mutation state. */
export function parseManagedSitePersistedMutationState(
  value: unknown,
): ManagedSitePersistedMutationState {
  return parseControlledSummary(
    value,
    "persisted mutation state",
  ) as ManagedSitePersistedMutationState
}

/** Validates and rebrands an untrusted external mutation summary. */
export function parseManagedSiteExternalMutationSummary(
  value: unknown,
): ManagedSiteExternalMutationSummary {
  return parseControlledSummary(
    value,
    "external mutation summary",
  ) as ManagedSiteExternalMutationSummary
}
