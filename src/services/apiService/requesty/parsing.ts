/**
 * Requesty response validation.
 *
 * Numeric fields are documented as `format: decimal` numbers but observed as
 * JSON strings on the live deployment (2026-10-21); both representations are
 * accepted so a later server-side normalization cannot break parsing.
 */

import { isRecord } from "~/utils/core/object"

/** Reads a decimal that the deployment may encode as string or number. */
export const readDecimal = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined

/**
 * Reads Requesty's error envelope.
 * Observed: `{"error":{"origin":"api-v2","message":"Invalid authorization token"}}`.
 */
export const readRequestyError = (
  body: unknown,
): { message?: string } | undefined => {
  if (!isRecord(body)) return undefined
  const error = body.error
  if (!isRecord(error)) return undefined
  const message = readString(error.message)
  return message !== undefined ? { message } : {}
}
