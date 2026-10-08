import { normalizeToMs } from "~/utils/core/formatters"

/** Normalize the timestamp variants returned by token-compatible providers. */
export function projectTokenCreatedAt(token: {
  created_time?: number
  createdAt?: number | string
  created_at?: number | string
}): number | undefined {
  return (
    normalizeToMs(token.createdAt ?? token.created_at ?? token.created_time) ??
    undefined
  )
}
