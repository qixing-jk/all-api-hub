import type { buildPricingDiagnostics } from "./pricingDiagnostics"

export type PricingDiagnosticRow = ReturnType<
  typeof buildPricingDiagnostics
>["rows"][number]
export const PRICING_DIAGNOSTIC_GROUPINGS = {
  ORIGIN: "origin",
  GROUP: "group",
  NONE: "none",
} as const
export type PricingDiagnosticGrouping =
  (typeof PRICING_DIAGNOSTIC_GROUPINGS)[keyof typeof PRICING_DIAGNOSTIC_GROUPINGS]

/** Match URLs by origin; ordinary words can match different diagnostic fields. */
export function matchesPricingDiagnosticSearch(
  row: PricingDiagnosticRow,
  search: string,
): boolean {
  const text = [
    row.model,
    row.source.name,
    row.source.origin,
    row.group,
    row.status,
    row.unit,
    ...row.issues.map((issue) =>
      issue.meter ? `${issue.code}:${issue.meter}` : issue.code,
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => {
      const candidate = /^https?:\/\//i.test(part)
        ? part
        : /^(?:localhost|(?:[a-z\d-]+\.)+[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?\//i.test(
              part,
            )
          ? `https://${part}`
          : undefined
      if (candidate) {
        try {
          const url = new URL(candidate)
          const origin = row.source.origin
            ? new URL(row.source.origin)
            : undefined
          return /^https?:\/\//i.test(part)
            ? origin?.origin === url.origin
            : origin?.host === url.host
        } catch {
          return false
        }
      }
      return text.includes(part.toLowerCase())
    })
}

/** Group filtered records before applying any display limit, so no site disappears. */
export function groupPricingDiagnosticRows(
  rows: readonly PricingDiagnosticRow[],
  grouping: PricingDiagnosticGrouping,
) {
  const groups = new Map<
    string,
    { key: string; label: string | undefined; rows: PricingDiagnosticRow[] }
  >()
  for (const row of rows) {
    const label =
      grouping === PRICING_DIAGNOSTIC_GROUPINGS.ORIGIN
        ? row.source.origin
        : grouping === PRICING_DIAGNOSTIC_GROUPINGS.GROUP
          ? row.group
          : undefined
    const key = label === undefined ? "missing" : `value:${label}`
    const group = groups.get(key) ?? { key, label, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.rows.length - a.rows.length ||
      (a.label ?? "").localeCompare(b.label ?? ""),
  )
}
