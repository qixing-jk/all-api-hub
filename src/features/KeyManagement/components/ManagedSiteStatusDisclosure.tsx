import { ChevronDown } from "lucide-react"
import { Children, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"

/** Keeps managed-site evidence separate from key attributes without adding a row. */
export function ManagedSiteStatusDisclosure({
  status,
  children,
}: {
  status: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation("keyManagement")
  if (Children.toArray(children).length === 0) {
    return (
      <div className="border-border gap-y-density-1-5 inline-flex max-w-full items-center gap-x-1.5 border-l pl-3 text-xs">
        <span className="text-muted-foreground">
          {t("managedSiteStatus.label")}
        </span>
        {status}
      </div>
    )
  }
  return (
    <div className="border-border inline-flex max-w-full items-center border-l pl-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-y-density-1-5 h-auto min-h-(--density-control-xs) min-w-0 gap-x-1.5 px-1 py-0.5 text-xs"
            data-testid="managed-site-status-details"
          >
            <span className="text-muted-foreground shrink-0 font-normal">
              {t("managedSiteStatus.label")}
            </span>
            {status}
            <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="bg-card py-density-3 w-80 max-w-[calc(100vw-2rem)] px-3"
          aria-label={t("managedSiteStatus.label")}
        >
          <div className="text-muted-foreground dark:text-secondary-foreground gap-y-density-2 flex flex-wrap items-center gap-x-2 text-xs">
            {children}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
