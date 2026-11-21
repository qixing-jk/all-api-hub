import type { TFunction } from "i18next"

import type { EvidenceRef, UsageScope } from "~/services/amounts/balance"
import {
  EVIDENCE_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"

/** Shared details retain the named restriction dimensions instead of flattening them into a warning. */
export function formatBalanceScope(
  scope: UsageScope,
  t: TFunction,
  includeUnknown = false,
): string[] {
  const labels = {
    projects: t("balanceHistory:native.dimensions.projects"),
    keys: t("balanceHistory:native.dimensions.keys"),
    models: t("balanceHistory:native.dimensions.models"),
    groups: t("balanceHistory:native.dimensions.groups"),
    routes: t("balanceHistory:native.dimensions.routes"),
  }
  return (["projects", "keys", "models", "groups", "routes"] as const).flatMap(
    (dimension) => {
      const selection = scope[dimension]
      return !selection ||
        selection.kind === SCOPE_SELECTION_KINDS.All ||
        (!includeUnknown && selection.kind === SCOPE_SELECTION_KINDS.Unknown)
        ? []
        : [
            t("balanceHistory:native.restrictions", {
              dimension: labels[dimension],
              value:
                selection.kind === SCOPE_SELECTION_KINDS.Restricted
                  ? selection.ids.join(", ") || "∅"
                  : t("account:financial.scopeUnknown"),
            }),
          ]
    },
  )
}

/** Provenance names describe upstream contracts and field names, never wallet IDs. */
export function formatBalanceSource(
  source: EvidenceRef,
  t: TFunction,
  includeTechnical = false,
): string {
  const kind =
    source.kind === EVIDENCE_KINDS.Derived
      ? t("account:financial.derived")
      : source.kind === EVIDENCE_KINDS.Manual
        ? t("account:financial.manual")
        : source.kind === EVIDENCE_KINDS.Legacy
          ? t("account:financial.olderRecord")
          : t("account:financial.reported")
  return includeTechnical
    ? `${kind} · ${source.adapter}/${source.operation}@${source.contractVersion}${source.inputs?.length ? ` · ${source.inputs.join(", ")}` : ""}`
    : kind
}
