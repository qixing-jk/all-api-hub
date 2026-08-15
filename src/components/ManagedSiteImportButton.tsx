import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { IconButton } from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import { cn } from "~/lib/utils"

interface ManagedSiteImportButtonProps {
  managedSiteType: ManagedSiteType
  managedSiteLabel: string
  onImport: () => void | Promise<void>
  buttonRef?: Ref<HTMLButtonElement>
  testId?: string
  highlighted?: boolean
}

/** Renders the configured managed site as a prioritized direct import action. */
export function ManagedSiteImportButton({
  managedSiteType,
  managedSiteLabel,
  onImport,
  buttonRef,
  testId,
  highlighted = false,
}: ManagedSiteImportButtonProps) {
  const { t } = useTranslation("keyManagement")
  const label = t("actions.importToManagedSite", {
    site: managedSiteLabel,
  })

  return (
    <IconButton
      ref={buttonRef}
      aria-label={label}
      title={label}
      size="sm"
      variant="ghost"
      data-testid={testId}
      data-guidance-highlight={highlighted ? "true" : undefined}
      className={cn(
        highlighted &&
          "ring-2 ring-emerald-500 ring-offset-2 dark:ring-emerald-400",
      )}
      onClick={(event) => {
        event.stopPropagation()
        void onImport()
      }}
    >
      <ManagedSiteIcon siteType={managedSiteType} size="sm" />
    </IconButton>
  )
}
