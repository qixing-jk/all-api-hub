import { ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { useDevUnlocked } from "~/utils/core/devMode"

/** Keep provenance available without competing with the financial values. */
export function FinancialObservationDetails({
  children,
}: {
  children: ReactNode
}) {
  const { t } = useTranslation("account")
  const devUnlocked = useDevUnlocked()
  if (!devUnlocked) return null
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="inline-flex cursor-pointer items-center gap-1 rounded-sm py-0.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-open:rotate-180"
        />
        {t("financial.technicalDetails")}
      </summary>
      <div className="mt-2 space-y-1 rounded-md bg-muted/30 px-3 py-2 leading-relaxed break-words">
        {children}
      </div>
    </details>
  )
}
