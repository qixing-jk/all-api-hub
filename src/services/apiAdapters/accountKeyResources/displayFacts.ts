import type {
  AccountKeyDisplayFact,
  AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { normalizeToMs } from "~/utils/core/formatters"

/** Reads explicit management permission without guessing from credential role. */
export function hasAccountKeyManagementPermission(
  facts: Pick<AccountKeyResourceFacts, "displayFacts"> | null | undefined,
): boolean {
  return Boolean(
    facts?.displayFacts?.some(
      (fact) =>
        fact.kind === "permission" && fact.role === "manage" && fact.granted,
    ),
  )
}

/** Normalize provider-compatible epoch seconds/ms or ISO expiry at the adapter boundary. */
export function keyExpiryDisplayFact(
  fieldId: string,
  value: number | string,
): AccountKeyDisplayFact {
  const never = typeof value === "number" ? value <= 0 : value.trim() === ""
  return {
    fieldId,
    kind: "expiry",
    timestampMs: never ? "never" : normalizeToMs(value),
  }
}

/** Missing or invalid native last-use values must not imply an actual use. */
export function keyLastUsedDisplayFacts(
  value: unknown,
): AccountKeyDisplayFact[] {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return []
  const timestampMs = normalizeToMs(value)
  return timestampMs === null
    ? []
    : [{ fieldId: "accessed_time", kind: "last-used", timestampMs }]
}
