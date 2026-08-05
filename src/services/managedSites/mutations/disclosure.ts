import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

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
const REDACTED = "[REDACTED]"
const REDACTED_URL_REFERENCE = "[URL]"

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

const URL_WRAPPER_CLOSING_BY_OPENING: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
}

const splitUrlCandidate = (candidate: string, openingDelimiter: string) => {
  let urlText = candidate
  let trailing = ""
  const closingDelimiter = URL_WRAPPER_CLOSING_BY_OPENING[openingDelimiter]

  if (closingDelimiter) {
    const outsidePunctuation = urlText.match(/[,.;!?]*$/)?.[0] ?? ""
    const wrappedText = outsidePunctuation
      ? urlText.slice(0, -outsidePunctuation.length)
      : urlText

    if (wrappedText.endsWith(closingDelimiter)) {
      urlText = wrappedText.slice(0, -closingDelimiter.length)
      trailing = `${closingDelimiter}${outsidePunctuation}`
    }
  }

  // Once a query or fragment starts, trailing punctuation may be secret data.
  // Preserve it only when a matching wrapper proves that it is outside the URL.
  if (!/[?#]/.test(urlText)) {
    const trailingMatch = urlText.match(/[),.;!?]+$/)
    if (trailingMatch) {
      urlText = urlText.slice(0, -trailingMatch[0].length)
      trailing = `${trailingMatch[0]}${trailing}`
    }
  }

  return { trailing, urlText }
}

const sanitizeUrlCandidate = (candidate: string, openingDelimiter: string) => {
  const { trailing, urlText } = splitUrlCandidate(candidate, openingDelimiter)

  try {
    const schemeRelative = urlText.startsWith("//")
    const url = new URL(schemeRelative ? `https:${urlText}` : urlText)
    url.username = ""
    url.password = ""
    const sanitizedUrl = sanitizeUrlForLog(url.toString())
    return `${
      schemeRelative ? sanitizedUrl.replace(/^https:/, "") : sanitizedUrl
    }${trailing}`
  } catch {
    const withoutUserInfo = urlText.replace(
      /^((?:https?:)?\/\/)[^/@\s]+@/i,
      "$1",
    )
    return `${sanitizeUrlForLog(withoutUserInfo)}${trailing}`
  }
}

const COOKIE_FIELD_CORE = "cookie"

const SENSITIVE_FIELD_CORES = [
  "authorization",
  "auth",
  "key",
  "token",
  "secret",
  "credential",
  "password",
  "passwd",
  COOKIE_FIELD_CORE,
  "session",
  "jwt",
] as const

const toCanonicalFieldName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "")

// This predicate only receives parsed field names. At that syntactic boundary,
// fail closed on any canonical core match so removing an accepted separator
// cannot change classification; matching words in ordinary prose stay intact.
const isSensitiveFieldName = (name: string) => {
  const canonicalName = toCanonicalFieldName(name)
  return SENSITIVE_FIELD_CORES.some((core) => canonicalName.includes(core))
}

const URL_FIELD_NAME_MAX_LENGTH = 256

const decodeUrlFieldName = (name: string, inQuery: boolean) => {
  if (name.length > URL_FIELD_NAME_MAX_LENGTH) return null
  try {
    return decodeURIComponent(inQuery ? name.replace(/\+/g, " ") : name)
  } catch {
    return null
  }
}

const hasSensitiveUrlField = (candidate: string) => {
  const firstDelimiter = candidate.search(/[?#]/)
  if (firstDelimiter < 0) return false

  let fieldStart = firstDelimiter + 1
  let inQuery = candidate[firstDelimiter] === "?"
  for (let index = fieldStart; index <= candidate.length; index += 1) {
    const character = candidate[index]
    if (
      index !== candidate.length &&
      character !== "&" &&
      character !== ";" &&
      character !== "?" &&
      character !== "#"
    ) {
      continue
    }

    const field = candidate.slice(fieldStart, index)
    const separatorIndex = field.indexOf("=")
    if (separatorIndex >= 0) {
      const fieldName = decodeUrlFieldName(
        field.slice(0, separatorIndex),
        inQuery,
      )
      if (fieldName === null || isSensitiveFieldName(fieldName)) return true
    }

    if (character === "#") inQuery = false
    fieldStart = index + 1
  }

  return false
}

const isUrlFieldAssignment = (value: string, fieldStart: number) => {
  const currentReference =
    value.slice(0, fieldStart).match(/[^\s<>"`]*$/)?.[0] ?? ""
  return /[?#]/.test(currentReference)
}

const ASSIGNMENT_FIELD_MAX_SEGMENTS = 32
const ASSIGNMENT_QUOTED_SEGMENT_MAX_LENGTH = 256

// Keep field parsing linear and bounded; malformed recovery never crosses a
// line or assignment-list delimiter before consulting the shared classifier.
type AssignmentFieldMatch = {
  index: number
  fieldName: string
  forceSensitive: boolean
  separator: ":" | "="
  valueStart: number
}

const isAsciiLetter = (character: string | undefined) => {
  if (character === undefined) return false
  const code = character.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

const isAsciiDigit = (character: string | undefined) => {
  if (character === undefined) return false
  const code = character.charCodeAt(0)
  return code >= 48 && code <= 57
}

const isAssignmentIdentifierPart = (character: string | undefined) =>
  isAsciiLetter(character) ||
  isAsciiDigit(character) ||
  character === "_" ||
  character === "-"

const readAssignmentIdentifierEnd = (value: string, start: number) => {
  let cursor = start + 1
  while (cursor < value.length && isAssignmentIdentifierPart(value[cursor])) {
    cursor += 1
  }
  return cursor
}

type BracketSegmentMatch = {
  end: number | null
  forceSensitive: boolean
}

const readBracketSegment = (
  value: string,
  bracketStart: number,
): BracketSegmentMatch => {
  let cursor = bracketStart + 1
  if (value[cursor] === "]") {
    return { end: cursor + 1, forceSensitive: false }
  }

  const quote = value[cursor]
  if (quote === '"' || quote === "'") {
    cursor += 1
    const contentStart = cursor
    while (cursor < value.length) {
      const character = value[cursor]
      if (character === "\r" || character === "\n") {
        return {
          end: null,
          forceSensitive:
            cursor - contentStart > ASSIGNMENT_QUOTED_SEGMENT_MAX_LENGTH,
        }
      }
      if (character === "\\") {
        const nextCharacter = value[cursor + 1]
        if (
          nextCharacter === undefined ||
          nextCharacter === "\r" ||
          nextCharacter === "\n"
        ) {
          return {
            end: null,
            forceSensitive:
              cursor - contentStart > ASSIGNMENT_QUOTED_SEGMENT_MAX_LENGTH,
          }
        }
        cursor += 2
        continue
      }
      if (character === quote) {
        return {
          end: value[cursor + 1] === "]" ? cursor + 2 : null,
          forceSensitive:
            cursor - contentStart > ASSIGNMENT_QUOTED_SEGMENT_MAX_LENGTH,
        }
      }
      cursor += 1
    }
    return {
      end: null,
      forceSensitive:
        cursor - contentStart > ASSIGNMENT_QUOTED_SEGMENT_MAX_LENGTH,
    }
  }

  if (isAsciiDigit(value[cursor])) {
    while (cursor < value.length && isAsciiDigit(value[cursor])) cursor += 1
    return {
      end: value[cursor] === "]" ? cursor + 1 : null,
      forceSensitive: false,
    }
  }

  if (isAsciiLetter(value[cursor])) {
    cursor = readAssignmentIdentifierEnd(value, cursor)
    return {
      end: value[cursor] === "]" ? cursor + 1 : null,
      forceSensitive: false,
    }
  }

  return { end: null, forceSensitive: false }
}

const finishAssignmentFieldMatch = (
  value: string,
  index: number,
  fieldEnd: number,
  separatorIndex: number,
  forceSensitive: boolean,
): AssignmentFieldMatch | null => {
  const separator = value[separatorIndex]
  if (separator !== ":" && separator !== "=") return null

  let valueStart = separatorIndex + 1
  while (value[valueStart] === " " || value[valueStart] === "\t") {
    valueStart += 1
  }

  return {
    index,
    fieldName: value.slice(index, fieldEnd).trimEnd(),
    forceSensitive,
    separator,
    valueStart,
  }
}

const parseAssignmentFieldAt = (
  value: string,
  index: number,
): { match: AssignmentFieldMatch | null; resumeAt: number } => {
  let cursor = readAssignmentIdentifierEnd(value, index)
  let segmentCount = 0
  let malformed = false
  let lastSegmentWasBracket = false
  let forceSensitive = false

  while (value[cursor] === "." || value[cursor] === "[") {
    if (segmentCount >= ASSIGNMENT_FIELD_MAX_SEGMENTS) {
      malformed = true
      break
    }

    if (value[cursor] === ".") {
      if (!isAsciiLetter(value[cursor + 1])) {
        malformed = true
        break
      }
      cursor = readAssignmentIdentifierEnd(value, cursor + 1)
      lastSegmentWasBracket = false
    } else {
      const segment = readBracketSegment(value, cursor)
      forceSensitive ||= segment.forceSensitive
      if (segment.end === null) {
        malformed = true
        break
      }
      cursor = segment.end
      lastSegmentWasBracket = true
    }
    segmentCount += 1
  }

  if (
    !malformed &&
    (value[cursor] === "]" ||
      (lastSegmentWasBracket && isAssignmentIdentifierPart(value[cursor])))
  ) {
    malformed = true
  }

  if (malformed) {
    let recoveryCursor = cursor
    let quote: '"' | "'" | null = null
    while (
      recoveryCursor < value.length &&
      value[recoveryCursor] !== "\r" &&
      value[recoveryCursor] !== "\n"
    ) {
      const character = value[recoveryCursor]
      if (quote !== null) {
        if (character === "\\" && value[recoveryCursor + 1] !== undefined) {
          recoveryCursor += 2
          continue
        }
        if (character === "]") {
          quote = null
          forceSensitive = true
          recoveryCursor += 1
          continue
        }
        if (character === quote) quote = null
        recoveryCursor += 1
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
        recoveryCursor += 1
        continue
      }
      if (/[,;&]/.test(character)) break
      if (character === ":" || character === "=") {
        return {
          match: finishAssignmentFieldMatch(
            value,
            index,
            recoveryCursor,
            recoveryCursor,
            forceSensitive,
          ),
          resumeAt: recoveryCursor + 1,
        }
      }
      recoveryCursor += 1
    }
    return { match: null, resumeAt: recoveryCursor }
  }

  let separatorIndex = cursor
  while (value[separatorIndex] === " " || value[separatorIndex] === "\t") {
    separatorIndex += 1
  }
  return {
    match: finishAssignmentFieldMatch(
      value,
      index,
      cursor,
      separatorIndex,
      forceSensitive,
    ),
    resumeAt: Math.max(index + 1, cursor),
  }
}

const findNextAssignmentField = (value: string, fromIndex: number) => {
  let index = fromIndex
  while (index < value.length) {
    if (
      isAsciiLetter(value[index]) &&
      !isAssignmentIdentifierPart(value[index - 1])
    ) {
      const parsed = parseAssignmentFieldAt(value, index)
      if (parsed.match !== null) return parsed.match
      index = Math.max(index + 1, parsed.resumeAt)
      continue
    }
    index += 1
  }
  return null
}

const readLineEnd = (value: string, start: number) => {
  let index = start
  while (
    index < value.length &&
    value[index] !== "\r" &&
    value[index] !== "\n"
  ) {
    index += 1
  }
  return index
}

const readStructuredValueEnd = (value: string, start: number) => {
  let index = start
  while (index < value.length && !/[,;&\r\n]/.test(value[index])) index += 1
  return index
}

const toCanonicalAssignmentLeafName = (fieldName: string) => {
  const segmentStart = Math.max(
    fieldName.lastIndexOf("."),
    fieldName.lastIndexOf("["),
  )
  return toCanonicalFieldName(fieldName.slice(segmentStart + 1))
}

const hasWholeLineSensitiveValue = (match: AssignmentFieldMatch) => {
  const fieldName = toCanonicalAssignmentLeafName(match.fieldName)
  return (
    fieldName.includes("auth") ||
    fieldName.includes(COOKIE_FIELD_CORE) ||
    fieldName.includes("credential") ||
    (fieldName.includes("private") && fieldName.includes("key"))
  )
}

const redactCredentialAssignments = (value: string) => {
  let cursor = 0
  let searchIndex = 0
  let output = ""
  let match: AssignmentFieldMatch | null

  while ((match = findNextAssignmentField(value, searchIndex)) !== null) {
    if (
      isUrlFieldAssignment(value, match.index) ||
      (!match.forceSensitive && !isSensitiveFieldName(match.fieldName))
    ) {
      searchIndex = Math.max(match.valueStart, match.index + 1)
      continue
    }

    output += value.slice(cursor, match.index)
    output += value.slice(match.index, match.valueStart)

    const { valueStart } = match
    const wholeLineSensitiveValue = hasWholeLineSensitiveValue(match)
    const authorizationScheme = value
      .slice(valueStart)
      .match(/^(?:Bearer|Basic)\s+/i)?.[0]
    if (wholeLineSensitiveValue) {
      const valueEnd = readLineEnd(value, valueStart)
      output += authorizationScheme
        ? `${authorizationScheme}${REDACTED}`
        : REDACTED
      cursor = valueEnd
      searchIndex = valueEnd
      continue
    }

    const quote = value[valueStart]
    if (quote === '"' || quote === "'") {
      let valueEnd = valueStart + 1

      while (valueEnd < value.length) {
        const character = value[valueEnd]
        if (character === "\r" || character === "\n") {
          break
        }
        if (character === "\\") {
          const nextCharacter = value[valueEnd + 1]
          valueEnd +=
            nextCharacter === undefined ||
            nextCharacter === "\r" ||
            nextCharacter === "\n"
              ? 1
              : 2
          continue
        }
        valueEnd += 1
        if (character === quote) {
          break
        }
      }

      output += `${quote}${REDACTED}${quote}`
      cursor = valueEnd
      searchIndex = valueEnd
      continue
    }

    if (authorizationScheme) {
      const valueEnd = readStructuredValueEnd(
        value,
        valueStart + authorizationScheme.length,
      )
      output += `${authorizationScheme}${REDACTED}`
      cursor = valueEnd
      searchIndex = valueEnd
      continue
    }

    const valueEnd = readStructuredValueEnd(value, valueStart)
    output += REDACTED
    cursor = valueEnd
    searchIndex = valueEnd
  }

  return output + value.slice(cursor)
}

const sanitizeRelativeUrlCandidate = (
  candidate: string,
  openingDelimiter: string,
) => {
  const { trailing, urlText: reference } = splitUrlCandidate(
    candidate,
    openingDelimiter,
  )

  return `${sanitizeUrlForLog(reference) || REDACTED_URL_REFERENCE}${trailing}`
}

// The first group captures the nearest non-URL-token delimiter. The lookahead
// makes quote and parenthesis wrappers retry as that delimiter instead of path.
const RELATIVE_URL_CANDIDATE_PATTERN =
  /(^|[^A-Za-z0-9._~%/-])(?!['(])((?:(?:\.{1,2}\/|\/)(?:[A-Za-z0-9._~!$&()*+,;=:@%'-]+(?:\/[A-Za-z0-9._~!$&()*+,;=:@%'-]+)*)?|[A-Za-z0-9._~!$&()*+,;=:@%'-]+(?:\/[A-Za-z0-9._~!$&()*+,;=:@%'-]+)*)?[?#][^\s<>"`]+)/gi

const isBase64UrlCharacter = (character: string | undefined) =>
  isAssignmentIdentifierPart(character)

const isJoseCompactCharacter = (character: string | undefined) =>
  isBase64UrlCharacter(character) || character === "."

const JOSE_PROTECTED_HEADER_MAX_ENCODED_LENGTH = 2_048
const JOSE_PROTECTED_HEADER_MAX_DECODED_LENGTH = 1_536

type JoseProtectedHeaderClassification =
  | { status: "valid"; hasEncryption: boolean }
  | { status: "invalid" }
  | { status: "oversized" }

const INVALID_JOSE_PROTECTED_HEADER = { status: "invalid" } as const
const OVERSIZED_JOSE_PROTECTED_HEADER = { status: "oversized" } as const

const hasOwnNonEmptyString = (value: object, field: string) => {
  const fieldValue = (value as Record<string, unknown>)[field]
  return (
    Object.prototype.hasOwnProperty.call(value, field) &&
    typeof fieldValue === "string" &&
    fieldValue.trim().length > 0
  )
}

const decodeJoseProtectedHeader = (
  encoded: string,
): JoseProtectedHeaderClassification => {
  if (encoded.length === 0) return INVALID_JOSE_PROTECTED_HEADER
  if (encoded.length > JOSE_PROTECTED_HEADER_MAX_ENCODED_LENGTH) {
    return OVERSIZED_JOSE_PROTECTED_HEADER
  }
  if (encoded.length % 4 === 1) return INVALID_JOSE_PROTECTED_HEADER

  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const binary = globalThis.atob(padded)
    if (binary.length > JOSE_PROTECTED_HEADER_MAX_DECODED_LENGTH) {
      return OVERSIZED_JOSE_PROTECTED_HEADER
    }

    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    )
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return INVALID_JOSE_PROTECTED_HEADER
    }
    if (!hasOwnNonEmptyString(parsed, "alg")) {
      return INVALID_JOSE_PROTECTED_HEADER
    }

    return {
      status: "valid",
      hasEncryption: hasOwnNonEmptyString(parsed, "enc"),
    }
  } catch {
    return INVALID_JOSE_PROTECTED_HEADER
  }
}

const getJoseCompactRedactionEnd = (candidate: string) => {
  const dotOffsets: number[] = []
  let searchFrom = 0
  while (dotOffsets.length < 5) {
    const offset = candidate.indexOf(".", searchFrom)
    if (offset < 0) break
    dotOffsets.push(offset)
    searchFrom = offset + 1
  }

  if (dotOffsets.length < 2 || dotOffsets[0] === 0) return null
  const protectedHeader = decodeJoseProtectedHeader(
    candidate.slice(0, dotOffsets[0]),
  )
  if (protectedHeader.status === "invalid") return null

  const fifthSegmentStart = (dotOffsets[3] ?? -1) + 1
  const fifthSegmentEnd = dotOffsets[4] ?? candidate.length
  const joseEnd =
    (protectedHeader.status === "oversized" || protectedHeader.hasEncryption) &&
    dotOffsets.length >= 4 &&
    fifthSegmentEnd > fifthSegmentStart
      ? fifthSegmentEnd
      : dotOffsets[2] ?? candidate.length

  for (let index = joseEnd; index < candidate.length; index += 1) {
    if (isBase64UrlCharacter(candidate[index])) return candidate.length
  }
  return joseEnd
}

const redactJoseCompactTokens = (value: string) => {
  let cursor = 0
  let index = 0
  let output = ""

  while (index < value.length) {
    if (
      !isBase64UrlCharacter(value[index]) ||
      isJoseCompactCharacter(value[index - 1])
    ) {
      index += 1
      continue
    }

    const candidateStart = index
    while (isJoseCompactCharacter(value[index])) index += 1
    const candidate = value.slice(candidateStart, index)
    const redactionEnd = getJoseCompactRedactionEnd(candidate)
    if (redactionEnd === null) continue

    output += value.slice(cursor, candidateStart)
    output += REDACTED
    cursor = candidateStart + redactionEnd
  }

  return output + value.slice(cursor)
}

const redactStructuralSecrets = (value: string) =>
  redactJoseCompactTokens(
    redactCredentialAssignments(value)
      .replace(
        /(^|[^A-Za-z0-9+.-])((?:https?:[\\/]{2}|\/\/)[^\s<>"`]+)/gi,
        (_match, prefix: string, url: string) =>
          `${prefix}${sanitizeUrlCandidate(url.replaceAll("\\", "/"), prefix)}`,
      )
      .replace(
        RELATIVE_URL_CANDIDATE_PATTERN,
        (_match, prefix: string, reference: string) =>
          hasSensitiveUrlField(reference)
            ? `${prefix}${sanitizeRelativeUrlCandidate(reference, prefix)}`
            : `${prefix}${reference}`,
      ),
  ).replace(
    /(^|[^A-Za-z0-9_-])(?:(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}|(?:api[_-]?key|token)[_-][A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/gi,
    `$1${REDACTED}`,
  )

const sanitizePrivateText = (value: string, knownSecrets: readonly string[]) =>
  redactStructuralSecrets(toSanitizedErrorSummary(value, [...knownSecrets]))

/** Safely projects an arbitrary thrown value for a private user-facing sink. */
export function toPrivateManagedSiteThrownErrorMessage(
  error: unknown,
  options: { knownSecrets: readonly string[] },
): string | undefined {
  try {
    const message = redactStructuralSecrets(
      toSanitizedErrorSummary(error, [...options.knownSecrets]),
    )
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
