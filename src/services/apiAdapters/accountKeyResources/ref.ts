import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"

export type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"

const isBoundedString = (value: unknown, maximum: number): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maximum

export const isAccountKeyResourceRef = (
  value: unknown,
): value is AccountKeyResourceRef => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    isBoundedString(candidate.accountId, 512) &&
    isBoundedString(candidate.siteType, 128) &&
    isBoundedString(candidate.scopeKey, 2048) &&
    isBoundedString(candidate.resourceId, 512)
  )
}

/** Verifies a public opaque ref before any provider capability is accessed. */
export const isAccountKeyResourceRefFor = (
  value: unknown,
  expected: Pick<AccountKeyResourceRef, "accountId" | "siteType" | "scopeKey">,
): value is AccountKeyResourceRef =>
  isAccountKeyResourceRef(value) &&
  value.accountId === expected.accountId &&
  value.siteType === expected.siteType &&
  value.scopeKey === expected.scopeKey
