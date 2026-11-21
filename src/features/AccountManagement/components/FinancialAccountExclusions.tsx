import { useTranslation } from "react-i18next"

import { CollapsibleSection } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

/** Names stay in the local details panel. Share snapshots contain aggregate figures. */
export function FinancialAccountExclusions<Reason extends string>({
  sites,
  entries,
  labels,
}: {
  sites: DisplaySiteData[]
  entries: { accountId: string; reasons: readonly Reason[] }[]
  labels: Record<Reason, string>
}) {
  const { t } = useTranslation("account")
  if (!entries.length) return null
  const names = new Map(sites.map((site) => [site.id, site.name]))

  return (
    <CollapsibleSection
      title={
        <>
          {t("financial.exclusions.heading")}{" "}
          <span className="text-muted-foreground tabular-nums">
            ({entries.length})
          </span>
        </>
      }
      buttonClassName="px-0 font-medium"
      panelClassName="mt-1 border-0 bg-transparent px-0 py-0"
    >
      <ul className="space-y-2.5 pb-1">
        {entries.map(({ accountId, reasons }) => (
          <li key={accountId} className="space-y-0.5 break-words">
            <p className="font-medium">{names.get(accountId)}</p>
            <p className="text-muted-foreground">
              {[...new Set(reasons.map((reason) => labels[reason]))].join(
                " · ",
              )}
            </p>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  )
}
