import type {
  ApiResponseErrorDecoder,
  ApiTransportResponse,
  DecodedApiResponseError,
} from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

const readMessageString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const MAX_HEURISTIC_MESSAGE_LENGTH = 2000
const MIN_ENCODED_PAYLOAD_LENGTH = 80
const CREDENTIAL_ASSIGNMENT_PATTERN =
  /\b(?:authorization|proxy[\s_-]?authorization|(?:set[\s_-]?)?cookie|credential|session|token|access[\s_-]?token|refresh[\s_-]?token|admin[\s_-]?token|key|api[\s_-]?key|password|passwd|secret|client[\s_-]?secret|management[\s_-]?key)\s*[:=]\s*\S+/i

const readGenericMessageString = (value: unknown): string | undefined => {
  const message = readMessageString(value)
  if (!message || message.length > MAX_HEURISTIC_MESSAGE_LENGTH)
    return undefined
  if (CREDENTIAL_ASSIGNMENT_PATTERN.test(message)) return undefined
  if (/^https?:\/\/\S+$/i.test(message)) return undefined
  if (/<\s*(?:!doctype|html|body|script)\b/i.test(message)) return undefined
  if (
    /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(message)
  ) {
    return undefined
  }
  if (
    message.length >= MIN_ENCODED_PAYLOAD_LENGTH &&
    /^[A-Za-z0-9+/=_-]+$/.test(message)
  ) {
    return undefined
  }
  return message
}

const HEURISTIC_MESSAGE_KEY_PRIORITY = new Map([
  ["message", 7],
  ["msg", 6],
  ["error_description", 5],
  ["detail", 4],
  ["error", 3],
  ["reason", 2],
  ["title", 1],
])
const MAX_HEURISTIC_DEPTH = 4
const MAX_HEURISTIC_INSPECTIONS = 100

const isSensitiveHeuristicKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (
    normalized === "key" ||
    normalized.includes("apikey") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("credential") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("session") ||
    normalized.includes("token")
  )
}

type HeuristicMessageCandidate = {
  message: string
  keyPriority: number
  depth: number
}

type HeuristicQueueEntry = {
  value: object
  depth: number
}

const preferHeuristicCandidate = (
  current: HeuristicMessageCandidate | undefined,
  candidate: HeuristicMessageCandidate,
): HeuristicMessageCandidate => {
  if (!current) return candidate
  if (candidate.keyPriority !== current.keyPriority) {
    return candidate.keyPriority > current.keyPriority ? candidate : current
  }
  if (candidate.keyPriority > 0 && candidate.depth !== current.depth) {
    return candidate.depth < current.depth ? candidate : current
  }
  return candidate.message.length > current.message.length ? candidate : current
}

/** Keeps only bounded scalar provider codes suitable for shared errors. */
export const readSafeUpstreamCode = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const code = String(value).trim()
  return code.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(code) ? code : undefined
}

/** Recovers a likely message from an already-confirmed HTTP error body. */
export function extractHeuristicResponseErrorMessage(
  body: unknown,
): string | undefined {
  const scalarMessage = readGenericMessageString(body)
  if (scalarMessage) return scalarMessage
  if (!body || typeof body !== "object") return undefined

  const queue: HeuristicQueueEntry[] = [{ value: body, depth: 0 }]
  const visited = new Set<object>()
  let inspectedValues = 0
  let best: HeuristicMessageCandidate | undefined

  const inspectEntry = (
    current: HeuristicQueueEntry,
    key: string,
    value: unknown,
  ) => {
    const sensitiveKey = isSensitiveHeuristicKey(key)
    const priority = HEURISTIC_MESSAGE_KEY_PRIORITY.get(key.toLowerCase())
    const maySelect = !sensitiveKey
    const message = maySelect ? readGenericMessageString(value) : undefined
    if (message) {
      best = preferHeuristicCandidate(best, {
        message,
        keyPriority: priority ?? 0,
        depth: current.depth,
      })
    }

    if (
      !sensitiveKey &&
      current.depth < MAX_HEURISTIC_DEPTH &&
      value &&
      typeof value === "object"
    ) {
      queue.push({
        value,
        depth: current.depth + 1,
      })
    }
  }

  while (queue.length && inspectedValues < MAX_HEURISTIC_INSPECTIONS) {
    const current = queue.shift()!
    if (visited.has(current.value)) continue
    visited.add(current.value)

    if (Array.isArray(current.value)) {
      for (
        let index = 0;
        index < current.value.length &&
        inspectedValues < MAX_HEURISTIC_INSPECTIONS;
        index += 1
      ) {
        inspectedValues += 1
        if (!(index in current.value)) continue
        inspectEntry(current, String(index), current.value[index])
      }
      continue
    }

    for (const key in current.value) {
      if (inspectedValues >= MAX_HEURISTIC_INSPECTIONS) break
      if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue

      inspectedValues += 1
      inspectEntry(
        current,
        key,
        (current.value as Record<string, unknown>)[key],
      )
    }
  }

  return best?.message
}

/** Applies only the selected provider decoder, without disclosure policy. */
export function resolveResponseErrorDetails(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  providerDecoder?: ApiResponseErrorDecoder,
): DecodedApiResponseError | null {
  const providerDetails = providerDecoder?.(response, { endpoint }) ?? null
  if (!providerDetails) return null

  const message = getErrorMessage(providerDetails.message)
  return {
    kind: providerDetails.kind,
    ...(message ? { message } : {}),
    ...(providerDetails.upstreamCode
      ? { upstreamCode: providerDetails.upstreamCode }
      : {}),
  }
}
