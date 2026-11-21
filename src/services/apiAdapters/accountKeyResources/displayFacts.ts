import {
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_EXPIRY_STATES,
  ACCOUNT_KEY_PERMISSION_ROLES,
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  type AccountKeyDisplayFact,
  type AccountKeyResourceFacts,
  type AccountKeyResourceStatus,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { normalizeToMs } from "~/utils/core/formatters"

/** Coverage follows the canonical status after the provider has resolved expiry and native state. */
export function keyProvisioningCoverage(status: AccountKeyResourceStatus) {
  switch (status) {
    case ACCOUNT_KEY_RESOURCE_STATUSES.Enabled:
      return ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable
    case ACCOUNT_KEY_RESOURCE_STATUSES.Disabled:
    case ACCOUNT_KEY_RESOURCE_STATUSES.Expired:
      return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable
    default:
      return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown
  }
}

/** Reads explicit management permission without guessing from credential role. */
export function hasAccountKeyManagementPermission(
  facts: Pick<AccountKeyResourceFacts, "displayFacts"> | null | undefined,
): boolean {
  return Boolean(
    facts?.displayFacts?.some(
      (fact) =>
        fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Permission &&
        fact.role === ACCOUNT_KEY_PERMISSION_ROLES.Manage &&
        fact.granted,
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
    kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Expiry,
    timestampMs: never ? ACCOUNT_KEY_EXPIRY_STATES.Never : normalizeToMs(value),
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
    : [
        {
          fieldId: "accessed_time",
          kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.LastUsed,
          timestampMs,
        },
      ]
}
