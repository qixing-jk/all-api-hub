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
      <div className="inline-flex max-w-full items-center gap-1.5 border-l border-gray-200 pl-3 text-xs dark:border-gray-700">
        <span className="text-gray-500 dark:text-gray-400">
          {t("managedSiteStatus.label")}
        </span>
        {status}
      </div>
    )
  }
  return (
    <div className="inline-flex max-w-full items-center border-l border-gray-200 pl-2 dark:border-gray-700">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto min-w-0 gap-1.5 px-1 py-0.5 text-xs"
            data-testid="managed-site-status-details"
          >
            <span className="shrink-0 font-normal text-gray-500 dark:text-gray-400">
              {t("managedSiteStatus.label")}
            </span>
            {status}
            <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="dark:bg-dark-bg-secondary w-80 max-w-[calc(100vw-2rem)] bg-white p-3"
          aria-label={t("managedSiteStatus.label")}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            {children}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
